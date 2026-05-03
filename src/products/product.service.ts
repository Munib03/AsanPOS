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
import { getNiceSignedUrl } from '../shared/utils/get.sgned.url';

@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
  ) {}


  async findAll(store: Store) {
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

    return Promise.all(
      categories.map(async (category) => ({
        products: await Promise.all(
          category.products.map(async (product) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            images: await Promise.all(
              product.images.map(async (img) => ({
                imageUrlSigned: img.imageUrl
                  ? await getNiceSignedUrl(img.imageUrl)
                  : null,
              }))
            ),
          }))
        ),
      }))
    );
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


  async checkProductImage(id: string): Promise<Attachment> {
    return this.attachmentService.getAttachment(id, AttachmentEntityType.PRODUCT);
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


  async getProductImages(productId: string): Promise<ProductImage[]> {
    const images = await this.em.findAll(ProductImage, {
      where: { product: { id: productId } },
    });

    for (const image of images) {
      if (image.imageUrl)
        image.imageUrlSigned = await this.minioService.getSignedUrl(image.imageUrl);
    }

    return images;
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