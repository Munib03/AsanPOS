import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sequence } from '../database/entites/sequence.entity';
import { Store } from '../database/entites/store.entity';

@Injectable()
export class SequenceService {
  constructor(private readonly em: EntityManager) {}

  async generateSequence(
    store: Store,
    entity: string,
    prefix: string,
  ): Promise<Sequence> {
    const last = await this.em.findOne(
      Sequence,
      { store, entity },
      { orderBy: { lastIndex: 'DESC' } },
    );

    const sequence = this.em.create(Sequence, {
      store,
      entity,
      prefix,
      lastIndex: (last?.lastIndex ?? 0) + 1,
    });

    await this.em.persistAndFlush(sequence);
    return sequence;
  }

  formatSequence(sequence: Sequence): string {
    return `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`;
  }
}
