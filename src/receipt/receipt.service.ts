import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Receipt } from '../database/entites/receipt.entity';
import { Store } from '../database/entites/store.entity';
import { StoreSession } from '../database/entites/store-session.entity';

@Injectable()
export class ReceiptService {
  constructor(private readonly em: EntityManager) {}

  async findAll(store: Store) {
    return this.em.findAll(Receipt, {
      where: { store },
      orderBy: { createdAt: 'DESC' },
    });
  }

  async findOne(store: Store, id: string) {
    const receipt = await this.em.findOne(Receipt, { id, store });
    if (!receipt)
      throw new NotFoundException(`Receipt with id ${id} not found`);

    return receipt;
  }

  async create(
    em: EntityManager,
    store: Store,
    session: StoreSession,
    items: Record<string, any>,
  ): Promise<Receipt> {
    const receipt = em.create(Receipt, {
      store,
      session,
      items,
    });

    em.persist(receipt);

    return receipt;
  }
}