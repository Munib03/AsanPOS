import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { JournalEntry } from '../database/entites/journal-entry.entity';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { SequenceService } from '../sequence/sequence.service';
import { Store } from '../database/entites/store.entity';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';

@Injectable()
export class JournalEntryService {
  constructor(
    private readonly sequenceService: SequenceService,
    private readonly em: EntityManager,
  ) {}

  async createFromStockIn(store: Store, stockInItems: StockInItem[], purchase: Purchase): Promise<void> {
    await this.em.populate(store, ['storeSettings', 'storeSettings.defaultAccount']);
    const defaultAccount = store.storeSettings?.defaultAccount;
    if (!defaultAccount)
      throw new NotFoundException(`Default account not found for store`);

    await this.em.populate(purchase.customer, ['payable']);
    const payableAccount = purchase.customer.payable;
    if (!payableAccount)
      throw new NotFoundException(`Payable account not found for customer`);

    const sequence = await this.sequenceService.generateSequence('JournalEntry', 'JRN');

    const journalEntry = this.em.create(JournalEntry, {
      sequence,
      status: JournalEntryStatus.PENDING,
    });

    this.em.persist(journalEntry);

    for (const stockInItem of stockInItems) {
      const amount = stockInItem.quantity * stockInItem.purchasedItem.unitPrice;

      // debit row — inventory account (asset increases)
      this.em.create(JournalEntryItem, {
        journalEntry,
        purchase,
        account: defaultAccount,
        debit: amount,
      });

      // credit row — payable account (liability increases)
      this.em.create(JournalEntryItem, {
        journalEntry,
        purchase,
        account: payableAccount,
        credit: amount,
      });
    }
  }
}