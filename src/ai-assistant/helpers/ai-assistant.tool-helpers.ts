import { BadRequestException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { AuditLog } from '../../database/entites/audit-log.entity';
import { CashMovement } from '../../database/entites/cash-movement.entity';
import { Category } from '../../database/entites/category.entity';
import { Employee } from '../../database/entites/employee.entity';
import { JournalEntry } from '../../database/entites/journal-entry.entity';
import { Payment } from '../../database/entites/payments.entity';
import { Receipt } from '../../database/entites/receipt.entity';
import { Sale } from '../../database/entites/sale.entity';
import { StockIn } from '../../database/entites/stock-in.entity';
import { StockMovement } from '../../database/entites/stock-movement.entity';
import { StockOut } from '../../database/entites/stock-out.entity';
import { Store } from '../../database/entites/store.entity';
import { AuditActionType } from '../../shared/utils/audit-action-type.enum';
import { AuditEntityType } from '../../shared/utils/audit-entity-type.enum';

const DEFAULT_TOOL_LIMIT = 10;
const MAX_TOOL_LIMIT = 50;

export type LiveEntityResource =
  | 'employees'
  | 'categories'
  | 'payments'
  | 'stock_ins'
  | 'stock_outs'
  | 'stock_movements'
  | 'cash_movements'
  | 'receipts'
  | 'journal_entries';

export type DateBounds = { from: Date; to: Date };

export function clampToolLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_TOOL_LIMIT;
  return Math.min(Math.floor(limit), MAX_TOOL_LIMIT);
}

export async function getLiveEntityCount(
  em: EntityManager,
  storeWhere: { id: string },
  resource: LiveEntityResource,
): Promise<number> {
  switch (resource) {
    case 'employees':
      return em.count(Employee, { store: storeWhere });
    case 'categories':
      return em.count(Category, { store: storeWhere });
    case 'payments':
      return em.count(Payment, {
        $or: [
          { sale: { store: storeWhere } },
          { purchase: { store: storeWhere } },
        ],
      });
    case 'stock_ins':
      return em.count(StockIn, { inventory: { store: storeWhere } });
    case 'stock_outs':
      return em.count(StockOut, { sale: { store: storeWhere } });
    case 'stock_movements':
      return em.count(StockMovement, { store: storeWhere });
    case 'cash_movements':
      return em.count(CashMovement, { storeSession: { store: storeWhere } });
    case 'receipts':
      return em.count(Receipt, { store: storeWhere });
    case 'journal_entries':
      return em.count(JournalEntry, { store: storeWhere });
  }
}

export function getToolRange(
  range: string,
  from?: string,
  to?: string,
): DateBounds {
  const now = new Date();
  const startOfDay = (date: Date) => {
    const value = new Date(date);
    value.setUTCHours(0, 0, 0, 0);
    return value;
  };
  const endOfDay = (date: Date) => {
    const value = new Date(date);
    value.setUTCHours(23, 59, 59, 999);
    return value;
  };
  const addDays = (date: Date, days: number) => {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  };

  if (range === 'custom') {
    if (!from || !to) {
      throw new BadRequestException(
        'from and to are required for custom range',
      );
    }
    return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }
  if (range === 'yesterday') {
    const yesterday = addDays(now, -1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  }
  if (range === 'last_week') {
    return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
  }
  if (range === 'monthly') {
    return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

export function calculateSaleTotal(sale: Sale): number {
  return sale.items
    .getItems()
    .reduce(
      (sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0),
      0,
    );
}

export async function getEmployeeSaleIdsByRange(
  em: EntityManager,
  store: Store,
  employeeId: string,
  bounds?: DateBounds,
): Promise<string[]> {
  const payments = await em.find(
    Payment,
    {
      sale: { store: { id: store.id } },
      storeSession: {
        store: { id: store.id },
        openedBy: { id: employeeId, store: { id: store.id } },
      },
      ...(bounds ? { createdAt: { $gte: bounds.from, $lte: bounds.to } } : {}),
    },
    { populate: ['sale'], refresh: true },
  );

  return [
    ...new Set(
      payments
        .map((payment) => payment.sale?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export async function getEmployeeCreatedEntityIds(
  em: EntityManager,
  store: Store,
  employeeId: string,
  entityType: AuditEntityType,
  bounds?: DateBounds,
): Promise<string[]> {
  const logs = await em.find(
    AuditLog,
    {
      employee: { id: employeeId, store: { id: store.id } },
      entityType,
      actionType: AuditActionType.Create,
      ...(bounds ? { createdAt: { $gte: bounds.from, $lte: bounds.to } } : {}),
    },
    { refresh: true },
  );

  return [
    ...new Set(
      logs.map((log) => log.entityId).filter((id): id is string => Boolean(id)),
    ),
  ];
}
