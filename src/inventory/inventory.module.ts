import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Inventory } from '../database/entites/inventory.entity';
import { BaseRepository } from '../shared/repositories/base.repository';

@Module({
  imports: [
    MikroOrmModule.forFeature([Inventory]),
  ],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, Inventory),
      inject: [EntityManager],
    },
  ],
})
export class InventoryModule {}