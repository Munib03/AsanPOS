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

const AiAssistantReportValueSchema = z.union([z.string(), z.number()]);

export const AiAssistantReportSchema = z.object({
  type: z.literal('report'),
  reportType: z.enum([
    'business_summary',
    'sales',
    'profit',
    'inventory',
    'products',
    'purchases',
    'customers',
  ]),
  title: z.string().min(1),
  generatedAt: z.string().datetime(),
  period: z
    .object({
      from: z.string().min(1),
      to: z.string().min(1),
      label: z.string().min(1),
    })
    .optional(),
  summary: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.number(),
        valueFormat: z.enum(['currency', 'number']),
      }),
    )
    .min(1),
  tables: z.array(
    z.object({
      title: z.string().min(1),
      columns: z.array(z.string().min(1)).min(1),
      rows: z.array(z.array(AiAssistantReportValueSchema)),
    }),
  ),
  graphs: z.array(AiAssistantGraphSchema),
});

export type AiAssistantReport = z.infer<typeof AiAssistantReportSchema>;
