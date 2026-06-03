import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { JournalEntryService } from './journal-entry.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';

@Controller('journal-entries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
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