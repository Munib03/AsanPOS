import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { StockMovementController } from './stock-movement.controller';
import { StockMovementService } from './stock-movement.service';
import { StockMovement } from '../database/entites/stock-movement.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { SequenceModule } from '../sequence/sequence.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([StockMovement]),
    SequenceModule,
    AuditModule,
  ],
  controllers: [StockMovementController],
  providers: [
    StockMovementService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, StockMovement),
      inject: [EntityManager],
    },
  ],
  exports: [StockMovementService],
})
export class StockMovementModule { }