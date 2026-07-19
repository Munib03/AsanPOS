import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { EntityManager } from '@mikro-orm/postgresql';
import { ToolLoopAgent } from 'ai';
import type { MessageEvent } from '@nestjs/common';
import { defer, Observable, switchMap } from 'rxjs';
import { DashboardService } from '../dashboard/dashboard.service';
import { AiChatMessage } from '../database/entites/ai-chat-message.entity';
import { AiChatThread } from '../database/entites/ai-chat-thread.entity';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import {
  AiChatThreadDetail,
  AiChatThreadSummary,
} from '../shared/types/ai-assistant.types';
import { AskAiAssistantDto } from './dto/ask-ai-assistant.dto';
import { streamAiAssistantResponse } from './helpers/ai-assistant.sse';
import { createAiAssistantTools } from './helpers/ai-assistant.tools';

const USER_MESSAGE_ROLE = 'user';
const ASSISTANT_MESSAGE_ROLE = 'assistant';
const MESSAGE_STATUS_COMPLETED = 'completed';
const MESSAGE_STATUS_FAILED = 'failed';
const AI_CHAT_PROVIDER = 'opencode';
const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
const DEFAULT_OPENCODE_MODEL = 'deepseek-v4-flash-free';
const AI_ASSISTANT_INSTRUCTIONS =
  'You are the AsanPOS assistant. Interpret each request using the conversation, the current UTC date, and the available tool descriptions. Independently decide whether a tool is needed, which tool or tools to call, their inputs, and their order. For current business facts, use fresh results from the appropriate tools and never invent values or reuse stale values from chat history. Resolve time references into exact ISO date ranges when a selected tool needs dates. Decide whether a visualization is useful and use the graph tool only when it improves the answer. Do not rely on keyword rules, fixed request categories, or fixed tool sequences. For requests outside AsanPOS or unsupported capabilities, state the limitation plainly. Use plain text only, without Markdown, emojis, hidden reasoning, thinking tags, or internal tool details.';

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly em: EntityManager,
  ) { }


  async findAllThreads(store: Store, employeeId: string): Promise<AiChatThreadSummary[]> {
    const threads = await this.em.find(
      AiChatThread,
      { store, employee: { id: employeeId }, deletedAt: null },
      { orderBy: { lastMessageAt: 'DESC', createdAt: 'DESC' } },
    );

    return threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    }));
  }


  async findOneThread(store: Store, employeeId: string, threadId: string): Promise<AiChatThreadDetail> {
    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      store,
      employee: { id: employeeId },
      deletedAt: null,
    });
    if (!thread)
      throw new NotFoundException('AI chat thread not found');

    const messages = await this.em.find(
      AiChatMessage,
      { thread },
      { orderBy: { createdAt: 'ASC' } },
    );

    return {
      id: thread.id,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: messages.map((message) => ({
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
      })),
    };
  }


  streamAnswer(store: Store, employeeId: string, body: AskAiAssistantDto): Observable<MessageEvent> {
    const model =
      process.env.OPENCODE_MODEL ??
      process.env.OPENAI_MODEL ??
      DEFAULT_OPENCODE_MODEL;

    return defer(async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
      }

      const prompt = body.question?.trim();
      if (!prompt)
        throw new BadRequestException('question is required');

      const employee = await this.em.findOne(
        Employee,
        { id: employeeId, store: { id: store.id } },
        { populate: ['store'], refresh: true },
      );

      if (!employee)
        throw new NotFoundException('Employee or store not found');

      const verifiedStore = employee.store;
      let thread: AiChatThread;

      if (body.threadId) {
        const existingThread = await this.em.findOne(AiChatThread, {
          id: body.threadId,
          store: verifiedStore,
          employee: { id: employeeId },
          deletedAt: null,
        });

        if (!existingThread)
          throw new NotFoundException('AI chat thread not found');

        thread = existingThread;
      }
      else {
        const now = new Date();
        thread = this.em.create(AiChatThread, {
          store: verifiedStore,
          employee,
          title: prompt.length <= 80 ? prompt : `${prompt.slice(0, 77)}...`,
          lastMessageAt: now,
          createdAt: now,
        });

        await this.em.persistAndFlush(thread);
      }

      const previousMessages = await this.em.find(
        AiChatMessage,
        {
          thread,
          role: { $in: [USER_MESSAGE_ROLE, ASSISTANT_MESSAGE_ROLE] },
          status: MESSAGE_STATUS_COMPLETED,
        },
        { orderBy: { createdAt: 'DESC' }, limit: 20 },
      );
      previousMessages.reverse();

      const userMessage = this.em.create(AiChatMessage, {
        thread,
        role: USER_MESSAGE_ROLE,
        content: prompt,
        status: MESSAGE_STATUS_COMPLETED,
        metadata: { source: 'ai-assistant-sse' },
      });

      thread.lastMessageAt = new Date();
      await this.em.persistAndFlush(userMessage);

      const openCode = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENCODE_BASE_URL ?? DEFAULT_OPENCODE_BASE_URL,
        name: AI_CHAT_PROVIDER,
      });

      const agent = new ToolLoopAgent({
        model: openCode.chat(model),
        temperature: 0,
        instructions: `${AI_ASSISTANT_INSTRUCTIONS} Current UTC date: ${new Date().toISOString().slice(0, 10)}.`,
        tools: createAiAssistantTools({
          dashboardService: this.dashboardService,
          em: this.em,
          store: verifiedStore,
          employeeId,
        }),
      });

      const result = await agent.stream({
        messages: [
          ...previousMessages.map((message) => ({
            role:
              message.role === ASSISTANT_MESSAGE_ROLE
                ? ('assistant' as const)
                : ('user' as const),
            content: message.content,
          })),
          { role: 'user' as const, content: prompt },
        ],
      });

      return streamAiAssistantResponse({
        result: {
          threadId: thread.id,
          userMessageId: userMessage.id,
          fullStream: result.fullStream,
        },

        saveAssistantMessage: (threadId, content, metadata) =>
          this.saveAssistantMessage(
            threadId,
            content,
            model,
            AI_CHAT_PROVIDER,
            MESSAGE_STATUS_COMPLETED,
            undefined,
            metadata,
          ),

        saveFailedAssistantMessage: async (threadId, content, error) => {
          await this.saveAssistantMessage(
            threadId,
            content,
            model,
            AI_CHAT_PROVIDER,
            MESSAGE_STATUS_FAILED,
            error instanceof Error
              ? error.message
              : 'Failed to stream assistant response.',
          );
        },
      });
    }).pipe(switchMap((events) => events));
  }


  async updateThreadTitle(
    store: Store,
    employeeId: string,
    threadId: string,
    title: string,
  ): Promise<AiChatThreadSummary> {
    const normalizedTitle = title?.trim();
    if (!normalizedTitle) throw new BadRequestException('title is required');

    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      store,
      employee: { id: employeeId },
      deletedAt: null,
    });
    if (!thread) throw new NotFoundException('AI chat thread not found');

    thread.title = normalizedTitle;
    thread.updatedAt = new Date();
    await this.em.flush();
    return {
      id: thread.id,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }


  async deleteThread(
    store: Store,
    employeeId: string,
    threadId: string,
  ): Promise<{ message: string; id: string }> {
    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      store,
      employee: { id: employeeId },
      deletedAt: null,
    });
    if (!thread) throw new NotFoundException('AI chat thread not found');

    const now = new Date();
    thread.deletedAt = now;
    thread.updatedAt = now;
    await this.em.flush();
    return { message: 'AI chat thread deleted successfully.', id: thread.id };
  }


  

  private async saveAssistantMessage(
    threadId: string,
    content: string,
    model: string,
    provider: string,
    status: string = MESSAGE_STATUS_COMPLETED,
    errorMessage?: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string }> {
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
      metadata,
    });
    thread.lastMessageAt = new Date();
    await this.em.persistAndFlush(message);
    return { id: message.id };
  }
}
