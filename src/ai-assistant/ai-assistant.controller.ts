import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiAssistantService } from './ai-assistant.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { UpdateAiChatThreadDto } from './dto/update-ai-chat-thread.dto';

interface AskAssistantBody {
  question: string;
  threadId?: string;
}

interface StreamSanitizerState {
  buffer: string;
  inHiddenBlock: boolean;
}

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
    @Body() body: AskAssistantBody,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.aiAssistantService.streamAnswer(
      store,
      user.id,
      body.question,
      body.threadId,
    );

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let fullResponse = '';
    const sanitizer: StreamSanitizerState = {
      buffer: '',
      inHiddenBlock: false,
    };

    try {
      for await (const chunk of result.textStream) {
        if (res.writableEnded) return;

        const safeChunk = this.sanitizeStreamChunk(chunk, sanitizer);
        if (!safeChunk) continue;

        fullResponse += safeChunk;
        this.writeSseEvent(res, 'chunk', { content: safeChunk });
      }

      const finalChunk = this.flushSanitizedStream(sanitizer);
      if (finalChunk) {
        fullResponse += finalChunk;
        this.writeSseEvent(res, 'chunk', { content: finalChunk });
      }

      const assistantMessage =
        await this.aiAssistantService.saveAssistantMessage(
          result.threadId,
          fullResponse,
        );

      this.writeSseEvent(res, 'done', {
        content: fullResponse,
        threadId: result.threadId,
        userMessageId: result.userMessageId,
        assistantMessageId: assistantMessage.id,
      });
      res.end();
    } catch (error) {
      try {
        await this.aiAssistantService.saveFailedAssistantMessage(
          result.threadId,
          fullResponse,
          error,
        );
      } catch {}

      this.writeSseEvent(res, 'error', {
        threadId: result.threadId,
        userMessageId: result.userMessageId,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to stream assistant response.',
      });
      res.end();
    }
  }

  private writeSseEvent(
    res: Response,
    event: string,
    data: Record<string, unknown>,
  ): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private sanitizeStreamChunk(
    chunk: string,
    state: StreamSanitizerState,
  ): string {
    const startTags = ['<think>', '<thinking>'];
    const endTags = ['</think>', '</thinking>'];
    const maxStartTagLength = Math.max(...startTags.map((tag) => tag.length));
    const maxEndTagLength = Math.max(...endTags.map((tag) => tag.length));
    let output = '';

    state.buffer += chunk;

    while (state.buffer.length > 0) {
      const lowerBuffer = state.buffer.toLowerCase();

      if (state.inHiddenBlock) {
        const endMatch = this.findEarliestTag(lowerBuffer, endTags);

        if (!endMatch) {
          state.buffer = state.buffer.slice(-(maxEndTagLength - 1));
          return output;
        }

        state.buffer = state.buffer.slice(endMatch.index + endMatch.tag.length);
        state.inHiddenBlock = false;
        continue;
      }

      const startMatch = this.findEarliestTag(lowerBuffer, startTags);

      if (startMatch) {
        output += state.buffer.slice(0, startMatch.index);
        state.buffer = state.buffer.slice(
          startMatch.index + startMatch.tag.length,
        );
        state.inHiddenBlock = true;
        continue;
      }

      if (state.buffer.length < maxStartTagLength) return output;

      const safeLength = state.buffer.length - (maxStartTagLength - 1);
      output += state.buffer.slice(0, safeLength);
      state.buffer = state.buffer.slice(safeLength);
      return output;
    }

    return output;
  }

  private flushSanitizedStream(state: StreamSanitizerState): string {
    if (state.inHiddenBlock) {
      state.buffer = '';
      state.inHiddenBlock = false;
      return '';
    }

    const output = state.buffer;
    state.buffer = '';
    return output;
  }

  private findEarliestTag(
    text: string,
    tags: string[],
  ): { index: number; tag: string } | null {
    return tags.reduce<{ index: number; tag: string } | null>((best, tag) => {
      const index = text.indexOf(tag);
      if (index === -1) return best;
      if (!best || index < best.index) return { index, tag };
      return best;
    }, null);
  }
}
