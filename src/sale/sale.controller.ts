import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SaleController {
    constructor(private readonly saleService: SaleService) { }

    @Get()
    findAll(
        @CurrentStore() store: Store,
        @Query() query: paginateQueryTypes.PaginateQuery,
    ) {
        return this.saleService.findAll(store, query);
    }

    @Get(':id')
    findOne(
        @CurrentStore() store: Store,
        @Param('id') id: string,
    ) {
        return this.saleService.findOne(store, id);
    }

    @Post()
    create(
        @CurrentStore() store: Store,
        @Body() dto: CreateSaleDto,
    ) {
        return this.saleService.create(store, dto);
    }

    @Delete(':id')
    remove(
        @CurrentStore() store: Store,
        @Param('id') id: string,
    ) {
        return this.saleService.remove(store, id);
    }
}