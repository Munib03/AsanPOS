import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Category } from '../database/entites/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Employee } from '../database/entites/employee.entity';


@Injectable()
export class CategoryService {
  constructor(private readonly em: EntityManager) {}

  private async getEmployeeStore(employeeId: string) {
    const employee = await this.em.findOne(Employee, { id: employeeId }, { populate: ['store'] });
    if (!employee)
      throw new NotFoundException('Employee not found');

    return employee.store;
  }

  async findAll(employeeId: string) {
    const store = await this.getEmployeeStore(employeeId);

    return this.em.findAll(Category, { where: { store } });
  }

  async findOne(employeeId: string, id: string) {
    const store = await this.getEmployeeStore(employeeId);
    const category = await this.em.findOne(Category, { id, store });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);

    return category;
  }

  async create(employeeId: string, dto: CreateCategoryDto) {
    const store = await this.getEmployeeStore(employeeId);

    const existing = await this.em.findOne(Category, { name: dto.name, store });
    if (existing)
      throw new BadRequestException(`Category with name ${dto.name} already exists in your store`);

    const category = this.em.create(Category, {
      name: dto.name,
      store,
    });

    await this.em.persistAndFlush(category);
    return category;
  }

  async update(employeeId: string, id: string, dto: UpdateCategoryDto) {
    const store = await this.getEmployeeStore(employeeId);
    const category = await this.em.findOne(Category, { id, store });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);

    if (dto.name)
      category.name = dto.name;

    await this.em.persistAndFlush(category);
    return category;
  }

  async remove(employeeId: string, id: string) {
    const store = await this.getEmployeeStore(employeeId);
    const category = await this.em.findOne(Category, { id, store }, { populate: ['products'] });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);

    if (category.products.length > 0)
      throw new BadRequestException('Cannot delete category that has products linked to it');

    await this.em.removeAndFlush(category);
    
    return { message: `Category ${id} deleted successfully` };
  }
}