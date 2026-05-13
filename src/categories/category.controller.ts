import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CurrentStore } from "../shared/decorators/store.decorator";
import { Store } from "../database/entites/store.entity";
import * as paginateQueryTypes from "../shared/types/paginate-query.types";


@Controller("categories")
@UseGuards(JwtAuthGuard)
export class CategoryController {

  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.categoryService.findAll(store, query);
  }

  @Get(":name")
  findOne(
    @CurrentStore() store: Store,
    @Param("name") name: string,
  ) {
    return this.categoryService.findOne(store, name);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoryService.create(store, dto);
  }

  @Put(':name')
  update(
    @CurrentStore() store: Store,
    @Param('name') name: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(store, name, dto);
  }

  @Delete(":id")
  remove(
    @CurrentStore() store: Store,
    @Param("id") id: string,
  ) {
    return this.categoryService.remove(store, id);
  }
}