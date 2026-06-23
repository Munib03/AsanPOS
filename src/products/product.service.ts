import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { Product } from '../database/entites/product.entity';
import { ProductImage } from '../database/entites/product-image.entity';
import { Category } from '../database/entites/category.entity';
import { Attachment } from '../database/entites/attachment.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentService } from '../attachments/attachment.service';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { BaseRepository } from '../shared/repositories/base.repository';
import { SequenceService } from '../sequence/sequence.service';
import { generateBarcode } from '../shared/utils/generate.barcode';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';
import { StockQuantity } from '../database/entites/stock-quantity.entity';

@Injectable()
export class ProductService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
    private readonly attachmentService: AttachmentService,
    private readonly productRepository: BaseRepository<Product>,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
  ) { }


  async findAll(store: Store, query: PaginateQuery) {
    const [products, meta] = await this.productRepository.findAndPaginate(
      { store },
      {
        populate: ['images', 'categories'],
        fields: ['id', 'name', 'price', 'images.imageUrl', 'categories.id', 'categories.name'],
      },
      { searchable: ['name', 'categories.name'] },
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

    const stockQuantities = await this.em.find(
      StockQuantity,
      { product: { id } },
      {
        populate: ['inventory'],
        fields: ['quantity', 'inventory.id', 'inventory.name'],
      },
    );

    const inventories = stockQuantities.map((sq) => ({
      id: sq.inventory.id,
      name: sq.inventory.name,
      quantity: sq.quantity ?? 0,
    }));

    return {
      ...serialize(product, { populate: ['images', 'categories'] }),
      inventories,
    };
  }


  async create(store: Store, employeeId: string, dto: CreateProductDto) {
    const category = await this.em.findOne(Category, { name: dto.categoryName, store });
    if (!category)
      throw new NotFoundException(`Category not found: ${dto.categoryName}`);

    const sequence = await this.sequenceService.generateSequence('Product', 'PDT');
    const sequenceText = this.sequenceService.formatSequence(sequence);

    const product = this.em.create(Product, {
      ...stripUndefined({ name: dto.name, price: dto.price }),
      updatedAt: null,
      sequence,
      store,
    });

    product.categories.add(category);
    product.barcode = await generateBarcode(sequenceText);

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
        this.em.create(ProductImage, { product, imageUrl: attachment.imageUrl }),
      );
    }

    await this.em.persistAndFlush(product);

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Product,
      product.id,
      AuditActionType.Create,
      null,
      null
    );

    await this.em.flush();

    return { message: 'Product created Successfully!' };
  }


  async update(store: Store, id: string, employeeId: string, dto: UpdateProductDto) {
    const product = await this.productRepository.findOneOrFail(
      { id, store },
      {
        populate: ['categories', 'images', 'sequence'],
        notFoundMessage: `Product with id ${id} not found`,
      },
    );

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== product.name) {
      before.name = product.name;
      after.name = dto.name;
    }

    if (dto.price !== undefined && dto.price !== product.price) {
      before.price = product.price;
      after.price = dto.price;
    }

    const currentCategoryName = product.categories.getItems().map(c => c.name).join(', ');
    if (dto.categoryName && dto.categoryName !== currentCategoryName) {
      before.category = currentCategoryName;
      after.category = dto.categoryName;
    }

    this.em.assign(product, stripUndefined({ name: dto.name, price: dto.price }));

    if (dto.name || dto.price) {
      if (!product.sequence)
        throw new NotFoundException(`Sequence not found for product ${id}`);

      product.barcode = await generateBarcode(
        this.sequenceService.formatSequence(product.sequence),
      );
    }

    if (dto.categoryName) {
      const category = await this.em.findOne(Category, { name: dto.categoryName, store });
      if (!category)
        throw new NotFoundException(`Category not found: ${dto.categoryName}`);

      product.categories.set([category]);
    }

    if (dto.attachmentIds?.length) {
      const beforeImages = product.images.getItems().map((i) => i.imageUrl);

      await this.attachmentService.claimAttachments(
        dto.attachmentIds,
        product.id,
        AttachmentEntityType.PRODUCT,
      );

      const attachments = await this.em.findAll(Attachment, {
        where: { id: { $in: dto.attachmentIds } },
      });

      attachments.map((attachment) =>
        this.em.create(ProductImage, { product, imageUrl: attachment.imageUrl }),
      );

      const afterImages = product.images.getItems().map((i) => i.imageUrl);

      before.images = beforeImages.length ? beforeImages : null;
      after.images = afterImages.length ? afterImages : null;
    }

    product.updatedAt = new Date();

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    if (Object.keys(before).length > 0) {
      this.auditService.log(
        this.em,
        employee,
        AuditEntityType.Product,
        product.id,
        AuditActionType.Update,
        before,
        after,
      );
    }

    await this.em.flush();

    return { message: `Product with id [${product.id}] updated successfully.` };
  }


  async remove(store: Store, id: string, employeeId: string) {
    await this.em.transactional(async (em) => {
      const product = await this.productRepository.findOneOrFail(
        { id, store },
        {
          notFoundMessage: `Product with id ${id} not found`,
        },
      );

      const employee = await em.findOne(Employee, { id: employeeId });
      if (!employee)
        throw new NotFoundException('Employee not found');

      this.auditService.log(
        em,
        employee,
        AuditEntityType.Product,
        product.id,
        AuditActionType.Delete,
        { name: product.name, price: product.price },
        null,
      );

      product.deletedAt = new Date();

      await em.flush();
    });

    return { message: `Product ${id} deleted successfully` };
  }


  async deleteProductImage(imageId: string, employeeId: string): Promise<{ message: string }> {
    const image = await this.em.findOne(
      ProductImage,
      { id: imageId },
      { populate: ['product'] },
    );
    if (!image)
      throw new NotFoundException('Image not found');

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    if (image.imageUrl)
      await this.attachmentService.deleteAttachmentByUrl(
        image.imageUrl,
        AttachmentEntityType.PRODUCT,
      );

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Product,
      image.product.id,
      AuditActionType.Delete,
      { imageUrl: image.imageUrl },
      null,
    );

    await this.em.removeAndFlush(image);

    return { message: 'Image deleted successfully' };
  }
}