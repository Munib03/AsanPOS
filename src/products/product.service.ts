import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/postgresql';
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
import { getNiceSignedUrl } from '../shared/utils/get.sgned.url';


@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
  ) {}


  
  async findAll(store: Store) {
    // fix this, dont use the category, use the product directly
    const categories = await this.em.findAll(Category, {
      where: { store },
      populate: ['products.images'],
      fields: [
        "products.id",
        'products.name',
        'products.price',
        'products.images.imageUrl',
      ],
    });

    // const productsa = await this.em.findAll(Product,{
    //   where : {
    //     store
    //   },
    //   populate : ['categories']
    // })


    // Here use the serilize
    const products = await Promise.all(
      categories
        .flatMap((category) => category.products.getItems())
        .map(async (product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          images: await Promise.all(
            product.images.getItems().map(async (img) => ({
              imageUrlSigned: img.imageUrl
                ? await getNiceSignedUrl(img.imageUrl)
                : null,
            }))
          ),
        }))
    );

    return products;
  }


  // Here use (pagination and updates that needed for entity, comment in plane)
  async searchByName(store: Store, name: string) {
    const categories = await this.em.findAll(Category, {
      where: { store },
      populate: ['products', 'products.images'] as never[],
    });

    const query = name.toLowerCase();
    const productSet = new Map<string, Product>();

    categories
      .flatMap(category => category.products.getItems())
      .forEach(product => {
        if (
          product.name &&
          product.name.toLowerCase().includes(query) &&
          !productSet.has(product.id)
        ) {
          productSet.set(product.id, product);
        }
      });

    // Here use the serilize for 1+ and wrap for 1
    return Promise.all(
      Array.from(productSet.values()).map(async (product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        images: await Promise.all(
          product.images.getItems().map(async (img) => ({
            imageUrlSigned: img.imageUrl
              ? await getNiceSignedUrl(img.imageUrl)
              : null,
          }))
        ),
      }))
    );
  }


  // Here use (pagination and updates that needed for entity, comment in plane)
  async searchByCategory(store: Store, categoryName: string) {
    const category = await this.em.findOne(Category, {
      name: { $ilike: `%${categoryName}%` },
      store,
    }, { populate: ['products', 'products.images'] as never[] });

    if (!category)
      return [];

    return Promise.all(
      category.products.getItems().map(async (product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        images: await Promise.all(
          product.images.getItems().map(async (img) => ({
            imageUrlSigned: img.imageUrl
              ? await getNiceSignedUrl(img.imageUrl)
              : null,
          }))
        ),
      }))
    );
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

  return { message: `Product with id [${product.id}] updated successfully.`}
  }


  async remove(store: Store, id: string) {
    const product = await this.em.findOne(
      Product,
      { id },
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
}