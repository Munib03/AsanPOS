import { Injectable, NotFoundException } from '@nestjs/common';
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
import * as QRCode from 'qrcode';


@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
    private readonly productRepository: BaseRepository<Product>,
  ) { }


  async findAll(store: Store, query: PaginateQuery) {
    const [products, meta] = await this.productRepository.findAndPaginate(
      { store },
      {
        populate: ['images', 'categories'],
        fields: ['id', 'name', 'price', 'images.imageUrl', 'categories.id', 'categories.name'],
      },
      {
        searchable: ['name', 'categories.name'],
      },
      query,
    );

    return {
      data: serialize(products, { populate: ['images', 'categories'] }),
      meta,
    };
  }


  async findOne(store: Store, id: string) {
    const product = await this.productRepository.findOneOrFail(
      { id, store },
      {
        populate: ['images', 'categories'],
        fields: ['id', 'name', 'price', 'images.imageUrl', 'categories.id', 'categories.name'],
        notFoundMessage: `Product with id ${id} not found`,
      },
    );

    return serialize(product, { populate: ['images', 'categories'] });
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

    if (dto.attachmentIds?.length) {
      await this.attachmentService.claimAttachments(
        dto.attachmentIds,
        product.id,
        AttachmentEntityType.PRODUCT,
      );

      const attachments = await this.em.findAll(Attachment, {
        where: { id: { $in: dto.attachmentIds } },
      });

      attachments.map((attachment) =>
        this.em.create(ProductImage, {
          product,
          imageUrl: attachment.imageUrl,
        }),
      );
    }

    await this.em.persistAndFlush(product);

    return { message: "Product created Successfully!" }
  }


  async update(store: Store, id: string, dto: UpdateProductDto) {
    const product = await this.productRepository.findOneOrFail(
      { id, store },
      {
        populate: ['categories', 'images'],
        notFoundMessage: `Product with id ${id} not found`,
      },
    );

    this.em.assign(
      product,
      stripUndefined({
        name: dto.name,
        scannerId: dto.scannerId,
        price: dto.price,
      }),
    );

    if (dto.categoryName) {
      const category = await this.em.findOne(Category, {
        name: dto.categoryName,
        store,
      });

      if (!category)
        throw new NotFoundException(
          `Category not found: ${dto.categoryName}`,
        );

      product.categories.set([category]);
    }

    if (dto.attachmentIds?.length) {
      await this.attachmentService.claimAttachments(
        dto.attachmentIds,
        product.id,
        AttachmentEntityType.PRODUCT,
      );

      const attachments = await this.em.findAll(Attachment, {
        where: { id: { $in: dto.attachmentIds } },
      });

      attachments.map((attachment) =>
        this.em.create(ProductImage, {
          product,
          imageUrl: attachment.imageUrl,
        }),
      );
    }

    await this.em.flush();

    return {
      message: `Product with id [${product.id}] updated successfully.`,
    };
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

      await em.removeAndFlush(attachments);
      await em.removeAndFlush(product);
    });

    return { message: `Product ${id} deleted successfully` };
  }


  async deleteProductImage(imageId: string): Promise<{ message: string }> {
    const image = await this.em.findOne(ProductImage, { id: imageId });
    if (!image)
      throw new NotFoundException('Image not found');

    if (image.imageUrl)
      await this.attachmentService.deleteAttachmentByUrl(
        image.imageUrl,
        AttachmentEntityType.PRODUCT,
      );

    await this.em.removeAndFlush(image);

    return { message: 'Image deleted successfully' };
  }





  async generateQrCode(store: Store, id: string): Promise<{ qrcode: string }> {
    const product = await this.productRepository.findOneOrFail(
      { id, store },
      { notFoundMessage: `Product with id ${id} not found` },
    );

    const qrcode = await QRCode.toDataURL(JSON.stringify({
      id: product.id,
      name: product.name,
      price: product.price,
    }));

    return { qrcode: qrcode };
  }
}