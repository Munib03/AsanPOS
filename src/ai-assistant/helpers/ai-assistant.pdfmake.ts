import { Chart, registerables, type ChartDataset } from 'chart.js';
import pdfmake from 'pdfmake';
import { Canvas } from 'skia-canvas';
import type {
  AiAssistantGraph,
  AiAssistantPdf,
} from './ai-assistant.response.schema';

const PDF_FONT = 'Helvetica';
const CHART_WIDTH = 960;
const CHART_HEIGHT = 480;
const REPORT_COLORS = {
  ink: '#172033',
  muted: '#5B6475',
  border: '#D9DEEA',
  surface: '#F6F8FC',
  accent: '#2563EB',
};
const CHART_COLORS = [
  '#2563EB',
  '#0F766E',
  '#D97706',
  '#9333EA',
  '#DC2626',
  '#0891B2',
];
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
Chart.defaults.color = REPORT_COLORS.muted;
Chart.defaults.borderColor = REPORT_COLORS.border;

export async function renderAiAssistantPdf(
  pdf: AiAssistantPdf,
): Promise<Buffer> {
  const graphImage = pdf.graph ? await renderGraphImage(pdf.graph) : undefined;
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
      defaultStyle: { font: PDF_FONT, fontSize: 9, color: REPORT_COLORS.ink },
      styles: {
        title: { fontSize: 20, bold: true, color: REPORT_COLORS.ink },
        heading: {
          fontSize: 12,
          bold: true,
          color: REPORT_COLORS.ink,
          margin: [0, 18, 0, 8],
        },
        generatedAt: {
          fontSize: 8,
          color: REPORT_COLORS.muted,
          margin: [0, 5, 0, 8],
        },
        tableHeader: { bold: true, color: '#FFFFFF' },
        summaryLabel: { fontSize: 8, color: REPORT_COLORS.muted },
        summaryValue: { fontSize: 14, bold: true, color: REPORT_COLORS.ink },
      },
      footer: (currentPage: number, pageCount: number) => ({
        text: `AsanPOS report  |  Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        color: REPORT_COLORS.muted,
        fontSize: 8,
        margin: [0, 12, 0, 0],
      }),
      content: [
        { text: pdf.title, style: 'title' },
        {
          text: `Generated ${new Date(pdf.generatedAt).toLocaleString()}`,
          style: 'generatedAt',
        },
        ...(pdf.summary.length
          ? [{ text: 'Summary', style: 'heading' }, ...createSummaryCards(pdf)]
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
          layout: createTableLayout(),
        },
      ],
    })
    .getBuffer();
}

async function renderGraphImage(graph: AiAssistantGraph): Promise<string> {
  const canvas = new Canvas(CHART_WIDTH, CHART_HEIGHT);
  const isCircular = graph.type === 'pie' || graph.type === 'doughnut';
  const chart = new Chart(canvas as unknown as HTMLCanvasElement, {
    type: graph.type,
    data: {
      labels: graph.labels,
      datasets: graph.datasets.map((dataset, index) =>
        createChartDataset(graph.type, dataset, index),
      ) as unknown as ChartDataset<AiAssistantGraph['type'], number[]>[],
    },
    options: {
      responsive: false,
      animation: false,
      layout: { padding: { top: 8, right: 18, bottom: 4, left: 8 } },
      plugins: {
        legend: {
          display: graph.datasets.length > 1 || isCircular,
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 9, padding: 16 },
        },
        title: { display: false },
      },
      scales: isCircular
        ? undefined
        : {
            x: {
              title: { display: true, text: graph.xAxisLabel },
              grid: { display: false },
              ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            },
            y: {
              title: { display: true, text: graph.yAxisLabel },
              beginAtZero: graph.datasets.every((dataset) =>
                dataset.data.every((value) => value >= 0),
              ),
              grid: { color: REPORT_COLORS.border },
            },
          },
    },
  });

  try {
    return `data:image/png;base64,${(await canvas.toBuffer('png')).toString('base64')}`;
  } finally {
    chart.destroy();
  }
}

function createSummaryCards(pdf: AiAssistantPdf): object[] {
  const cards = pdf.summary.map((item) => ({
    table: {
      widths: ['*'],
      body: [
        [{ text: item.label, style: 'summaryLabel', margin: [10, 9, 10, 3] }],
        [
          {
            text: formatValue(item.value, item.valueFormat),
            style: 'summaryValue',
            margin: [10, 0, 10, 10],
          },
        ],
      ],
    },
    layout: {
      hLineColor: () => REPORT_COLORS.border,
      vLineColor: () => REPORT_COLORS.border,
      hLineWidth: () => 1,
      vLineWidth: () => 1,
    },
  }));

  return cards.reduce<object[]>((rows, card, index) => {
    if (index % 2 === 0)
      rows.push({ columns: [card], columnGap: 10, margin: [0, 0, 0, 10] });
    else {
      const row = rows[rows.length - 1] as {
        columns: object[];
      };
      row.columns.push(card);
    }
    return rows;
  }, []);
}

function createChartDataset(
  type: AiAssistantGraph['type'],
  dataset: AiAssistantGraph['datasets'][number],
  index: number,
): object {
  const color = CHART_COLORS[index % CHART_COLORS.length];
  const circular = type === 'pie' || type === 'doughnut';

  if (circular)
    return {
      label: dataset.label,
      data: dataset.data,
      backgroundColor: dataset.data.map(
        (_, valueIndex) => CHART_COLORS[valueIndex % CHART_COLORS.length],
      ),
      borderColor: '#FFFFFF',
      borderWidth: 2,
      hoverOffset: 0,
    };

  if (type === 'line')
    return {
      label: dataset.label,
      data: dataset.data,
      borderColor: color,
      backgroundColor: `${color}22`,
      borderWidth: 3,
      tension: 0.35,
      pointBackgroundColor: '#FFFFFF',
      pointBorderColor: color,
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 4,
      fill: false,
    };

  return {
    label: dataset.label,
    data: dataset.data,
    backgroundColor: `${color}CC`,
    borderColor: color,
    borderWidth: 1,
    borderRadius: 6,
    borderSkipped: false,
    maxBarThickness: 42,
  };
}

function createTableLayout(): object {
  return {
    fillColor: (rowIndex: number) =>
      rowIndex === 0
        ? REPORT_COLORS.accent
        : rowIndex % 2 === 0
          ? REPORT_COLORS.surface
          : undefined,
    hLineColor: () => REPORT_COLORS.border,
    vLineColor: () => REPORT_COLORS.border,
    hLineWidth: () => 1,
    vLineWidth: () => 0,
    paddingLeft: () => 8,
    paddingRight: () => 8,
    paddingTop: () => 7,
    paddingBottom: () => 7,
  };
}

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency'
    ? `${value.toLocaleString()} AFN`
    : value.toLocaleString();
}
