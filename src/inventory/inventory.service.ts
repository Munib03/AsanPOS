import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Inventory } from '../database/entites/inventory.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { MinioService } from '../shared/services/minio.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly em: EntityManager,
    private readonly inventoryRepository: BaseRepository<Inventory>,
    private readonly minioService: MinioService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(store: Store, query: PaginateQuery) {
    const [inventories, meta] = await this.inventoryRepository.findAndPaginate(
      { store },
      {
        populate: ['products'],
        fields: ['id', 'name', 'address', 'products.id', 'products.name', 'products.price'],
      },
      { searchable: ['name'] },
      query,
    );

    return {
      data: serialize(inventories, { populate: ['products'] }),
      meta,
    };
  }

  async findOne(store: Store, id: string) {
    const inventory = await this.em.findOne(
      Inventory,
      { id, store },
      {
        populate: [
          'products',
          'products.images',
          'products.categories',
          'products.sequence',
        ],
        fields: [
          'id',
          'name',
          'address',
          'products.id',
          'products.name',
          'products.price',
          'products.images.id',
          'products.images.imageUrl',
          'products.categories.id',
          'products.categories.name',
          'products.barcode',
          'products.sequence.prefix',
          'products.sequence.lastIndex',
        ],
      },
    );

    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    const stockQuantities = await this.em.findAll(StockQuantity, {
      where: { inventory: { id } },
    });

    const serialized = serialize(inventory, {
      populate: ['products', 'products.images', 'products.categories', 'products.sequence'],
    });

    const products = await Promise.all(
      serialized.products.map(async (product) => {
        const images = await Promise.all(
          (product.images ?? []).map(async (image) => ({
            id: image.id,
            imageUrlSigned: image.imageUrl
              ? await this.minioService.getSignedUrl(image.imageUrl)
              : null,
          })),
        );

        return {
          ...product,
          images,
          categories: product.categories ?? [],
          quantity: stockQuantities.find(sq => sq.product.id === product.id)?.quantity ?? 0,
          sequence: product.sequence
            ? `${product.sequence.prefix}-${String(product.sequence.lastIndex).padStart(4, '0')}`
            : null,
        };
      }),
    );

    return { ...serialized, products };
  }

  async create(store: Store, employeeId: string, dto: CreateInventoryDto) {
    const existingInventory = await this.em.findOne(Inventory, { name: dto.name, store });
    if (existingInventory)
      throw new BadRequestException(`Inventory with name ${dto.name} already exists.`);

    const inventory = this.em.create(Inventory, {
      name: dto.name,
      address: dto.address,
      store,
    });

    await this.em.persistAndFlush(inventory);

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Inventory,
      inventory.id,
      null,
      { name: inventory.name, address: inventory.address },
    );

    await this.em.flush();

    return { message: 'Inventory created successfully.' };
  }

  async update(store: Store, id: string, employeeId: string, dto: UpdateInventoryDto) {
    const inventory = await this.em.findOne(Inventory, { id, store });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    const before = { name: inventory.name, address: inventory.address };

    this.em.assign(inventory, stripUndefined(dto));

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Inventory,
      inventory.id,
      before,
      { name: inventory.name, address: inventory.address },
    );

    await this.em.flush();

    return { message: `Inventory with id ${id} updated successfully.` };
  }

  async delete(store: Store, id: string, employeeId: string) {
    const inventory = await this.em.findOne(Inventory, { id, store });
    if (!inventory)
      throw new NotFoundException(`Inventory with id ${id} not found`);

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Inventory,
      inventory.id,
      { name: inventory.name, address: inventory.address },
      null,
    );

    await this.em.flush();
    await this.em.removeAndFlush(inventory);

    return { message: `Inventory with id ${id} deleted successfully.` };
  }
}