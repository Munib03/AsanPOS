import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CashMovementController } from './cash-movement.controller';
import { CashMovementService } from './cash-movement.service';
import { CashMovement } from '../database/entites/cash-movement.entity';
import { StoreSession } from '../database/entites/store-session.entity';

@Module({
  imports: [MikroOrmModule.forFeature([CashMovement, StoreSession])],
  controllers: [CashMovementController],
  providers: [CashMovementService],
  exports: [CashMovementService],
})
export class CashMovementModule {}