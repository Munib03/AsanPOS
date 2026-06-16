import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CashMovementController } from './cash-movement.controller';
import { CashMovementService } from './cash-movement.service';
import { CashMovement } from '../database/entites/cash-movement.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([CashMovement, StoreSession]),
    AuditModule,
  ],
  controllers: [CashMovementController],
  providers: [CashMovementService],
  exports: [CashMovementService],
})
export class CashMovementModule {}