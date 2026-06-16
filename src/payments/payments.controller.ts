import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Cashier)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.paymentService.findAll(store);
  }

  @Get(':id')
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.paymentService.findOne(store, id);
  }

  @Post()
  create(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentService.create(store, user.id, dto);
  }
}