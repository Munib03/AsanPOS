import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
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
  ) {}

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
        'openedBy.firstName',
        'openedBy.lastName',
        'openedBy.email',
        'closedBy.id',
        'closedBy.firstName',
        'closedBy.lastName',
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
          'openedBy.firstName',
          'openedBy.lastName',
          'openedBy.email',
          'closedBy.id',
          'closedBy.firstName',
          'closedBy.lastName',
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
          'openedBy.firstName',
          'openedBy.lastName',
          'openedBy.email',
        ],
        orderBy: { openedAt: 'DESC' },
      },
    );
  }

  async open(store: Store, employeeId: string, dto: OpenSessionDto) {
    const employee = await this.findEmployeeOrFail(employeeId);

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
      null,
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

    const employee = await this.findEmployeeOrFail(employeeId);

    const cashMovements = session.cashMovements.getItems();
    const cashIn = this.sumByType(cashMovements, CashMovementType.CashIn);
    const cashOut = this.sumByType(cashMovements, CashMovementType.CashOut);

    const salePayments = session.payments
      .getItems()
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const expectedAmount =
      (session.openingAmount ?? 0) + cashIn - cashOut + salePayments;

    const before = {
      openingAmount: session.openingAmount,
      openingNote: session.openingNote,
      openedAt: session.openedAt,
    };

    session.closedBy = employee;
    session.closingAmount = dto.closingAmount;
    session.closingNote = dto.closingNote;
    session.expectedAmount = expectedAmount;
    session.closedAt = new Date();

    this.auditService.log(
      this.em,
      employee,
      AuditEntityType.StoreSession,
      session.id,
      AuditActionType.Close,
      before,
      {
        closingAmount: dto.closingAmount,
        closingNote: dto.closingNote,
        expectedAmount,
        closedAt: session.closedAt,
      },
    );

    await this.em.flush();

    return { message: 'Session closed successfully.', expectedAmount };
  }

  async hasActiveSession(employeeId: string): Promise<boolean> {
    const session = await this.getMyActiveSession(employeeId);
    return !!session;
  }

  async getMyActiveSession(employeeId: string): Promise<StoreSession | null> {
    return this.em.findOne(StoreSession, {
      openedBy: { id: employeeId },
      closedAt: null,
    });
  }

  private async findEmployeeOrFail(employeeId: string): Promise<Employee> {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private sumByType(
    cashMovements: { type: string; amount?: number }[],
    type: CashMovementType,
  ): number {
    return cashMovements
      .filter((cm) => cm.type === type)
      .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);
  }
}
