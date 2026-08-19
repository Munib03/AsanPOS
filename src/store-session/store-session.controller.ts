import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StoreSessionService } from './store-session.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { PaginateQuery } from '../shared/types/paginate-query.types';

@Controller('store-session')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Cashier)
export class StoreSessionController {
  constructor(private readonly storeSessionService: StoreSessionService) {}

  @Get()
  findAll(@CurrentStore() store: Store, @Query() query: PaginateQuery) {
    return this.storeSessionService.findAll(store, query);
  }

  @Get('my-session')
  hasActiveSession(@CurrentUser() user: { id: string }) {
    return this.storeSessionService.hasActiveSession(user.id);
  }

  @Get('active')
  getActiveSession(@CurrentStore() store: Store) {
    return this.storeSessionService.getActiveSession(store);
  }

  @Get(':id')
  findOne(@CurrentStore() store: Store, @Param('id') id: string) {
    return this.storeSessionService.findOne(store, id);
  }

  @Post('open')
  open(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: OpenSessionDto,
  ) {
    return this.storeSessionService.open(store, user.id, dto);
  }

  @Put('close')
  close(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CloseSessionDto,
  ) {
    return this.storeSessionService.close(store, user.id, dto);
  }
}
