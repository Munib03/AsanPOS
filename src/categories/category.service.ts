import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, serialize } from '@mikro-orm/postgresql';
import { Category } from '../database/entites/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Store } from '../database/entites/store.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';


@Injectable()
export class CategoryService {
  constructor(
    private readonly em: EntityManager,
    private readonly categoryRepository: BaseRepository<Category>,
  ) {}


  async findAll(store: Store, query: PaginateQuery) {
    const [categories, meta] = await this.categoryRepository.findAndPaginate(
      { store },
      {
        fields: ['id', 'name'],
      },
      {
        searchable: ['name'],
        sortable: ['name'],
      },
      query,
    );

    return {
      data: serialize(categories),
      meta,
    };
  }


  async findOne(store: Store, name: string) {
    const category = await this.em.findOne(Category, { name, store });
    if (!category)
      throw new NotFoundException(`Category with name ${name} not found`);

    return category;
  }


  async create(store: Store, dto: CreateCategoryDto) {
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


  async update(store: Store, name: string, dto: UpdateCategoryDto) {
    const category = await this.em.findOne(Category, { name, store });
    if (!category)
      throw new NotFoundException(`Category with name ${name} not found`);

    if (dto.name)
      category.name = dto.name;

    await this.em.flush();
    return category;
  }


  async remove(store: Store, id: string) {
    const category = await this.em.findOne(Category, { id, store }, { populate: ['products'] });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);

    if (category.products.length > 0)
      throw new BadRequestException('Cannot delete category that has products linked to it');

    await this.em.removeAndFlush(category);
    return { message: `Category ${id} deleted successfully` };
  }
}