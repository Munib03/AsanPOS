import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Payment } from '../database/entites/payments.entity';
import { Sale } from '../database/entites/sale.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { PaymentStatus } from '../shared/utils/payments-status.enum';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly em: EntityManager,
    private readonly auditService: AuditService,
  ) {}

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

  async create(store: Store, employeeId: string, dto: CreatePaymentDto) {
    const sale = await this.em.findOne(Sale, { id: dto.saleId, store });
    if (!sale)
      throw new NotFoundException(`Sale with id ${dto.saleId} not found`);

    const session = await this.em.findOne(StoreSession, {
      store,
      openedBy: { id: employeeId },
      closedAt: null,
    });

    if (!session)
      throw new BadRequestException('No active session found. Please open a session first.');

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const payment = this.em.create(Payment, {
      sale,
      storeSession: session,
      amount: dto.amount,
      note: dto.note,
      status: PaymentStatus.Done,
    });

    await this.em.persistAndFlush(payment);

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.Payment,
      payment.id,
      null,
      null
    );

    await this.em.flush();

    return { message: 'Payment created successfully.', id: payment.id };
  }
}