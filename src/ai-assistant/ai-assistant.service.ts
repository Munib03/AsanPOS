import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardRange } from '../dashboard/dto/dashboard.dto';
import { Store } from '../database/entites/store.entity';

const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_OPENCODE_MODEL = 'minimax-m3';

const assistantAnalysisSchema = z.object({
  title: z.string(),
  keyInsight: z.string(),
  range: z.string(),
  metrics: z.array(z.object({
    metric: z.string(),
    current: z.string(),
    comparison: z.string(),
    change: z.string(),
  })),
  observations: z.array(z.string()).max(3),
  recommendations: z.array(z.string()).max(3),
});

type AiAssistantAnalysis = z.infer<typeof assistantAnalysisSchema>;


@Injectable()
export class AiAssistantService {
  constructor(private readonly dashboardService: DashboardService) { }


  async ask(store: Store, employeeId: string, question: string): Promise<AiAssistantAnalysis> {
    const prompt = question?.trim();
    if (!prompt) 
      throw new BadRequestException('question is required');
    

    if (!process.env.OPENAI_API_KEY) 
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
	   

    try {
      const openCode = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENCODE_BASE_URL ?? DEFAULT_OPENCODE_BASE_URL,
        name: 'opencode',
      });

      const { text } = await generateText({
        model: openCode.chat(process.env.OPENCODE_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENCODE_MODEL),
        system: this.getAnalystSystemPrompt(),
        prompt,
        stopWhen: stepCountIs(5),

        tools: {
          getDashboardStats: tool({
            description:
              'Get sales, profit, cashier breakdown, low-stock alerts, out-of-stock alerts, and daily breakdowns for analytical POS questions.',
            inputSchema: z.object({
              range: z.enum(['today', 'yesterday', 'last_week', 'monthly', 'custom']),
              from: z
                .string()
                .optional()
                .describe('ISO date string for custom range start, for example 2026-07-01. Required when range is custom.'),
              to: z
                .string()
                .optional()
                .describe('ISO date string for custom range end, for example 2026-07-07. Required when range is custom.'),
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
        },
      });

      return this.parseAssistantAnalysis(text);
    } 
    
    catch (error) {
      const statusCode = this.getOpenAiErrorStatus(error);
      if (statusCode === 401) 
        throw new ServiceUnavailableException('OpenCode rejected OPENAI_API_KEY. The value must be a valid OpenCode Zen key, even though the env variable is named OPENAI_API_KEY.');
      if (statusCode === 404)
        throw new ServiceUnavailableException('OpenCode endpoint was not found. Check OPENCODE_BASE_URL and OPENCODE_MODEL in .env, then restart the server.');
      

      throw error;
    }
  }



  private getOpenAiErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;

    const maybeError = error as { statusCode?: number; status?: number; response?: { status?: number } };
    return maybeError.statusCode ?? maybeError.status ?? maybeError.response?.status;
  }


  private cleanAssistantAnswer(answer: string): string {
    return answer
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .replace(/^\s*[-–—]{3,}\s*$/gm, '')
      .trim();
  }


  private parseAssistantAnalysis(answer: string): AiAssistantAnalysis {
    const cleaned = this.cleanAssistantAnswer(answer);
    const jsonText = this.extractJsonObject(cleaned);

    if (jsonText) {
      try {
        return assistantAnalysisSchema.parse(JSON.parse(jsonText));
      } catch {
      }
    }

    return {
      title: 'Analysis',
      keyInsight: cleaned || 'No analysis was returned.',
      range: 'Not specified',
      metrics: [],
      observations: [],
      recommendations: [],
    };
  }


  private extractJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) return null;

    return text.slice(start, end + 1);
  }
	  
  

  private getAnalystSystemPrompt(): string {
    const today = new Date().toISOString().split('T')[0];

    return `You are the analytical assistant for AsanPOS, a point-of-sale system.
Current server date: ${today}.

Your job is to analyze store performance using dashboard data. For questions about sales, profit, cashiers, stock, trends, comparisons, or business performance, call getDashboardStats before answering. Do not invent numbers.

Never reveal hidden reasoning, chain-of-thought, scratchpad text, markdown, tables, code fences, or <think> blocks. Return valid JSON only.

Return exactly this JSON shape:
{
  "title": "short title",
  "keyInsight": "one direct business takeaway",
  "range": "exact range analyzed",
  "metrics": [
    { "metric": "Sales", "current": "61,160 AFN", "comparison": "0 AFN", "change": "No baseline" },
    { "metric": "Profit", "current": "11,660 AFN", "comparison": "0 AFN", "change": "No baseline" }
  ],
  "observations": ["1 to 3 short observations grounded in data"],
  "recommendations": ["1 to 3 practical actions"]
}

Rules:
- Use AFN for money.
- If a previous period is zero, use "No baseline".
- Keep each observation and recommendation short.
- Mention cashier, low-stock, or out-of-stock details only when relevant.
- If data is missing, say what is missing instead of guessing.`;
  }
}
