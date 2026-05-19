import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { JournalEntry } from '../database/entites/journal-entry.entity';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { JournalEntryService } from './journal-entry.service';
import { SequenceModule } from '../sequence/sequence.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([JournalEntry, JournalEntryItem]),
    SequenceModule,
  ],
  providers: [JournalEntryService],
  exports: [JournalEntryService],
})
export class JournalEntryModule {}