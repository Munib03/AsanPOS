import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { Purchase } from '../database/entites/purchase.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { StockInModule } from '../StockIn/stock-in.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Purchase]),
    StockInModule,
  ],
  controllers: [PurchaseController],
  providers: [
    PurchaseService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, Purchase),
      inject: [EntityManager],
    },
  ],
})
export class PurchaseModule {}