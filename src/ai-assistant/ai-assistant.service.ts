import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { stepCountIs, streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { Response } from 'express';
import { DashboardService } from '../dashboard/dashboard.service';
import { AiChatMessage } from '../database/entites/ai-chat-message.entity';
import { AiChatThread } from '../database/entites/ai-chat-thread.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import {
  AiAssistantStreamResponse,
  AiChatMessageResponse,
  AiChatThreadDetail,
  AiChatThreadSummary,
  PreparedAiChatTurn,
} from '../shared/types/ai-assistant.types';
import { AskAiAssistantDto } from './dto/ask-ai-assistant.dto';
import {
  AI_CHAT_PROVIDER,
  createOpenCodeProvider,
  getAiModelName,
  getFreshDataTool,
} from './helpers/ai-assistant.model';
import { getAnalystSystemPrompt } from './helpers/ai-assistant.prompt';
import { streamAiAssistantResponse } from './helpers/ai-assistant.sse';
import { createAiAssistantTools } from './helpers/ai-assistant.tools';

const USER_MESSAGE_ROLE = 'user';
const ASSISTANT_MESSAGE_ROLE = 'assistant';
const MESSAGE_STATUS_COMPLETED = 'completed';
const MESSAGE_STATUS_FAILED = 'failed';

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly em: EntityManager,
  ) {}

  async streamAnswerToResponse(
    store: Store,
    employeeId: string,
    body: AskAiAssistantDto,
    res: Response,
  ): Promise<void> {
    const result = await this.streamAnswer(
      store,
      employeeId,
      body.question,
      body.threadId,
    );
    const model = getAiModelName();

    return streamAiAssistantResponse({
      result,
      res,
      saveAssistantMessage: (threadId, content) =>
        this.saveAssistantMessage(
          threadId,
          content,
          model,
          AI_CHAT_PROVIDER,
        ),
      saveFailedAssistantMessage: (threadId, content, error) =>
        this.saveFailedAssistantMessage(
          threadId,
          content,
          model,
          AI_CHAT_PROVIDER,
          error,
        ),
    });
  }

  async streamAnswer(
    store: Store,
    employeeId: string,
    question: string,
    threadId?: string,
  ): Promise<AiAssistantStreamResponse> {
    const prompt = this.validateQuestion(question);
    const verifiedStore = await this.getVerifiedStore(store.id, employeeId);
    const { thread, userMessage, messages } = await this.prepareChatTurn(
      verifiedStore,
      employeeId,
      prompt,
      threadId,
    );
    const freshDataTool = getFreshDataTool(prompt);
    const openCode = createOpenCodeProvider();

    const result = streamText({
      model: openCode.chat(getAiModelName()),
      temperature: 0,
      system: getAnalystSystemPrompt(),
      messages,
      stopWhen: stepCountIs(5),
      tools: createAiAssistantTools({
        dashboardService: this.dashboardService,
        em: this.em,
        store: verifiedStore,
        employeeId,
      }),
      prepareStep: ({ stepNumber }) => {
        if (stepNumber !== 0) return {};

        return freshDataTool
          ? { toolChoice: { type: 'tool' as const, toolName: freshDataTool } }
          : { toolChoice: 'required' as const };
      },
    });

    return {
      threadId: thread.id,
      userMessageId: userMessage.id,
      textStream: result.textStream,
    };
  }

  findAllThreads(store: Store, employeeId: string) {
    return this.getAllThreads(store, employeeId);
  }

  findOneThread(store: Store, employeeId: string, threadId: string) {
    return this.getOneThread(store, employeeId, threadId);
  }

  updateThreadTitle(
    store: Store,
    employeeId: string,
    threadId: string,
    title: string,
  ) {
    return this.renameThread(store, employeeId, threadId, title);
  }

  deleteThread(store: Store, employeeId: string, threadId: string) {
    return this.removeThread(store, employeeId, threadId);
  }

  private async getVerifiedStore(
    requestedStoreId: string,
    employeeId: string,
  ): Promise<Store> {
    const employee = await this.em.findOne(
      Employee,
      { id: employeeId, store: { id: requestedStoreId } },
      { populate: ['store'], refresh: true },
    );
    if (!employee) throw new NotFoundException('Employee or store not found');

    return employee.store;
  }

  private async prepareChatTurn(
    store: Store,
    employeeId: string,
    prompt: string,
    threadId?: string,
  ): Promise<PreparedAiChatTurn> {
    const thread = await this.resolveThread(
      store,
      employeeId,
      prompt,
      threadId,
    );
    const previousMessages = await this.loadRecentThreadMessages(thread);
    const userMessage = this.em.create(AiChatMessage, {
      thread,
      role: USER_MESSAGE_ROLE,
      content: prompt,
      status: MESSAGE_STATUS_COMPLETED,
      metadata: { source: 'ai-assistant-sse' },
    });
    thread.lastMessageAt = new Date();
    await this.em.persistAndFlush(userMessage);

    return {
      thread,
      userMessage,
      messages: [
        ...previousMessages.map((message) => this.toModelMessage(message)),
        { role: USER_MESSAGE_ROLE, content: prompt },
      ],
    };
  }

  private async saveAssistantMessage(
    threadId: string,
    content: string,
    model: string,
    provider: string,
    status: string = MESSAGE_STATUS_COMPLETED,
    errorMessage?: string,
  ): Promise<AiChatMessage> {
    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      deletedAt: null,
    });
    if (!thread) throw new NotFoundException('AI chat thread not found');

    const message = this.em.create(AiChatMessage, {
      thread,
      role: ASSISTANT_MESSAGE_ROLE,
      content,
      status,
      errorMessage,
      model,
      provider,
    });
    thread.lastMessageAt = new Date();
    await this.em.persistAndFlush(message);
    return message;
  }

  private async saveFailedAssistantMessage(
    threadId: string,
    content: string,
    model: string,
    provider: string,
    error: unknown,
  ): Promise<void> {
    await this.saveAssistantMessage(
      threadId,
      content,
      model,
      provider,
      MESSAGE_STATUS_FAILED,
      error instanceof Error
        ? error.message
        : 'Failed to stream assistant response.',
    );
  }

  private async getAllThreads(
    store: Store,
    employeeId: string,
  ): Promise<AiChatThreadSummary[]> {
    const threads = await this.em.find(
      AiChatThread,
      { store, employee: { id: employeeId }, deletedAt: null },
      { orderBy: { lastMessageAt: 'DESC', createdAt: 'DESC' } },
    );
    return threads.map((thread) => this.toThreadSummary(thread));
  }

  private async getOneThread(
    store: Store,
    employeeId: string,
    threadId: string,
  ): Promise<AiChatThreadDetail> {
    const thread = await this.findOwnedThread(store, employeeId, threadId);
    const messages = await this.em.find(
      AiChatMessage,
      { thread },
      { orderBy: { createdAt: 'ASC' } },
    );
    return {
      ...this.toThreadSummary(thread),
      messages: messages.map((message) => this.toMessageResponse(message)),
    };
  }

  private async renameThread(
    store: Store,
    employeeId: string,
    threadId: string,
    title: string,
  ): Promise<AiChatThreadSummary> {
    const normalizedTitle = title?.trim();
    if (!normalizedTitle) throw new BadRequestException('title is required');

    const thread = await this.findOwnedThread(store, employeeId, threadId);
    thread.title = normalizedTitle;
    thread.updatedAt = new Date();
    await this.em.flush();
    return this.toThreadSummary(thread);
  }

  private async removeThread(
    store: Store,
    employeeId: string,
    threadId: string,
  ): Promise<{ message: string; id: string }> {
    const thread = await this.findOwnedThread(store, employeeId, threadId);
    const now = new Date();
    thread.deletedAt = now;
    thread.updatedAt = now;
    await this.em.flush();
    return { message: 'AI chat thread deleted successfully.', id: thread.id };
  }

  private async resolveThread(
    store: Store,
    employeeId: string,
    prompt: string,
    threadId?: string,
  ): Promise<AiChatThread> {
    const employee = await this.em.findOne(Employee, { id: employeeId, store });
    if (!employee) throw new NotFoundException('Employee not found');
    if (threadId) return this.findOwnedThread(store, employeeId, threadId);

    const now = new Date();
    const thread = this.em.create(AiChatThread, {
      store,
      employee,
      title: prompt.length <= 80 ? prompt : `${prompt.slice(0, 77)}...`,
      lastMessageAt: now,
      createdAt: now,
    });
    await this.em.persistAndFlush(thread);
    return thread;
  }

  private async findOwnedThread(
    store: Store,
    employeeId: string,
    threadId: string,
  ): Promise<AiChatThread> {
    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      store,
      employee: { id: employeeId },
      deletedAt: null,
    });
    if (!thread) throw new NotFoundException('AI chat thread not found');
    return thread;
  }

  private async loadRecentThreadMessages(
    thread: AiChatThread,
  ): Promise<AiChatMessage[]> {
    const messages = await this.em.find(
      AiChatMessage,
      {
        thread,
        role: { $in: [USER_MESSAGE_ROLE, ASSISTANT_MESSAGE_ROLE] },
        status: MESSAGE_STATUS_COMPLETED,
      },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    );
    return messages.reverse();
  }

  private toModelMessage(message: AiChatMessage): ModelMessage {
    return {
      role:
        message.role === ASSISTANT_MESSAGE_ROLE
          ? ASSISTANT_MESSAGE_ROLE
          : USER_MESSAGE_ROLE,
      content: message.content,
    };
  }

  private toThreadSummary(thread: AiChatThread): AiChatThreadSummary {
    return {
      id: thread.id,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  private toMessageResponse(message: AiChatMessage): AiChatMessageResponse {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      errorMessage: message.errorMessage,
      model: message.model,
      provider: message.provider,
      metadata: message.metadata,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private validateQuestion(question: string): string {
    const prompt = question?.trim();
    if (!prompt) throw new BadRequestException('question is required');
    return prompt;
  }
}
