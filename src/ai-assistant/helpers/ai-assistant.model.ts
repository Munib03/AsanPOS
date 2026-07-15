import { ServiceUnavailableException } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';

const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_OPENCODE_MODEL = 'minimax-m3';

export const AI_CHAT_PROVIDER = 'opencode';

export type FreshDataToolName =
  | 'getProductCount'
  | 'getLiveEntityCount'
  | 'searchProducts'
  | 'getInventorySummary'
  | 'getMyDashboardStats'
  | 'getSalesSummary'
  | 'getPurchaseSummary'
  | 'getCustomerSummary'
  | 'getOpenSessions'
  | 'getAuditActivity';

interface FreshDataToolRule {
  pattern: RegExp;
  toolName: FreshDataToolName;
}

const PRODUCT_PATTERN = /\b(product|products|sku|skus)\b/;
const PRODUCT_COUNT_PATTERN = /\b(how many|count|total number|number of)\b/;

// Rules are evaluated in order because stock-in/out must win over generic stock.
const FRESH_DATA_TOOL_RULES: FreshDataToolRule[] = [
  {
    pattern: /\b(dashboard|profit|revenue|performance)\b/,
    toolName: 'getMyDashboardStats',
  },
  { pattern: /\b(sale|sales)\b/, toolName: 'getSalesSummary' },
  { pattern: /\b(purchase|purchases)\b/, toolName: 'getPurchaseSummary' },
  { pattern: /\b(customer|customers)\b/, toolName: 'getCustomerSummary' },
  {
    pattern: /\b(stock[ -]?in|stock[ -]?out|stock[ -]?movement)\b/,
    toolName: 'getLiveEntityCount',
  },
  {
    pattern: /\b(inventory|inventories|warehouse|warehouses|stock)\b/,
    toolName: 'getInventorySummary',
  },
  {
    pattern:
      /\b(employee|employees|staff|team|category|categories|payment|payments)\b/,
    toolName: 'getLiveEntityCount',
  },
  {
    pattern: /\b(cash movement|cash[ -]?in|cash[ -]?out|receipt|receipts)\b/,
    toolName: 'getLiveEntityCount',
  },
  {
    pattern: /\b(journal|journal entry|journal entries)\b/,
    toolName: 'getLiveEntityCount',
  },
  {
    pattern: /\b(session|sessions|cashier|cashiers)\b/,
    toolName: 'getOpenSessions',
  },
  { pattern: /\b(audit|activity|history)\b/, toolName: 'getAuditActivity' },
];

export function createOpenCodeProvider() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
  }

  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENCODE_BASE_URL ?? DEFAULT_OPENCODE_BASE_URL,
    name: AI_CHAT_PROVIDER,
  });
}

export function getAiModelName(): string {
  return (
    process.env.OPENCODE_MODEL ??
    process.env.OPENAI_MODEL ??
    DEFAULT_OPENCODE_MODEL
  );
}

export function getFreshDataTool(
  question: string,
): FreshDataToolName | undefined {
  const normalizedQuestion = question.toLowerCase();

  if (PRODUCT_PATTERN.test(normalizedQuestion)) {
    return PRODUCT_COUNT_PATTERN.test(normalizedQuestion)
      ? 'getProductCount'
      : 'searchProducts';
  }

  return FRESH_DATA_TOOL_RULES.find(({ pattern }) =>
    pattern.test(normalizedQuestion),
  )?.toolName;
}
