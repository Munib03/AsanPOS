import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';

interface AskAssistantBody {
  question: string;
}

@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) { }

  @Post('ask')
  ask(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() body: AskAssistantBody,
  ) {
    return this.aiAssistantService.ask(store, user.id, body.question);
  }
}
