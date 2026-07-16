import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AiAssistantService } from './ai-assistant.service';
import { AskAiAssistantDto } from './dto/ask-ai-assistant.dto';
import { UpdateAiChatThreadDto } from './dto/update-ai-chat-thread.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Store } from '../database/entites/store.entity';
import { Role } from '../shared/utils/role.enum';
import { Roles } from '../shared/decorators/role.decorator';


@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
@Roles(Role.Admin)
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


  @Post('ask')
  @Sse('ask')
  askStream(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() body: AskAiAssistantDto,
  ): Observable<MessageEvent> {
    return this.aiAssistantService.streamAnswer(store, user.id, body);
  }
}
