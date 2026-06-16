import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PaymentService } from './payment.service';
import { StoreSession } from '../database/entites/store-session.entity';
import { PaymentController } from './payments.controller';
import { Payment } from '../database/entites/payments.entity';


@Module({
  imports: [MikroOrmModule.forFeature([Payment, StoreSession])],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}