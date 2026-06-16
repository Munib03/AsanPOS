import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sale } from '../database/entites/sale.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { Store } from '../database/entites/store.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus } from '../shared/utils/payments-status.enum';
import { Payment } from '../database/entites/payments.entity';

@Injectable()
export class PaymentService {
  constructor(private readonly em: EntityManager) {}

  async findAll(store: Store) {
    return this.em.findAll(Payment, {
      where: { sale: { store } },
      populate: ['sale', 'storeSession'],
      orderBy: { createdAt: 'DESC' },
    });
  }

  async findOne(store: Store, id: string) {
    const payment = await this.em.findOne(
      Payment,
      { id, sale: { store } },
      { populate: ['sale', 'storeSession'] },
    );
    if (!payment)
      throw new NotFoundException(`Payment with id ${id} not found`);

    return payment;
  }

  async create(store: Store, dto: CreatePaymentDto) {
    const sale = await this.em.findOne(Sale, { id: dto.saleId, store });
    if (!sale)
      throw new NotFoundException(`Sale with id ${dto.saleId} not found`);

    // get active session
    const session = await this.em.findOne(StoreSession, {
      store,
      closedAt: null,
    });

    if (!session)
      throw new BadRequestException('No active session found. Please open a session first.');

    const payment = this.em.create(Payment, {
      sale,
      storeSession: session,
      amount: dto.amount,
      note: dto.note,
      status: PaymentStatus.Done,
    });

    await this.em.persistAndFlush(payment);

    return { message: 'Payment created successfully.', id: payment.id };
  }
}