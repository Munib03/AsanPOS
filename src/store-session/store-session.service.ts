import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StoreSession } from '../database/entites/store-session.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CashMovementType } from '../shared/utils/cash-movement.enum';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';

@Injectable()
export class StoreSessionService {
  constructor(
    private readonly em: EntityManager,
    private readonly auditService: AuditService,
  ) { }

  async findAll(store: Store) {
    return this.em.findAll(StoreSession, {
      where: { store },
      populate: ['openedBy', 'closedBy'],
      fields: [
        'id',
        'openingAmount',
        'openingNote',
        'closingAmount',
        'expectedAmount',
        'closingNote',
        'openedAt',
        'closedAt',
        'openedBy.id',
        'openedBy.name',
        'openedBy.email',
        'closedBy.id',
        'closedBy.name',
        'closedBy.email',
      ],
      orderBy: { openedAt: 'DESC' },
    });
  }

  async findOne(store: Store, id: string) {
    const session = await this.em.findOne(
      StoreSession,
      { id, store },
      {
        populate: ['openedBy', 'closedBy', 'payments', 'cashMovements'],
        fields: [
          'id',
          'openingAmount',
          'openingNote',
          'closingAmount',
          'expectedAmount',
          'closingNote',
          'openedAt',
          'closedAt',
          'openedBy.id',
          'openedBy.name',
          'openedBy.email',
          'closedBy.id',
          'closedBy.name',
          'closedBy.email',
          'payments.id',
          'payments.amount',
          'payments.note',
          'payments.status',
          'payments.createdAt',
          'cashMovements.id',
          'cashMovements.type',
          'cashMovements.amount',
          'cashMovements.note',
          'cashMovements.status',
          'cashMovements.createdAt',
        ],
      },
    );

    if (!session)
      throw new NotFoundException(`Session with id ${id} not found`);

    return session;
  }


  async getActiveSession(store: Store) {
    return this.em.find(
      StoreSession,
      { store, closedAt: null },
      {
        populate: ['openedBy'],
        fields: [
          'id',
          'openingAmount',
          'openingNote',
          'openedAt',
          'openedBy.id',
          'openedBy.name',
          'openedBy.email',
        ],
        orderBy: { openedAt: 'DESC' },
      },
    );
  }


  async getMyActiveSession(employeeId: string): Promise<StoreSession | null> {
    return this.em.findOne(StoreSession, {
      openedBy: { id: employeeId },
      closedAt: null,
    });
  }


  async open(store: Store, employeeId: string, dto: OpenSessionDto) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const existing = await this.getMyActiveSession(employeeId);
    if (existing)
      throw new BadRequestException('You already have an active session open.');

    const session = this.em.create(StoreSession, {
      store,
      openedBy: employee,
      openingAmount: dto.openingAmount,
      openingNote: dto.openingNote,
      openedAt: new Date(),
    });

    await this.em.persistAndFlush(session);

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.StoreSession,
      session.id,
      AuditActionType.Open,
      null,
      null
    );

    await this.em.flush();

    return { message: 'Session opened successfully.', id: session.id };
  }


  async close(store: Store, employeeId: string, dto: CloseSessionDto) {
    const session = await this.em.findOne(
      StoreSession,
      { store, openedBy: { id: employeeId }, closedAt: null },
      { populate: ['cashMovements', 'payments'] },
    );

    if (!session)
      throw new NotFoundException('You have no active session to close.');

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const expectedAmount = this.closeSession(session, employee, {
      closingAmount: dto.closingAmount,
      closingNote: dto.closingNote,
      autoClosed: false,
    });

    await this.em.flush();

    return { message: 'Session closed successfully.', expectedAmount };
  }

  /**
   * Runs hourly. Any session left open for 24+ hours gets auto-closed
   * since no employee is acting on it — the closing amount is set to
   * the system-calculated expected amount (no physical cash count exists).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoCloseStaleSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleSessions = await this.em.find(
      StoreSession,
      { closedAt: null, openedAt: { $lte: cutoff } },
      { populate: ['cashMovements', 'payments', 'openedBy'] },
    );

    for (const session of staleSessions) {
      if (!session.openedBy) continue;

      const expectedAmount = this.calculateExpectedAmount(session);

      this.closeSession(session, session.openedBy, {
        closingAmount: expectedAmount,
        closingNote: 'Auto-closed by system after 24 hours of inactivity.',
        autoClosed: true,
      });
    }

    if (staleSessions.length > 0)
      await this.em.flush();
  }



  private closeSession(
    session: StoreSession,
    closedBy: Employee,
    options: { closingAmount: number; closingNote?: string; autoClosed: boolean },
  ): number {
    const expectedAmount = this.calculateExpectedAmount(session);

    const before = {
      openingAmount: session.openingAmount,
      openingNote: session.openingNote,
      openedAt: session.openedAt,
    };

    session.closedBy = closedBy;
    session.closingAmount = options.closingAmount;
    session.closingNote = options.closingNote;
    session.expectedAmount = expectedAmount;
    session.closedAt = new Date();

    this.auditService.log(
      this.em,
      closedBy,
      AuditEntityType.StoreSession,
      session.id,
      AuditActionType.Close,
      before,
      {
        closingAmount: session.closingAmount,
        closingNote: session.closingNote,
        expectedAmount,
        closedAt: session.closedAt,
        autoClosed: options.autoClosed,
      },
    );

    return expectedAmount;
  }

  private calculateExpectedAmount(session: StoreSession): number {
    const cashMovements = session.cashMovements.getItems();
    const cashIn = cashMovements
      .filter(cm => cm.type === CashMovementType.CashIn)
      .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);

    const cashOut = cashMovements
      .filter(cm => cm.type === CashMovementType.CashOut)
      .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);

    const salePayments = session.payments
      .getItems()
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    return (session.openingAmount ?? 0) + cashIn - cashOut + salePayments;
  }
}