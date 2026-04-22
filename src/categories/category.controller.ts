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
  findAll(@CurrentUser() user: { id: string }) {
    return this.categoryService.findAll(user.id);
  }


  @Get(":id")
  findOne(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.categoryService.findOne(user.id, id);
  }


  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateCategoryDto) {
    return this.categoryService.create(user.id, dto);
  }


  @Put(':id')
  update(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(user.id, id, dto);
  }


  @Delete(":id")
  remove(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.categoryService.remove(user.id, id);
  }
}