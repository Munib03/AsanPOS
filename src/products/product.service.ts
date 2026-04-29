import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize, wrap } from '@mikro-orm/postgresql';
import { Product } from '../database/entites/product.entity';
import { ProductImage } from '../database/entites/product-image.entity';
import { Category } from '../database/entites/category.entity';
import { Store } from '../database/entites/store.entity';
import { MinioService } from '../shared/services/minio.service';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';

@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
  ) {}


  async findAll(store: Store) {
    const categories = await this.em.findAll(Category, {
      where: { store },
      populate: ['products', 'products.images'],
    });

    return serialize(categories, {
      populate: ['products', 'products.categories', 'products.images'],
    });
  }


  async findOne(store: Store, id: string) {
    const product = await this.em.findOne(
      Product,
      { id },
      { populate: ['categories', 'images'] },
    );

    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    const belongsToStore = product.categories.getItems().some(
      c => (c as any).store?.id === store.id,
    );

    if (!belongsToStore)
      throw new NotFoundException(`Product with id ${id} not found`);

    return wrap(product).toJSON();
  }


  async create(store: Store, dto: CreateProductDto) {
    const product = this.em.create(Product, stripUndefined({
      name: dto.name,
      scannerId: dto.scannerId,
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

    return wrap(product).toJSON();
  }


  async update(store: Store, id: string, dto: UpdateProductDto) {
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

    if (dto.categoryIds) {
      const categories = await this.em.findAll(Category, {
        where: { id: { $in: dto.categoryIds }, store },
      });
      product.categories.set(categories);
    }

    await this.em.flush();
    return wrap(product).toJSON();
  }


  async remove(store: Store, id: string) {
    const product = await this.em.findOne(
      Product,
      { id },
      { populate: ['categories', 'images'] },
    );

    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);

    // delete all product images from MinIO
    for (const image of product.images.getItems()) {
      if (image.imageUrl)
        await this.minioService.deleteFile(image.imageUrl);
    }

    await this.em.removeAndFlush(product);
    return { message: `Product ${id} deleted successfully` };
  }


  // Upload image for a product
  async uploadProductImage(productId: string, file: any) {
    if (!file)
      throw new NotFoundException('No image file provided');

    const product = await this.em.findOne(Product, { id: productId });
    if (!product)
      throw new NotFoundException(`Product with id ${productId} not found`);

    const key = await this.minioService.uploadFile(file);

    const productImage = this.em.create(ProductImage, {
      product,
      imageUrl: key,
    });

    await this.em.persistAndFlush(productImage);

    return wrap(productImage).toJSON();
  }


  // Delete a specific product image
  async deleteProductImage(productId: string, imageId: string) {
    const productImage = await this.em.findOne(ProductImage, {
      id: imageId,
      product: { id: productId },
    });

    if (!productImage)
      throw new NotFoundException(`Image not found`);

    if (productImage.imageUrl)
      await this.minioService.deleteFile(productImage.imageUrl);

    await this.em.removeAndFlush(productImage);

    return { message: 'Image deleted successfully' };
  }

  
  // Get all images for a product
  async getProductImages(productId: string) {
    const images = await this.em.findAll(ProductImage, {
      where: { product: { id: productId } },
    });

    return images;
  }
}