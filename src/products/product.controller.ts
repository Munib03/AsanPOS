import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';


@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.productService.findAll(store, query);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(store, dto);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(store, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.productService.remove(store, id);
  }
}