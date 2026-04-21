import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateCategoryDTO } from "./dto/create-category.dto";
import { EntityManager } from "@mikro-orm/knex";
import { Category } from "../database/entites/category.entity";
import { UpdateCategoryDto } from "./dto/update-category.dto";


@Injectable()
export class CategoryService {

    constructor(private readonly em: EntityManager) {}
    
    async findAll() {
        return this.em.findAll(Category, {});
    }


    async findOne(id: string) {
        const category = await this.em.findOne(Category, { id });
        if (!category) 
            throw new NotFoundException(`Category with id ${id} not found.`);

        return category;
    }


    async create(dto: CreateCategoryDTO) {
        const category = this.em.create(Category, { name: dto.name });
        await this.em.persistAndFlush(category);
        return category;
    }


    async update(id: string, dto: UpdateCategoryDto) {
        const category = await this.em.findOne(Category, { id });
        if (!category)
            throw new NotFoundException(`Category with id ${id} not found`);
        
        if (dto.name)
            category.name = dto.name;

        await this.em.flush();
        return category;
    }


    async remove(id: string) {
        const category = await this.em.findOne(Category, { id }, { populate: ['products'] });
        if (!category)
            throw new NotFoundException(`Category with id ${id} not found`);

        if (category.products.length > 0)
            throw new BadRequestException('Cannot delete category that has products linked to it');

        await this.em.removeAndFlush(category);
        return { message: `Category ${id} deleted successfully` };
    }
}