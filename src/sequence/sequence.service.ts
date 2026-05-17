import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Sequence } from '../database/entites/sequence.entity';

@Injectable()
export class SequenceService {
  constructor(private readonly em: EntityManager) {}

  async generateSequence(em: EntityManager, entity: string): Promise<Sequence> {
    const sequence = await em.findOne(Sequence, { entity });
    if (!sequence)
      throw new NotFoundException(`Sequence for entity ${entity} not found`);

    sequence.lastIndex += 1;
    await em.flush();

    return sequence;
  }

  formatSequence(sequence: Sequence): string {
    return `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`;
  }
}