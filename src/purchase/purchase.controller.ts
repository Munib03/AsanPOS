import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../shared/jwt/jwt-auth.guard";
import { PurchaseService } from "./purchase.service";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";
import { UpdatePurchaseDto } from "./dto/update-purchase.dto";
import { CurrentStore } from "../shared/decorators/store.decorator";
import { Store } from "../database/entites/store.entity";
import * as paginateQueryTypes from "../shared/types/paginate-query.types";


@Controller("purchase")
@UseGuards(JwtAuthGuard)
export class PurchaseController {

  constructor(
    private readonly purchaseService: PurchaseService
  ) {}


  @Get()
  findAll(@CurrentStore() store: Store, @Query() query: paginateQueryTypes.PaginateQuery) {
    return this.purchaseService.findAll(store, query);
  }

  @Get(":id")
  findOne(@CurrentStore() store: Store, @Param("id") id: string) {
    return this.purchaseService.findOne(store, id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseDto) {
    return this.purchaseService.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchaseService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.purchaseService.remove(id);
  }
}