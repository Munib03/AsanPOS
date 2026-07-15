import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { JournalEntry } from '../database/entites/journal-entry.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { Sale } from '../database/entites/sale.entity';
import { Store } from '../database/entites/store.entity';
import { Employee } from '../database/entites/employee.entity';
import { Account } from '../database/entites/account.entity';
import { SequenceService } from '../sequence/sequence.service';
import { BaseRepository } from '../shared/repositories/base.repository';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { AuditActionType } from '../shared/utils/audit-action-type.enum';

@Injectable()
export class JournalEntryService {
  constructor(
    private readonly sequenceService: SequenceService,
    private readonly em: EntityManager,
    private readonly journalEntryRepository: BaseRepository<JournalEntry>,
    private readonly auditService: AuditService,
  ) { }

  async findAll(store: Store, query: PaginateQuery) {
    const [journalEntries, meta] = await this.journalEntryRepository.findAndPaginate(
      { store },
      {
        populate: ['sequence', 'items', 'items.account'],
        orderBy: { createdAt: 'DESC' },
        exclude: [
          'items.purchase.createdAt',
          'items.purchase.updatedAt',
          'updatedAt',
          'sequence.createdAt',
          'sequence.updatedAt',
          'items.account.createdAt',
          'items.account.updatedAt',
          'items.updatedAt',
        ],
      },
      { searchable: [] },
      query,
    );

    return { data: journalEntries, meta };
  }

  async findOne(id: string): Promise<any> {
    const journalEntry = await this.em.findOne(
      JournalEntry,
      { id },
      {
        populate: [
          'sequence',
          'items',
          'items.account',
          'items.purchase',
          'items.purchase.items',
          'items.purchase.items.product',
          'items.sale',
          'items.sale.items',
          'items.sale.items.product',
        ],
        exclude: [
          'items.purchase.createdAt',
          'items.purchase.updatedAt',
          'createdAt',
          'updatedAt',
          'sequence.createdAt',
          'sequence.updatedAt',
          'items.account.createdAt',
          'items.account.updatedAt',
          'items.createdAt',
          'items.updatedAt',
          'items.purchase.items.product.createdAt',
          'items.purchase.items.product.updatedAt',
          'items.sale.items.product.createdAt',
          'items.sale.items.product.updatedAt',
        ],
      },
    );

    if (!journalEntry) throw new NotFoundException('Journal entry not found');

    const totalCurrBill = journalEntry.items.getItems().reduce((sum, item) => {
      const purchaseTotal =
        item.purchase?.items?.getItems()?.reduce(
          (pSum, pItem) => pSum + pItem.quantity * pItem.unitPrice, 0,
        ) ?? 0;

      const saleTotal =
        item.sale?.items?.getItems()?.reduce(
          (sSum, sItem) => sSum + (sItem.quantity ?? 0) * (sItem.unitPrice ?? 0), 0,
        ) ?? 0;

      return sum + purchaseTotal + saleTotal;
    }, 0);

    return { ...journalEntry, totalCurrBill };
  }

  async createFromPurchase(
    em: EntityManager,
    store: Store,
    purchase: Purchase,
    employeeId: string,
  ): Promise<JournalEntry> {
    const defaultAccount = await this.getDefaultAccount(em, store);

    await em.populate(purchase.customer, ['receivable']);
    const receivableAccount = purchase.customer.receivable;
    if (!receivableAccount)
      throw new NotFoundException(`Receivable account not found for customer`);

    const totalAmount = purchase.items
      .getItems()
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return this.createJournalEntry(em, store, employeeId, {
      debitAccount: defaultAccount,
      creditAccount: receivableAccount,
      totalAmount,
      link: { purchase },
      source: 'Purchase',
      sourceId: purchase.id,
    });
  }

  async createFromSale(
    em: EntityManager,
    store: Store,
    sale: Sale,
    employeeId: string,
  ): Promise<JournalEntry> {
    const defaultAccount = await this.getDefaultAccount(em, store);

    await em.populate(sale.customer, ['payable']);
    const payableAccount = sale.customer.payable;
    if (!payableAccount)
      throw new NotFoundException(`Payable account not found for customer`);

    const totalAmount = sale.items
      .getItems()
      .reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0);

    return this.createJournalEntry(em, store, employeeId, {
      debitAccount: payableAccount,
      creditAccount: defaultAccount,
      totalAmount,
      link: { sale },
      source: 'Sale',
      sourceId: sale.id,
    });
  }

  private async getDefaultAccount(em: EntityManager, store: Store): Promise<Account> {
    await em.populate(store, ['storeSettings', 'storeSettings.defaultAccount']);
    const defaultAccount = store.storeSettings?.defaultAccount;
    if (!defaultAccount) throw new NotFoundException(`Default account not found for store`);
    return defaultAccount;
  }

  private async createJournalEntry(
    em: EntityManager,
    store: Store,
    employeeId: string,
    params: {
      debitAccount: Account;
      creditAccount: Account;
      totalAmount: number;
      link: { purchase: Purchase } | { sale: Sale };
      source: 'Purchase' | 'Sale';
      sourceId: string;
    },
  ): Promise<JournalEntry> {
    const { debitAccount, creditAccount, totalAmount, link, source, sourceId } = params;

    const sequence = await this.sequenceService.generateSequence(store, 'JournalEntry', 'JRN');

    const journalEntry = em.create(JournalEntry, {
      sequence,
      store,
      status: JournalEntryStatus.PENDING,
    });
    em.persist(journalEntry);

    em.create(JournalEntryItem, { journalEntry, ...link, account: debitAccount, debit: totalAmount });
    em.create(JournalEntryItem, { journalEntry, ...link, account: creditAccount, credit: totalAmount });

    const employee = await em.findOne(Employee, { id: employeeId });
    if (!employee) throw new NotFoundException('Employee not found');

    this.auditService.log(
      em,
      employee,
      AuditEntityType.JournalEntry,
      journalEntry.id,
      AuditActionType.Create,
      null,
      {
        sequence: this.sequenceService.formatSequence(sequence),
        store: store.id,
        status: journalEntry.status,
        source,
        sourceId,
        totalAmount,
      },
    );

    return journalEntry;
  }
}
