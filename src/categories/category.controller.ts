import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';
import { Roles } from '../shared/decorators/role.decorator';
import { RolesGuard } from '../shared/guards/role.guard';
import { Role } from '../shared/utils/role.enum';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  findAll(
    @CurrentStore() store: Store,
    @Query() query: paginateQueryTypes.PaginateQuery,
  ) {
    return this.categoryService.findAll(store, query);
  }

  @Get(':name')
  findOne(
    @CurrentStore() store: Store,
    @Param('name') name: string,
  ) {
    return this.categoryService.findOne(store, name);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoryService.create(store, user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(store, id, user.id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.categoryService.remove(store, id, user.id);
  }
}