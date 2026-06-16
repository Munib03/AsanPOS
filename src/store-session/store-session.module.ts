import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { StoreSessionController } from './store-session.controller';
import { StoreSessionService } from './store-session.service';
import { StoreSession } from '../database/entites/store-session.entity';
import { CashMovement } from '../database/entites/cash-movement.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([StoreSession, CashMovement]),
    AuditModule,
  ],
  controllers: [StoreSessionController],
  providers: [StoreSessionService],
  exports: [StoreSessionService],
})
export class StoreSessionModule {}