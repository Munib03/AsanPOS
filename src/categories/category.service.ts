import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { Category } from '../database/entites/category.entity';
import { Employee } from '../database/entites/employee.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';

@Injectable()
export class CategoryService {
  constructor(
    private readonly em: EntityManager,
    private readonly categoryRepository: BaseRepository<Category>,
    private readonly auditService: AuditService,
  ) { }

  async findAll(store: Store, query: PaginateQuery) {
    const [categories, meta] = await this.categoryRepository.findAndPaginate(
      { store, deletedAt: null },
      { fields: ['id', 'name'] },
      { searchable: ['name'], sortable: ['name'] },
      query,
    );

    return { data: serialize(categories), meta };
  }

  async findOne(store: Store, name: string) {
    const category = await this.em.findOne(Category, { name, store, deletedAt: null });
    if (!category)
      throw new NotFoundException(`Category with name ${name} not found`);

    return category;
  }


  async create(store: Store, employeeId: string, dto: CreateCategoryDto) {
    const existing = await this.em.findOne(Category, { name: dto.name, store, deletedAt: null });
    if (existing)
      throw new BadRequestException(`Category with name ${dto.name} already exists in your store`);

    const category = this.em.create(Category, { name: dto.name, store });
    await this.em.persistAndFlush(category);

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Category,
      category.id,
      AuditActionType.Create,
      null,
      null
    );

    await this.em.flush();

    return category;
  }

  async update(store: Store, id: string, employeeId: string, dto: UpdateCategoryDto) {
    const category = await this.em.findOne(Category, { id, store, deletedAt: null });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);

    const oldName = category.name;

    if (dto.name)
      category.name = dto.name;

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Category,
      category.id,
      AuditActionType.Update,
      { name: oldName },
      { name: category.name },
    );

    await this.em.flush();

    return category;
  }

  async remove(store: Store, id: string, employeeId: string) {
    const category = await this.em.findOne(Category, { id, store, deletedAt: null }, { populate: ['products'] });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);

    if (category.products.length > 0)
      throw new BadRequestException('Cannot delete category that has products linked to it');

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Category,
      category.id,
      AuditActionType.Delete,
      { name: category.name },
      null,
    );

    category.deletedAt = new Date();

    await this.em.flush();

    return { message: `Category ${id} deleted successfully` };
  }
}