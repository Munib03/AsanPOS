import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';
import { Sale } from '../database/entites/sale.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { SequenceModule } from '../sequence/sequence.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Sale]),
    SequenceModule,
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