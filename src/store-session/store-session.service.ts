import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { StoreSession } from '../database/entites/store-session.entity';
import { CashMovement } from '../database/entites/cash-movement.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CashMovementType } from '../shared/utils/cash-movement.enum';

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
      orderBy: { openedAt: 'DESC' },
    });
  }

  async findOne(store: Store, id: string) {
    const session = await this.em.findOne(
      StoreSession,
      { id, store },
      { populate: ['openedBy', 'closedBy', 'payments', 'cashMovements'] },
    );
    if (!session)
      throw new NotFoundException(`Session with id ${id} not found`);

    return session;
  }

  async getActiveSession(store: Store) {
    const session = await this.em.findOne(StoreSession, {
      store,
      closedAt: null,
    });

    return session;
  }

  async open(store: Store, employeeId: string, dto: OpenSessionDto) {
    const existing = await this.em.findOne(StoreSession, {
      store,
      closedAt: null,
    });

    if (existing)
      throw new BadRequestException('A session is already open for this store.');

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

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
      null,
      { openingAmount: dto.openingAmount, openingNote: dto.openingNote },
    );

    await this.em.flush();

    return { message: 'Session opened successfully.', id: session.id };
  }

  async close(store: Store, employeeId: string, dto: CloseSessionDto) {
    // get active session automatically
    const session = await this.em.findOne(
      StoreSession,
      { store, closedAt: null },
      { populate: ['cashMovements'] },
    );

    if (!session)
      throw new NotFoundException('No active session found for this store.');

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const cashMovements = session.cashMovements.getItems();
    const cashIn = cashMovements
      .filter(cm => cm.type === CashMovementType.CashIn)
      .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);

    const cashOut = cashMovements
      .filter(cm => cm.type === CashMovementType.CashOut)
      .reduce((sum, cm) => sum + (cm.amount ?? 0), 0);

    const expectedAmount = (session.openingAmount ?? 0) + cashIn - cashOut;

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
}