import { Controller, Get, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { StoresService } from './stores.service';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAll() {
    return this.storesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Put(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(id, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Delete(':id')
  remove(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.storesService.remove(id, user.id);
  }
}