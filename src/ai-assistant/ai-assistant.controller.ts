import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('ask')
  ask(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() body: AskAssistantBody,
  ) {
    return this.aiAssistantService.ask(store, user.id, body.question);
  }

  @Post('ask/stream')
  askStream(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() body: AskAssistantBody,
    @Res() res: Response,
  ) {
    const result = this.aiAssistantService.streamAnswer(
      store,
      user.id,
      body.question,
    );

    result.pipeTextStreamToResponse(res, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  }
}
