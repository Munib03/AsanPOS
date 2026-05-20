import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { JournalEntry } from '../database/entites/journal-entry.entity';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { SequenceService } from '../sequence/sequence.service';
import { Store } from '../database/entites/store.entity';
import { JournalEntryStatus } from '../shared/utils/journal-entry-status.enum';

@Injectable()
export class JournalEntryService {
  constructor(
    private readonly sequenceService: SequenceService,
    private readonly em: EntityManager,
  ) {}

  async createFromPurchase(em: EntityManager, store: Store, purchase: Purchase): Promise<void> {
    await em.populate(store, ['storeSettings', 'storeSettings.defaultAccount']);
    const defaultAccount = store.storeSettings?.defaultAccount;
    if (!defaultAccount)
      throw new NotFoundException(`Default account not found for store`);

    await em.populate(purchase.customer, ['payable']);
    const payableAccount = purchase.customer.payable;
    if (!payableAccount)
      throw new NotFoundException(`Payable account not found for customer`);

    const totalAmount = purchase.items.getItems().reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    const sequence = await this.sequenceService.generateSequence('JournalEntry', 'JRN');

    const journalEntry = em.create(JournalEntry, {
      sequence,
      status: JournalEntryStatus.PENDING,
    });

    em.persist(journalEntry);

    em.create(JournalEntryItem, {
      journalEntry,
      purchase,
      account: payableAccount,
      debit: totalAmount,
    });

    em.create(JournalEntryItem, {
      journalEntry,
      purchase,
      account: defaultAccount,
      credit: totalAmount,
    });
  }
}