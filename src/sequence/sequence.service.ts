import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sequence } from '../database/entites/sequence.entity';

@Injectable()
export class SequenceService {
  constructor(private readonly em: EntityManager) {}

  async generateSequence(em: EntityManager, entity: string, prefix: string): Promise<Sequence> {
    let sequence = await em.findOne(Sequence, { entity });

    if (!sequence) {
      sequence = em.create(Sequence, {
        entity,
        prefix,
        lastIndex: 0,
      });
      await em.persistAndFlush(sequence);
    }

    sequence.lastIndex += 1;
    await em.flush();

    return sequence;
  }

  formatSequence(sequence: Sequence): string {
    return `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`;
  }
}