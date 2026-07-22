import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CashMovementService } from './cash-movement.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { PaginateQuery } from '../shared/types/paginate-query.types';

@Controller('cash-movement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Cashier)
export class CashMovementController {
  constructor(private readonly cashMovementService: CashMovementService) {}

  @Get()
  findAll(@CurrentStore() store: Store, @Query() query: PaginateQuery) {
    return this.cashMovementService.findAll(store, query);
  }

  @Get(':id')
  findOne(@CurrentStore() store: Store, @Param('id') id: string) {
    return this.cashMovementService.findOne(store, id);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.cashMovementService.create(store, user.id, dto);
  }
}
