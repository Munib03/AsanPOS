import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { JournalEntryService } from './journal-entry.service';

@Controller('journal-entries')
export class JournalEntryController {
  constructor(
    private readonly journalEntryService: JournalEntryService,
  ) {}

  @Get()
  async findAll() {
    return this.journalEntryService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const journalEntry = await this.journalEntryService.findOne(id);

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found');
    }

    return journalEntry;
  }
}