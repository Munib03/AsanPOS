import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardRange } from '../dashboard/dto/dashboard.dto';
import { Store } from '../database/entites/store.entity';

const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_OPENCODE_MODEL = 'minimax-m3';

export interface AiAssistantResponse {
  answer: string;
}

@Injectable()
export class AiAssistantService {
  constructor(private readonly dashboardService: DashboardService) {}

  async ask(
    store: Store,
    employeeId: string,
    question: string,
  ): Promise<AiAssistantResponse> {
    try {
      const prompt = this.validateQuestion(question);
      const openCode = this.createOpenCodeProvider();

      const { text } = await generateText({
        model: this.getChatModel(openCode),
        system: this.getAnalystSystemPrompt(),
        prompt,
        stopWhen: stepCountIs(5),
        tools: this.getAssistantTools(store, employeeId),
      });

      return {
        answer:
          this.cleanAssistantAnswer(text) ||
          'I could not generate an answer for that question.',
      };
    } catch (error) {
      const statusCode = this.getOpenAiErrorStatus(error);
      if (statusCode === 401)
        throw new ServiceUnavailableException(
          'OpenCode rejected OPENAI_API_KEY. The value must be a valid OpenCode Zen key, even though the env variable is named OPENAI_API_KEY.',
        );

      if (statusCode === 404)
        throw new ServiceUnavailableException(
          'OpenCode endpoint was not found. Check OPENCODE_BASE_URL and OPENCODE_MODEL in .env, then restart the server.',
        );

      throw error;
    }
  }

  streamAnswer(store: Store, employeeId: string, question: string): any {
    const prompt = this.validateQuestion(question);
    const openCode = this.createOpenCodeProvider();

    return streamText({
      model: this.getChatModel(openCode),
      system: this.getAnalystSystemPrompt(),
      prompt,
      stopWhen: stepCountIs(5),
      tools: this.getAssistantTools(store, employeeId),
    });
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

  private getChatModel(openCode: ReturnType<typeof createOpenAI>) {
    return openCode.chat(
      process.env.OPENCODE_MODEL ??
        process.env.OPENAI_MODEL ??
        DEFAULT_OPENCODE_MODEL,
    );
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

  private getOpenAiErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;

    const maybeError = error as {
      statusCode?: number;
      status?: number;
      response?: { status?: number };
    };
    return (
      maybeError.statusCode ?? maybeError.status ?? maybeError.response?.status
    );
  }

  private cleanAssistantAnswer(answer: string): string {
    return answer
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .replace(/\*\*/g, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*[-–—]{3,}\s*$/gm, '')
      .replace(/\r?\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private getAnalystSystemPrompt(): string {
    const today = new Date().toISOString().split('T')[0];

    return `You are the analytical assistant for AsanPOS, a point-of-sale system.
Current server date: ${today}.

Your job is to analyze store performance using dashboard data. For questions about sales, profit, cashiers, stock, trends, comparisons, or business performance, call getDashboardStats before answering. Do not invent numbers.

Answer like a helpful business analyst in a natural chat conversation. Use clear, human language similar to a modern AI assistant.

Rules:
- Use AFN for money.
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
