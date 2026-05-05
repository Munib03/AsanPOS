import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize, wrap } from '@mikro-orm/postgresql';
import { Product } from '../database/entites/product.entity';
import { ProductImage } from '../database/entites/product-image.entity';
import { Category } from '../database/entites/category.entity';
import { Attachment } from '../database/entites/attachment.entity';
import { Store } from '../database/entites/store.entity';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentService } from '../shared/services/attachment.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { ProductRepository } from './product.repository';


@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
    private readonly productRepository: ProductRepository,
  ) {}


  async findAll(store: Store, query: PaginateQuery) {
    const [products, meta] = await this.productRepository.findAndPaginate(
      { store },
      {
        populate: ['images'],
        fields: ['id', 'name', 'price', 'images.imageUrl']
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
    const category = await this.em.findOne(Category, {
      name: dto.categoryName,
      store,
    });

    if (!category)
      throw new NotFoundException(`Category not found: ${dto.categoryName}`);

    const product = this.em.create(Product, {
      ...stripUndefined({
        name: dto.name,
        scannerId: dto.scannerId,
        price: dto.price,
      }),
      store,
    });

    product.categories.add(category);

    await this.em.persistAndFlush(product);

    return wrap(product).toJSON();
  }


  async update(store: Store, id: string, dto: UpdateProductDto) {
    const product = await this.productRepository.findOneOrFail(
      { id, store },
      {
        populate: ['categories', 'images'],
        notFoundMessage: `Product with id ${id} not found`,
      },
    );

    this.em.assign(product, stripUndefined({
      name: dto.name,
      scannerId: dto.scannerId,
      price: dto.price,
    }));

    if (dto.categoryName) {
      const category = await this.em.findOne(Category, {
        name: dto.categoryName,
        store,
      });

      if (!category)
        throw new NotFoundException(`Category not found: ${dto.categoryName}`);

      product.categories.set([category]);
    }

    await this.em.flush();

    return { message: `Product with id [${product.id}] updated successfully.` };
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


  async uploadProductImages(files: any[]): Promise<{ ids: string[] }> {
    const results = await Promise.all(
      files.map(file => this.attachmentService.createAttachment(AttachmentEntityType.PRODUCT, file))
    );
    
    return { ids: results.map(r => r.id) };
  }


  async claimProductImages(attachmentIds: string[], productId: string): Promise<ProductImage[]> {
    const product = await this.productRepository.findOneOrFail(
      { id: productId },
      { notFoundMessage: `Product with id ${productId} not found` },
    );

    const productImages = await Promise.all(
      attachmentIds.map(async (attachmentId) => {
        const attachment = await this.attachmentService.claimAttachment(
          attachmentId,
          productId,
          AttachmentEntityType.PRODUCT,
        );

        const productImage = this.em.create(ProductImage, {
          product,
          imageUrl: attachment.imageUrl,
        });

        await this.em.persistAndFlush(productImage);

        if (productImage.imageUrl)
          productImage.imageUrlSigned = await this.minioService.getSignedUrl(productImage.imageUrl);

        return productImage;
      }),
    );

    return productImages;
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