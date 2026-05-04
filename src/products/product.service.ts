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


@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
  ) {}


  async findAll(store: Store, query: PaginateQuery = {}) {
    const { page, limit, offset } = this.resolvePagination(query);

    const [products, total] = await this.em.findAndCount(Product,
      { store },
      {
        populate: ['images'],
        fields: ['id', 'name', 'price'],
        limit,
        offset,
      },
    );

    return {
      data: serialize(products, { populate: ['images'] }),
      meta: this.buildMeta(page, limit, total),
    };
  }


  async searchByName(store: Store, name: string, query: PaginateQuery = {}) {
    const { page, limit, offset } = this.resolvePagination(query);

    const [products, total] = await this.em.findAndCount(Product,
      {
        store,
        name: { $ilike: `%${name}%` },
      },
      {
        populate: ['images'],
        limit,
        offset,
      },
    );

    return {
      data: serialize(products, { populate: ['images'] }),
      meta: this.buildMeta(page, limit, total),
    };
  }


  async searchByCategory(store: Store, categoryName: string, query: PaginateQuery = {}) {
    const { page, limit, offset } = this.resolvePagination(query);

    const [products, total] = await this.em.findAndCount(Product,
      {
        store,
        categories: {
          name: { $ilike: `%${categoryName}%` },
        },
      },
      {
        populate: ['images', 'categories'],
        limit,
        offset,
      },
    );

    return {
      data: serialize(products, { populate: ['categories', 'images'] }),
      meta: this.buildMeta(page, limit, total),
    };
  }


  async create(store: Store, dto: CreateProductDto) {
    const category = await this.em.findOne(Category, {
      name: dto.categoryName,
      store,
    });

    if (!category)
      throw new NotFoundException(`Category not found: ${dto.categoryName}`);

    const product = this.em.create(Product, stripUndefined({
      name: dto.name,
      scannerId: dto.scannerId,
      price: dto.price,
      store,
    }));

    product.categories.add(category);

    await this.em.persistAndFlush(product);

    return wrap(product).toJSON();
  }


  async update(id: string, dto: UpdateProductDto) {
    const product = await this.em.findOne(
      Product,
      { id },
      { populate: ['categories', 'images'] },
    );

    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    this.em.assign(product, stripUndefined({
      name: dto.name,
      scannerId: dto.scannerId,
      price: dto.price,
    }));

    await this.em.flush();

    return { message: `Product with id [${product.id}] updated successfully.` };
  }

  
  async remove(store: Store, id: string) {
    const product = await this.em.findOne(
      Product,
      { id, store },
      { populate: ['categories', 'images'] },
    );

    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    for (const image of product.images.getItems()) {
      if (image.imageUrl)
        await this.minioService.deleteFile(image.imageUrl);
    }

    const attachments = await this.em.findAll(Attachment, {
      where: {
        entityId: id,
        entityType: AttachmentEntityType.PRODUCT,
      },
    });

    for (const attachment of attachments) {
      if (attachment.imageUrl)
        await this.minioService.deleteFile(attachment.imageUrl);
    }

    await this.em.removeAndFlush(product);
    return { message: `Product ${id} deleted successfully` };
  }

  async uploadProductImage(file: any): Promise<{ id: string }> {
    return this.attachmentService.createAttachment(AttachmentEntityType.PRODUCT, file);
  }

  async claimProductImage(attachmentId: string, productId: string): Promise<ProductImage> {
    const product = await this.em.findOne(Product, { id: productId });
    if (!product)
      throw new NotFoundException(`Product with id ${productId} not found`);

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




  private resolvePagination(query: PaginateQuery) {
    const page = Math.max(1, Number(query.page ?? 1));
    const itemsPerPage = Math.min(Math.max(1, Number(query.itemsPerPage ?? 20)), 100);
    const offset = (page - 1) * itemsPerPage;
    
    return { page, limit: itemsPerPage, offset };
  }

  private buildMeta(page: number, limit: number, total: number) {
    return {
      currentPage: page,
      itemsPerPage: limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit),
    };
  }
}