import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { UpdateStockMovementDto } from './dto/update-stock-movement.dto';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';
import { Store } from '../database/entites/store.entity';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';

@Controller('stock-movements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class StockMovementController {
    constructor(private readonly stockMovementService: StockMovementService) { }

    @Get()
    findAll(@CurrentStore() store: Store, @Query() query: paginateQueryTypes.PaginateQuery) {
        return this.stockMovementService.findAll(store, query);
    }

    @Get(':id')
    findOne(@CurrentStore() store: Store, @Param('id') id: string) {
        return this.stockMovementService.findOne(store, id);
    }

    @Post()
    create(
        @CurrentStore() store: Store,
        @CurrentUser() user: { id: string },
        @Body() dto: CreateStockMovementDto,
    ) {
        return this.stockMovementService.create(store, user.id, dto);
    }

    @Patch(':id')
    update(
        @CurrentStore() store: Store,
        @Param('id') id: string,
        @CurrentUser() user: { id: string },
        @Body() dto: UpdateStockMovementDto,
    ) {
        return this.stockMovementService.update(store, id, user.id, dto);
    }
}