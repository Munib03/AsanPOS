import { Controller, Get, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { StoresService } from './stores.service';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { Store } from '../database/entites/store.entity';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.storesService.findAll(store);
  }

  @Get(':id')
  findOne(@CurrentStore() store: Store, @Param('id') id: string) {
    return this.storesService.findOne(store, id);
  }

  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(store, id, user.id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.storesService.remove(store, id, user.id);
  }
}
