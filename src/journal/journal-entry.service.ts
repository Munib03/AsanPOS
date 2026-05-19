import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { JournalEntry } from '../database/entites/journal-entry.entity';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { StockIn } from '../database/entites/stock-in.entity';
import { SequenceService } from '../sequence/sequence.service';

@Injectable()
export class JournalEntryService {
  constructor(
    private readonly em: EntityManager,
    private readonly sequenceService: SequenceService,
  ) {}

  async createFromStockIn(em: EntityManager, stockIn: StockIn, stockInItems: StockInItem[], purchase: Purchase): Promise<void> {
    const sequence = await this.sequenceService.generateSequence(em, 'JournalEntry', 'JRN');

    const journalEntry = em.create(JournalEntry, {
      sequence,
    });

    em.persist(journalEntry);

    for (const stockInItem of stockInItems) {
      const amount = stockInItem.quantity * stockInItem.purchasedItem.unitPrice;

      em.create(JournalEntryItem, {
        journalEntry,
        purchase,
        customer: purchase.customer,
        debit: amount,
        credit: amount,
      });
    }
  }
}