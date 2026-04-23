import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CurrentStore } from "../shared/decorators/store.decorator";
import { Store } from "../database/entites/store.entity";


@Controller("categories")
@UseGuards(JwtAuthGuard)
export class CategoryController {

  constructor(private readonly categoryService: CategoryService) {}

  
  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.categoryService.findAll(store);
  }

  
  @Get(":id")
  findOne(
    @CurrentStore() store: Store,
    @Param("id") id: string,
  ) {
    return this.categoryService.findOne(store, id);
  }


  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoryService.create(store, dto);
  }


  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(store, id, dto);
  }


  @Delete(":id")
  remove(
    @CurrentStore() store: Store,
    @Param("id") id: string,
  ) {
    return this.categoryService.remove(store, id);
  }
}