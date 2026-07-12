import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardRange } from '../dashboard/dto/dashboard.dto';
import { Store } from '../database/entites/store.entity';
import { Employee } from '../database/entites/employee.entity';
import { AiChatThread } from '../database/entites/ai-chat-thread.entity';
import { AiChatMessage } from '../database/entites/ai-chat-message.entity';

const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_OPENCODE_MODEL = 'minimax-m3';
const AI_CHAT_PROVIDER = 'opencode';
const USER_MESSAGE_ROLE = 'user';
const ASSISTANT_MESSAGE_ROLE = 'assistant';
const MESSAGE_STATUS_COMPLETED = 'completed';
const MESSAGE_STATUS_FAILED = 'failed';

export interface AiAssistantStreamResponse {
  threadId: string;
  userMessageId: string;
  textStream: AsyncIterable<string>;
}

export interface AiChatThreadSummary {
  id: string;
  title?: string;
  lastMessageAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AiChatMessageResponse {
  id: string;
  role: string;
  content: string;
  status?: string;
  errorMessage?: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AiChatThreadDetail extends AiChatThreadSummary {
  messages: AiChatMessageResponse[];
}

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly em: EntityManager,
  ) {}

  async streamAnswer(
    store: Store,
    employeeId: string,
    question: string,
    threadId?: string,
  ): Promise<AiAssistantStreamResponse> {
    const prompt = this.validateQuestion(question);
    const openCode = this.createOpenCodeProvider();
    const model = this.getModelName();
    const { thread, userMessage, messages } = await this.prepareChatTurn(
      store,
      employeeId,
      prompt,
      threadId,
    );

    const result = streamText({
      model: this.getChatModel(openCode, model),
      system: this.getAnalystSystemPrompt(),
      messages,
      stopWhen: stepCountIs(5),
      tools: this.getAssistantTools(store, employeeId),
    });

    return {
      threadId: thread.id,
      userMessageId: userMessage.id,
      textStream: result.textStream,
    };
  }

