import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiAssistantService } from './ai-assistant.service';
import { AskAiAssistantDto } from './dto/ask-ai-assistant.dto';
import { UpdateAiChatThreadDto } from './dto/update-ai-chat-thread.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';

@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get('threads')
  findAllThreads(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
  ) {
    return this.aiAssistantService.findAllThreads(store, user.id);
  }

  @Get('threads/:id')
  findOneThread(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.aiAssistantService.findOneThread(store, user.id, id);
  }

  @Put('threads/:id')
  updateThreadTitle(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: UpdateAiChatThreadDto,
  ) {
    return this.aiAssistantService.updateThreadTitle(
      store,
      user.id,
      id,
      body.name,
    );
  }

  @Delete('threads/:id')
  deleteThread(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.aiAssistantService.deleteThread(store, user.id, id);
  }

  @Post('ask/stream')
  async askStream(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() body: AskAiAssistantDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.aiAssistantService.streamAnswerToResponse(
      store,
      user.id,
      body,
      res,
    );
  }
}
