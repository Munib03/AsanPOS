import { z } from 'zod';

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
      }),
    )
    .min(1)
    .describe('One or more datasets for the chart.'),
});

export type AiAssistantGraph = z.infer<typeof AiAssistantGraphSchema>;
