import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';
import { RolesGuard } from '../shared/guards/role.guard';
import { Role } from '../shared/utils/role.enum';
import { Roles } from '../shared/decorators/role.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateSaleDto } from './dto/update-sale.dto';


@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Cashier)
export class SaleController {
    constructor(private readonly saleService: SaleService) { }

    @Post('checkout')
    checkout(
        @CurrentStore() store: Store,
        @CurrentUser() user: { id: string; role: string },
        @Body() dto: CreateSaleDto,
    ) {
        return this.saleService.checkout(store, user.id, dto);
    }


    @Put(':id')
    update(
        @CurrentStore() store: Store,
        @CurrentUser() user: { id: string; role: string },
        @Param('id') id: string,
        @Body() dto: UpdateSaleDto,
    ) {
        return this.saleService.update(store, id, user.id, dto);
    }

}