import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PaymentService } from './payment.service';
import { Payment } from '../database/entites/payments.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { AuditModule } from '../audit/audit.module';
import { PaymentController } from './payments.controller';

@Module({
  imports: [
    MikroOrmModule.forFeature([Payment, StoreSession]),
    AuditModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}