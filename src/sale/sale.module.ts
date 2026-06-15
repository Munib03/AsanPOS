import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';
import { Sale } from '../database/entites/sale.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { SequenceModule } from '../sequence/sequence.module';
import { JournalEntryModule } from '../journal/journal.module';
import { StockQuantityModule } from '../stock-quantity/stock-quantity.module';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Sale, PurchasedItem]),
    SequenceModule,
    JournalEntryModule,
    StockQuantityModule,
    AuditModule,
  ],
  controllers: [SaleController],
  providers: [
    SaleService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, Sale),
      inject: [EntityManager],
    },
  ],
  exports: [SaleService],
})
export class SaleModule {}