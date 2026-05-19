import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sequence } from '../database/entites/sequence.entity';

@Injectable()
export class SequenceService {
  constructor(private readonly em: EntityManager) {}

  async generateSequence(entity: string, prefix: string): Promise<Sequence> {
    const last = await this.em.findOne(Sequence, { entity }, { orderBy: { lastIndex: 'DESC' } });

    const sequence = this.em.create(Sequence, {
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