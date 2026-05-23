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



  async findAll(): Promise<JournalEntry[]> {
    return this.em.find(
      JournalEntry,
      {},
      {
        populate: [
          'sequence',
          'items',
          'items.account',
          // 'items.purchase',
        ],
        orderBy: {
          createdAt: 'DESC',
        },
        exclude: ['items.purchase.createdAt', 'items.purchase.updatedAt', 'createdAt', 'updatedAt', 
          'sequence.createdAt', 'sequence.updatedAt', 'items.account.createdAt', 'items.account.updatedAt',
          'items.createdAt', 'items.updatedAt'
        ],
      },
    );
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
        ],
      },
    );

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found');
    }

    const totalCurrBill =
      journalEntry.items
        .getItems()
        .reduce((sum, item) => {
          const purchaseTotal =
            item.purchase?.items
              ?.getItems()
              ?.reduce(
                (pSum, pItem) => pSum + pItem.quantity * pItem.unitPrice,
                0,
              ) ?? 0;

          return sum + purchaseTotal;
        }, 0);

    return {
      ...journalEntry,
      totalCurrBill,
    };
  }


  async createFromPurchase(em: EntityManager, store: Store, purchase: Purchase): Promise<void> {
    await em.populate(store, ['storeSettings', 'storeSettings.defaultAccount']);
    const defaultAccount = store.storeSettings?.defaultAccount;
    if (!defaultAccount)
      throw new NotFoundException(`Default account not found for store`);

    await em.populate(purchase.customer, ['payable']);
    const payableAccount = purchase.customer.payable;
    if (!payableAccount)
      throw new NotFoundException(`Payable account not found for customer`);

    const receivableAccount = purchase.customer.receivable;
    if (!receivableAccount)
      throw new NotFoundException(`Receivable account not found for customer`);

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
      account: defaultAccount,
      debit: totalAmount,
    });

    em.create(JournalEntryItem, {
      journalEntry,
      purchase,
      account: receivableAccount,
      credit: totalAmount,
    });

    await em.flush();
  }
}