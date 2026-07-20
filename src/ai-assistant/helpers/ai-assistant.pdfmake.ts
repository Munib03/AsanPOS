import { Chart, registerables } from 'chart.js';
import pdfmake from 'pdfmake';
import { Canvas } from 'skia-canvas';
import type {
  AiAssistantGraph,
  AiAssistantPdf,
} from './ai-assistant.response.schema';

const PDF_FONT = 'Helvetica';
const CHART_WIDTH = 960;
const CHART_HEIGHT = 480;
const PDF_STANDARD_FONTS = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
]);

interface PdfmakeDocument {
  getBuffer(): Promise<Buffer>;
}

interface PdfmakeRenderer {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(policy: (url: string) => boolean): void;
  setLocalAccessPolicy(policy: (path: string) => boolean): void;
  createPdf(definition: object): PdfmakeDocument;
}

const documentRenderer = pdfmake as unknown as PdfmakeRenderer;

documentRenderer.setFonts({
  [PDF_FONT]: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});
documentRenderer.setUrlAccessPolicy(() => false);
documentRenderer.setLocalAccessPolicy((path) => PDF_STANDARD_FONTS.has(path));
Chart.register(...registerables);
Chart.defaults.color = 'black';
Chart.defaults.borderColor = 'black';

export async function renderAiAssistantPdf(
  pdf: AiAssistantPdf,
): Promise<Buffer> {
  const graphImage = pdf.graph ? await renderGraphImage(pdf.graph) : undefined;
  const summaryRows = pdf.summary.map((item) => [
    item.label,
    formatValue(item.value, item.valueFormat),
  ]);
  const tableRows = pdf.table.rows.map((row) =>
    row.map((value, index) =>
      index === 0 || typeof value === 'string'
        ? String(value)
        : formatValue(value, pdf.table.valueFormat),
    ),
  );

  return documentRenderer
    .createPdf({
      info: { title: pdf.title, author: 'AsanPOS' },
      pageSize: 'A4',
      pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: PDF_FONT, fontSize: 9 },
      styles: {
        title: { fontSize: 18, bold: true },
        heading: { fontSize: 12, bold: true, margin: [0, 16, 0, 8] },
        generatedAt: { fontSize: 8, margin: [0, 4, 0, 8] },
        tableHeader: { bold: true },
      },
      content: [
        { text: pdf.title, style: 'title' },
        {
          text: `Generated ${new Date(pdf.generatedAt).toLocaleString()}`,
          style: 'generatedAt',
        },
        ...(summaryRows.length
          ? [
              { text: 'Summary', style: 'heading' },
              {
                table: {
                  widths: ['*', '*'],
                  body: [
                    [
                      { text: 'Measure', style: 'tableHeader' },
                      { text: 'Value', style: 'tableHeader' },
                    ],
                    ...summaryRows,
                  ],
                },
                layout: 'lightHorizontalLines',
              },
            ]
          : []),
        ...(graphImage
          ? [
              { text: pdf.graph?.title ?? 'Graph', style: 'heading' },
              { image: graphImage, fit: [500, 250] },
            ]
          : []),
        { text: pdf.table.title, style: 'heading' },
        {
          table: {
            headerRows: 1,
            widths: pdf.table.columns.map(() => '*'),
            body: [
              pdf.table.columns.map((column) => ({
                text: column,
                style: 'tableHeader',
              })),
              ...tableRows,
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],
    })
    .getBuffer();
}

async function renderGraphImage(graph: AiAssistantGraph): Promise<string> {
  const canvas = new Canvas(CHART_WIDTH, CHART_HEIGHT);
  const chart = new Chart(canvas as unknown as HTMLCanvasElement, {
    type: graph.type,
    data: {
      labels: graph.labels,
      datasets: graph.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.data,
        borderColor: 'black',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderDash: index ? [6, 4] : undefined,
        borderWidth: 2,
      })),
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: graph.datasets.length > 1 },
        title: { display: false },
      },
    },
  });

  try {
    return `data:image/png;base64,${(await canvas.toBuffer('png')).toString('base64')}`;
  } finally {
    chart.destroy();
  }
}

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency'
    ? `${value.toLocaleString()} AFN`
    : value.toLocaleString();
}
