import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CurrentUser } from "../shared/decorators/current-user.decorator";


@Controller("categories")
@UseGuards(JwtAuthGuard)
export class CategoryController {

    constructor(private readonly categoryService: CategoryService) {}
    

    @Get()
    findAll() {
        return this.categoryService.findAll();
    }


    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.categoryService.findOne(id);
    }


    @Post()
    create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCategoryDto) {
        return this.categoryService.create(user.id, dto);
    }


    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.categoryService.remove(id);
    }
    

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
        return this.categoryService.update(id, dto);
    }
}