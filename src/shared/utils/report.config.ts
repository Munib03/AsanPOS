import { EntityName } from '@mikro-orm/postgresql';
import { FilterOptions } from '../repositories/base.repository'; // <-- same source as the service

import { CashMovement } from '../../database/entites/cash-movement.entity';
import { Inventory } from '../../database/entites/inventory.entity';
import { Payment } from '../../database/entites/payments.entity';
import { Purchase } from '../../database/entites/purchase.entity';
import { Sale } from '../../database/entites/sale.entity';
import { StockIn } from '../../database/entites/stock-in.entity';
import { StockOut } from '../../database/entites/stock-out.entity';
import { StockIn as _StockIn } from '../../database/entites/stock-in.entity'; // (remove if duplicated)
import { StockOut as _StockOut } from '../../database/entites/stock-out.entity'; // (remove if duplicated)
import { Store } from '../../database/entites/store.entity';

import { ReportType } from '../../reports/dto/report-query.dto';

export type ExportColumn = { header: string; key: string };

export type ReportConfig = {
  entity: EntityName<any>;
  storeFilter: (store: Store) => Record<string, any>;
  populate: string[];
  fields: string[];
  filterOptions: FilterOptions<any>;
  exportColumns: ExportColumn[];
};

export const REPORT_CONFIG: Record<ReportType, ReportConfig> = {
  [ReportType.Sale]: {
    entity: Sale,
    storeFilter: (store) => ({ store }),
    populate: ['customer', 'sequence', 'items', 'items.product'],
    fields: [
      'id',
      'status',
      'createdAt',
      'customer.id',
      'customer.name',
      'sequence.prefix',
      'sequence.lastIndex',
      'items.id',
      'items.quantity',
      'items.unitPrice',
      'items.product.id',
      'items.product.name',
    ],
    filterOptions: {
      searchable: ['status'],
      sortable: ['createdAt', 'status'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Status', key: 'status' },
      { header: 'Customer', key: 'customer.name' },
      { header: 'Total Items', key: 'items.length' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },

  [ReportType.Purchase]: {
    entity: Purchase,
    storeFilter: (store) => ({ store }),
    populate: ['customer', 'sequence', 'inventory', 'items', 'items.product'],
    fields: [
      'id',
      'status',
      'customDate',
      'createdAt',
      'customer.id',
      'customer.name',
      'inventory.id',
      'inventory.name',
      'sequence.prefix',
      'sequence.lastIndex',
      'items.id',
      'items.quantity',
      'items.unitPrice',
      'items.product.id',
      'items.product.name',
    ],
    filterOptions: {
      searchable: ['status'],
      sortable: ['createdAt', 'status', 'customDate'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Status', key: 'status' },
      { header: 'Customer', key: 'customer.name' },
      { header: 'Inventory', key: 'inventory.name' },
      { header: 'Custom Date', key: 'customDate' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },

  [ReportType.Inventory]: {
    entity: Inventory,
    storeFilter: (store) => ({ store }),
    populate: ['products', 'stockQuantities', 'stockQuantities.product'],
    fields: [
      'id',
      'name',
      'address',
      'createdAt',
      'products.id',
      'products.name',
      'products.price',
      'stockQuantities.id',
      'stockQuantities.quantity',
      'stockQuantities.product.id',
      'stockQuantities.product.name',
    ],
    filterOptions: {
      searchable: ['name', 'address'],
      sortable: ['createdAt', 'name'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Name', key: 'name' },
      { header: 'Address', key: 'address' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },

  [ReportType.StockIn]: {
    entity: StockIn,
    storeFilter: (store) => ({ inventory: { store } }),
    populate: ['inventory', 'purchase', 'sequence', 'items', 'items.product'],
    fields: [
      'id',
      'status',
      'createdAt',
      'inventory.id',
      'inventory.name',
      'purchase.id',
      'sequence.prefix',
      'sequence.lastIndex',
      'items.id',
      'items.quantity',
      'items.product.id',
      'items.product.name',
    ],
    filterOptions: {
      searchable: ['status'],
      sortable: ['createdAt', 'status'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Status', key: 'status' },
      { header: 'Inventory', key: 'inventory.name' },
      { header: 'Purchase ID', key: 'purchase.id' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },

  [ReportType.StockOut]: {
    entity: StockOut,
    storeFilter: (store) => ({ inventory: { store } }),
    populate: ['inventory', 'sequence', 'items', 'items.product'],
    fields: [
      'id',
      'status',
      'createdAt',
      'inventory.id',
      'inventory.name',
      'sequence.prefix',
      'sequence.lastIndex',
      'items.id',
      'items.quantity',
      'items.product.id',
      'items.product.name',
    ],
    filterOptions: {
      searchable: ['status'],
      sortable: ['createdAt', 'status'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Status', key: 'status' },
      { header: 'Inventory', key: 'inventory.name' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },

  [ReportType.Payment]: {
    entity: Payment,
    storeFilter: (store) => ({ storeSession: { store } }),
    populate: ['sale', 'purchase', 'storeSession'],
    fields: [
      'id',
      'amount',
      'status',
      'note',
      'createdAt',
      'sale.id',
      'purchase.id',
      'storeSession.id',
    ],
    filterOptions: {
      searchable: ['status'],
      sortable: ['createdAt', 'status', 'amount'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Amount', key: 'amount' },
      { header: 'Status', key: 'status' },
      { header: 'Note', key: 'note' },
      { header: 'Sale ID', key: 'sale.id' },
      { header: 'Purchase ID', key: 'purchase.id' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },

  [ReportType.CashMovement]: {
    entity: CashMovement,
    storeFilter: (store) => ({ storeSession: { store } }),
    populate: ['storeSession', 'createdBy'],
    fields: [
      'id',
      'type',
      'amount',
      'status',
      'note',
      'createdAt',
      'storeSession.id',
      'createdBy.id',
      'createdBy.firstName',
      'createdBy.lastName',
    ],
    filterOptions: {
      searchable: ['type', 'status', 'note'],
      sortable: ['createdAt', 'type', 'amount', 'status'],
    },
    exportColumns: [
      { header: 'ID', key: 'id' },
      { header: 'Type', key: 'type' },
      { header: 'Amount', key: 'amount' },
      { header: 'Status', key: 'status' },
      { header: 'Note', key: 'note' },
      { header: 'Created By First Name', key: 'createdBy.firstName' },
      { header: 'Created By Last Name', key: 'createdBy.lastName' },
      { header: 'Created At', key: 'createdAt' },
    ],
  },
};
