import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { UpdateCategoryDto } from "./dto/update-category.dto";


@Controller("categories")
export class CategoryController {

    constructor(private readonly categoryService: CategoryService) {}
    
    @UseGuards(JwtAuthGuard)
    @Get()
    findAll() {
        return this.categoryService.findAll();
    }

    @UseGuards(JwtAuthGuard)
    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.categoryService.findOne(id);
    }

    @UseGuards(JwtAuthGuard)
    @Post()
    create(@Body() dto: CreateCategoryDto ) {
        return this.categoryService.create(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.categoryService.remove(id);
    }
    
    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
        return this.categoryService.update(id, dto);
    }
}