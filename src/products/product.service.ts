import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Product } from '../database/entites/product.entity';
import { Category } from '../database/entites/category.entity';
import { Attachment } from '../database/entites/attachment.entity';
import { Store } from '../database/entites/store.entity';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';


@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
  ) {}

  
  async findAll(store: Store) {
    const categories = await this.em.findAll(Category, {
      where: { store },
      populate: ['products'],
    });

    const productSet = new Map<string, Product>();
    for (const category of categories) {
      for (const product of category.products.getItems()) {
        if (!productSet.has(product.id))
          productSet.set(product.id, product);
      }
    }

    const products = Array.from(productSet.values());
    
    return products;
  }


  async create(store: Store, dto: CreateProductDto) {
    const product = this.em.create(Product, stripUndefined({
      name: dto.name,
      price: dto.price,
    }));

    const category = await this.em.findOne(Category, {
      name: dto.categoryName,
      store,
    });

    if (!category) 
      throw new NotFoundException(`Category not found: ${dto.categoryName}`);
    

    product.categories.add(category);

    await this.em.persistAndFlush(product);

    return this.formatProduct(product);
  }


  async update(store: Store, id: string, dto: UpdateProductDto) {
    const product = await this.em.findOne(Product, { id }, { populate: ['categories'] });
    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    this.em.assign(product, stripUndefined({
      name: dto.name,
      scannerId: dto.scannerId,
      price: dto.price,
    }));

    if (dto.categoryIds) {
      const categories = await this.em.findAll(Category, {
        where: { id: { $in: dto.categoryIds }, store },
      });
      product.categories.set(categories);
    }

    await this.em.flush();
    return this.formatProduct(product);
  }


  async remove(store: Store, id: string) {
    const product = await this.em.findOne(Product, { id }, { populate: ['categories'] });
    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    const attachment = await this.em.findOne(Attachment, {
      entityId: id,
      entityType: AttachmentEntityType.PRODUCT,
    });

    if (attachment) {
      if (attachment.imageUrl)
        await this.minioService.deleteFile(attachment.imageUrl);
      await this.em.removeAndFlush(attachment);
    }

    await this.em.removeAndFlush(product);
    return { message: `Product ${id} deleted successfully` };
  }
  


  private async getSignedImageUrl(productId: string): Promise<string | null> {
      try {
        const attachment = await this.em.findOne(Attachment, {
          entityId: productId,
          entityType: AttachmentEntityType.PRODUCT,
          claimedAt: { $ne: null },
        });
        if (attachment?.imageUrl)
          return await this.minioService.getSignedUrl(attachment.imageUrl);
        return null;
      } catch {
        return null;
      }
  }


  private async formatProduct(product: Product) {
    const imageUrl = await this.getSignedImageUrl(product.id);
    return {
      id: product.id,
      name: product.name ?? null,
      scannerId: product.scannerId ?? null,
      price: product.price ?? null,
      categories: product.categories.isInitialized()
        ? product.categories.getItems().map(c => ({ id: c.id, name: c.name }))
        : [],
      imageUrl,
      createdAt: product.createdAt ?? null,
      updatedAt: product.updatedAt ?? null,
    };
  }
}