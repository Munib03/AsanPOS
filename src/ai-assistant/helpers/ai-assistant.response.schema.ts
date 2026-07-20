import { z } from 'zod';

export const AiAssistantGraphSchema = z.object({
  type: z
    .enum(['line', 'bar', 'pie', 'doughnut'])
    .describe('The chart type the frontend should render.'),
  title: z.string().min(1).describe('A short human-readable chart title.'),
  xAxisLabel: z.string().min(1).describe('The horizontal axis label.'),
  yAxisLabel: z.string().min(1).describe('The vertical axis label.'),
  valueFormat: z
    .enum(['currency', 'number'])
    .describe('How the frontend should format data values.'),
  labels: z
    .array(z.string().min(1))
    .describe('Labels in the same order as every dataset value.'),
  datasets: z
    .array(
      z.object({
        label: z.string().min(1).describe('Dataset label.'),
        data: z
          .array(z.number())
          .describe('Exact verified values matching the labels.'),
      }),
    )
    .min(1)
    .describe('One or more datasets for the chart.'),
});

export type AiAssistantGraph = z.infer<typeof AiAssistantGraphSchema>;

export const AiAssistantPdfSchema = z.object({
  type: z.literal('pdf'),
  title: z.string().min(1).describe('The PDF document title.'),
  generatedAt: z
    .string()
    .datetime()
    .describe('When the document was generated.'),
  summary: z.array(
    z.object({
      label: z.string().min(1),
      value: z.number(),
      valueFormat: z.enum(['currency', 'number']),
    }),
  ),
  table: z.object({
    title: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
    valueFormat: z.enum(['currency', 'number']),
  }),
  graph: AiAssistantGraphSchema.optional(),
});

export type AiAssistantPdf = z.infer<typeof AiAssistantPdfSchema>;
