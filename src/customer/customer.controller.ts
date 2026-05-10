import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';

@Controller('customer')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.customerService.findAll(store);
  }

  
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerService.findOne(id);
  }


  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }


  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customerService.update(id, dto);
  }


  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customerService.remove(id);
  }
}