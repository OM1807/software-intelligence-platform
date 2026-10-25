import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js';
import { PageContainer, PageHeader } from '@/components/Page';
import { riskModules } from '@/data/mockData';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

function barColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 50) return '#f59e0b';
  return '#16a34a';
}

export default function RiskAnalysis() {
  const data = {
    labels: riskModules.map((m) => m.module),
    datasets: [
      {
        label: 'Risk Score',
        data: riskModules.map((m) => m.score),
        backgroundColor: riskModules.map((m) => barColor(m.score)),
        borderRadius: 6,
        maxBarThickness: 48,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            `Risk score: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 12 } },
      },
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: '#f1f5f9' },
        ticks: { color: '#64748b', font: { size: 12 } },
      },
    },
  };

  return (
    <PageContainer>
      <PageHeader
        title="Risk Analysis"
        description="Risk scores across codebase modules. Higher scores indicate greater risk."
      />
      <div className="card h-[420px]">
        <Bar data={data} options={options} />
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> High (70+)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Medium (50-69)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Low (&lt;50)
        </span>
      </div>
    </PageContainer>
  );
}
