import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { JournalEntry } from '../database/entites/journal-entry.entity';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { JournalEntryService } from './journal-entry.service';
import { SequenceModule } from '../sequence/sequence.module';
import { JournalEntryController } from './journal-entry.controller';
import { BaseRepository } from '../shared/repositories/base.repository';

@Module({
  imports: [
    MikroOrmModule.forFeature([JournalEntry, JournalEntryItem]),
    SequenceModule,
  ],
  providers: [
    JournalEntryService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, JournalEntry),
      inject: [EntityManager],
    },
  ],
  controllers: [JournalEntryController],
  exports: [JournalEntryService],
})
export class JournalEntryModule {}