  async saveAssistantMessage(
    threadId: string,
    content: string,
    status: string = MESSAGE_STATUS_COMPLETED,
    errorMessage?: string,
  ): Promise<AiChatMessage> {
    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      deletedAt: null,
    });
    if (!thread) throw new NotFoundException('AI chat thread not found');

    const now = new Date();
    const message = this.em.create(AiChatMessage, {
      thread,
      role: ASSISTANT_MESSAGE_ROLE,
      content,
      status,
      errorMessage,
      model: this.getModelName(),
      provider: AI_CHAT_PROVIDER,
    });

    thread.lastMessageAt = now;
    thread.updatedAt = now;

    await this.em.persistAndFlush(message);
    return message;
  }

  async saveFailedAssistantMessage(
    threadId: string,
    content: string,
    error: unknown,
  ): Promise<void> {
    await this.saveAssistantMessage(
      threadId,
      content,
      MESSAGE_STATUS_FAILED,
      error instanceof Error
        ? error.message
        : 'Failed to stream assistant response.',
    );
  }

  async findAllThreads(
    store: Store,
    employeeId: string,
  ): Promise<AiChatThreadSummary[]> {
    const threads = await this.em.find(
      AiChatThread,
      {
        store,
        employee: { id: employeeId },
        deletedAt: null,
      },
      {
        orderBy: { lastMessageAt: 'DESC', createdAt: 'DESC' },
      },
    );

    return threads.map((thread) => this.toThreadSummary(thread));
  }

  async findOneThread(
    store: Store,
    employeeId: string,
    threadId: string,
  ): Promise<AiChatThreadDetail> {
    const thread = await this.em.findOne(AiChatThread, {
      id: threadId,
      store,
      employee: { id: employeeId },
      deletedAt: null,
    });
    if (!thread) throw new NotFoundException('AI chat thread not found');

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

  async updateThreadTitle(
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

  async deleteThread(
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

  private async prepareChatTurn(
    store: Store,
    employeeId: string,
    prompt: string,
    threadId?: string,
  ): Promise<{
    thread: AiChatThread;
    userMessage: AiChatMessage;
    messages: ModelMessage[];
  }> {
    const thread = await this.resolveThread(
      store,
      employeeId,
      prompt,
      threadId,
    );
    const previousMessages = await this.loadRecentThreadMessages(thread);

    const now = new Date();
    const userMessage = this.em.create(AiChatMessage, {
      thread,
      role: USER_MESSAGE_ROLE,
      content: prompt,
      status: MESSAGE_STATUS_COMPLETED,
      metadata: { source: 'ai-assistant-sse' },
    });

    thread.lastMessageAt = now;
    thread.updatedAt = now;

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

  private async resolveThread(
    store: Store,
    employeeId: string,
    prompt: string,
    threadId?: string,
  ): Promise<AiChatThread> {
    const employee = await this.em.findOne(Employee, { id: employeeId, store });
    if (!employee) throw new NotFoundException('Employee not found');

    if (threadId) {
      const existingThread = await this.em.findOne(AiChatThread, {
        id: threadId,
        store,
        employee,
        deletedAt: null,
      });
      if (!existingThread)
        throw new NotFoundException('AI chat thread not found');
      return existingThread;
    }

    const now = new Date();
    const thread = this.em.create(AiChatThread, {
      store,
      employee,
      title: this.createThreadTitle(prompt),
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
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
      {
        orderBy: { createdAt: 'DESC' },
        limit: 20,
      },
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

  private createThreadTitle(prompt: string): string {
    return prompt.length <= 80 ? prompt : `${prompt.slice(0, 77)}...`;
  }

  private validateQuestion(question: string): string {
    const prompt = question?.trim();
    if (!prompt) throw new BadRequestException('question is required');
    return prompt;
  }

  private createOpenCodeProvider() {
    if (!process.env.OPENAI_API_KEY)
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');

    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENCODE_BASE_URL ?? DEFAULT_OPENCODE_BASE_URL,
      name: 'opencode',
    });
  }

  private getModelName(): string {
    return (
      process.env.OPENCODE_MODEL ??
      process.env.OPENAI_MODEL ??
      DEFAULT_OPENCODE_MODEL
    );
  }

  private getChatModel(
    openCode: ReturnType<typeof createOpenAI>,
    model: string,
  ) {
    return openCode.chat(model);
  }

  private getAssistantTools(store: Store, employeeId: string) {
    return {
      getDashboardStats: tool({
        description:
          'Get sales, profit, cashier breakdown, low-stock alerts, out-of-stock alerts, and daily breakdowns for analytical POS questions.',
        inputSchema: z.object({
          range: z.enum([
            'today',
            'yesterday',
            'last_week',
            'monthly',
            'custom',
          ]),
          from: z
            .string()
            .optional()
            .describe(
              'ISO date string for custom range start, for example 2026-07-01. Required when range is custom.',
            ),
          to: z
            .string()
            .optional()
            .describe(
              'ISO date string for custom range end, for example 2026-07-07. Required when range is custom.',
            ),
        }),

        execute: async ({ range, from, to }) => {
          const rangeMap: Record<string, DashboardRange> = {
            today: DashboardRange.TODAY,
            yesterday: DashboardRange.YESTERDAY,
            last_week: DashboardRange.LAST_WEEK,
            monthly: DashboardRange.MONTHLY,
            custom: DashboardRange.CUSTOM,
          };

          return this.dashboardService.getDashboardStats(store, employeeId, {
            range: rangeMap[range],
            from,
            to,
          });
        },
      }),
    };
  }

  private getAnalystSystemPrompt(): string {
    const today = new Date().toISOString().split('T')[0];

    return `You are the AI assistant for AsanPOS, a point-of-sale system.
Current server date: ${today}.

You can help with both POS/business questions and general questions.

For questions about sales, profit, cashiers, stock, trends, comparisons, store activity, or business performance, call getDashboardStats before answering. Do not invent numbers.

For questions that are not about AsanPOS data or store performance, answer normally without calling getDashboardStats. If a question needs private app data that is not available through your tools, say what data is missing instead of guessing. If a question needs current external information outside this system, say you do not have live external browsing access.

Answer like a helpful business analyst in a natural chat conversation. Use clear, human language similar to a modern AI assistant.

Rules:
- Use AFN for money.
- Never reveal hidden reasoning, chain-of-thought, scratchpad text, or thinking text.
- Never output <think> or <thinking> tags.
- If a previous period is zero, use "No baseline".
- Keep the answer concise, but include the important numbers.
- Return plain text only.
- Do not use markdown formatting.
- Do not use bold text, headings, bullets, numbered lists, tables, or code fences.
- Write one clean paragraph unless the user specifically asks for a list.
- Mention cashier, low-stock, or out-of-stock details only when relevant.
- If data is missing, say what is missing instead of guessing.`;
  }
}
