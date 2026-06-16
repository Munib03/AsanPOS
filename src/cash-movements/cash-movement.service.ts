import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { CashMovement } from '../database/entites/cash-movement.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';

@Injectable()
export class CashMovementService {
    constructor(
        private readonly em: EntityManager,
        private readonly auditService: AuditService,
    ) { }

    async findAll(store: Store) {
        return this.em.findAll(CashMovement, {
            where: { storeSession: { store } },
            populate: ['storeSession', 'createdBy'],
            orderBy: { createdAt: 'DESC' },
        });
    }

    async findOne(store: Store, id: string) {
        const cashMovement = await this.em.findOne(
            CashMovement,
            { id, storeSession: { store } },
            { populate: ['storeSession', 'createdBy'] },
        );
        if (!cashMovement)
            throw new NotFoundException(`Cash movement with id ${id} not found`);

        return cashMovement;
    }

    async create(store: Store, employeeId: string, dto: CreateCashMovementDto) {
        const session = await this.em.findOne(StoreSession, {
            store,
            closedAt: null,
        });

        if (!session)
            throw new BadRequestException('No active session found. Please open a session first.');

        const employee = await this.em.findOne(Employee, { id: employeeId });
        if (!employee)
            throw new NotFoundException('Employee not found');

        const cashMovement = this.em.create(CashMovement, {
            storeSession: session,
            type: dto.type,
            amount: dto.amount,
            note: dto.note,
            createdBy: employee,
            status: 'active',
        });

        await this.em.persistAndFlush(cashMovement);

        this.auditService.log(
            this.em,
            employee,
            AuditEntityType.CashMovement,
            cashMovement.id,
            null,
            { type: dto.type, amount: dto.amount, note: dto.note },
        );

        await this.em.flush();

        return { message: 'Cash movement created successfully.', id: cashMovement.id };
    }
}