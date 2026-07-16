import { z } from 'zod';

const MARKDOWN_SYMBOLS = ['*', '#', '`'];

export const AiAssistantGraphSchema = z.object({
  type: z.enum(['line', 'bar', 'pie', 'doughnut']).describe('The chart type the frontend should render.'),
  title: z.string().min(1).describe('A short human-readable chart title.'),
  xAxisLabel: z.string().min(1).describe('The horizontal axis label.'),
  yAxisLabel: z.string().min(1).describe('The vertical axis label.'),
  valueFormat: z.enum(['currency', 'number']).describe('How the frontend should format data values.'),
  labels: z.array(z.string().min(1)).describe('Labels in the same order as every dataset value.'),
  datasets: z
    .array(
      z.object({
        label: z.string().min(1).describe('Dataset label.'),
        data: z.array(z.number()).describe('Exact verified values matching the labels.'),
        color: z.string().min(1).describe('A CSS color for this dataset.'),
      }),
    )
    .min(1)
    .describe('One or more datasets for the chart.'),
});

export const AiAssistantResponseSchema = z.object({
  content: z
    .string()
    .min(1)
    .refine(
      (value) => !MARKDOWN_SYMBOLS.some((symbol) => value.includes(symbol)),
      'Use plain text only. Do not use Markdown symbols such as asterisks, hashes, or backticks.',
    )
    .describe(
      'A concise plain-text response. Do not use Markdown headings, bullets, bold formatting, code formatting, emojis, or invented data.',
    ),
  graph: AiAssistantGraphSchema.nullable().describe(
    'Return the verified graph supplied in the context exactly, or null when no verified graph was supplied.',
  ),
});

export type AiAssistantGraph = z.infer<typeof AiAssistantGraphSchema>;
export type AiAssistantResponse = z.infer<typeof AiAssistantResponseSchema>;
