import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager, serialize, wrap } from '@mikro-orm/postgresql';
import { Product } from '../database/entites/product.entity';
import { ProductImage } from '../database/entites/product-image.entity';
import { Category } from '../database/entites/category.entity';
import { Attachment } from '../database/entites/attachment.entity';
import { Store } from '../database/entites/store.entity';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentService } from '../attachments/attachment.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { BaseRepository } from '../shared/repositories/base.repository';

@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
    private readonly productRepository: BaseRepository<Product>,
  ) {}

  async findAll(store: Store, query: PaginateQuery) {
    const [products, meta] = await this.productRepository.findAndPaginate(
      { store },
      {
        populate: ['images'],
        fields: ['id', 'name', 'price', 'images.imageUrl'],
      },
      {
        searchable: ['name', 'categories.name'],
        sortable: ['name', 'price'],
      },
      query,
    );

    return {
      data: serialize(products, { populate: ['images'] }),
      meta,
    };
  }


  async create(store: Store, dto: CreateProductDto) {
    return this.em.transactional(async (em) => {
      const category = await em.findOne(Category, {
        name: dto.categoryName,
        store,
      });

      if (!category)
        throw new NotFoundException(`Category not found: ${dto.categoryName}`);

      const product = em.create(Product, {
        ...stripUndefined({
          name: dto.name,
          scannerId: dto.scannerId,
          price: dto.price,
        }),
        store,
      });

      product.categories.add(category);

      if (dto.attachmentIds?.length) {
        const attachments = await em.findAll(Attachment, {
          where: {
            id: { $in: dto.attachmentIds },
            entityType: AttachmentEntityType.PRODUCT,
            claimedAt: null,
          },
        });

        if (attachments.length !== dto.attachmentIds.length)
          throw new UnprocessableEntityException('One or more attachments not found or already claimed');

        const now = new Date();
        attachments.map((attachment) => {
          attachment.entityId = product.id;
          attachment.claimedAt = now;
          em.create(ProductImage, { product, imageUrl: attachment.imageUrl });
        });
      }

      await em.persistAndFlush(product);

      return wrap(product).toJSON();
    });
  }


async update(store: Store, id: string, dto: UpdateProductDto) {
  return this.em.transactional(async (em) => {
    const product = await this.productRepository.findOneOrFail(
      { id, store },
      {
        populate: ['categories', 'images'],
        notFoundMessage: `Product with id ${id} not found`,
      },
    );

    em.assign(product, stripUndefined({
      name: dto.name,
      scannerId: dto.scannerId,
      price: dto.price,
    }));

    if (dto.categoryName) {
      const category = await em.findOne(Category, {
        name: dto.categoryName,
        store,
      });

      if (!category)
        throw new NotFoundException(`Category not found: ${dto.categoryName}`);

      product.categories.set([category]);
    }

    if (dto.attachmentIds?.length) {
      await this.attachmentService.claimAttachments(
        dto.attachmentIds,
        product.id,
        AttachmentEntityType.PRODUCT,
      );

      const attachments = await em.findAll(Attachment, {
        where: { id: { $in: dto.attachmentIds } },
      });

      attachments.map((attachment) =>
        em.create(ProductImage, { product, imageUrl: attachment.imageUrl }),
      );
    }

    await em.flush();

    return { message: `Product with id [${product.id}] updated successfully.` };
  });
}


  async remove(store: Store, id: string) {
    await this.em.transactional(async (em) => {
      const product = await this.productRepository.findOneOrFail(
        { id, store },
        {
          populate: ['categories', 'images'],
          notFoundMessage: `Product with id ${id} not found`,
        },
      );

      for (const image of product.images.getItems())
        if (image.imageUrl)
          await this.minioService.deleteFile(image.imageUrl);

      const attachments = await em.findAll(Attachment, {
        where: {
          entityId: id,
          entityType: AttachmentEntityType.PRODUCT,
        },
      });

      for (const attachment of attachments)
        if (attachment.imageUrl)
          await this.minioService.deleteFile(attachment.imageUrl);

      await em.removeAndFlush(product);
    });

    return { message: `Product ${id} deleted successfully` };
  }

  async deleteProductImage(imageId: string): Promise<{ message: string }> {
    const image = await this.em.findOne(ProductImage, { id: imageId });
    if (!image)
      throw new NotFoundException('Image not found');

    const attachment = await this.em.findOne(Attachment, {
      imageUrl: image.imageUrl,
      entityType: AttachmentEntityType.PRODUCT,
    });

    if (attachment)
      await this.em.removeAndFlush(attachment);

    if (image.imageUrl)
      await this.minioService.deleteFile(image.imageUrl);

    await this.em.removeAndFlush(image);

    return { message: 'Image deleted successfully' };
  }
}