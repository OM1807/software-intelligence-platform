import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { PageContainer, PageHeader } from '@/components/Page';
import { impactFiles } from '@/data/mockData';

ChartJS.register(ArcElement, Tooltip, Legend);

const palette = [
  '#2563eb',
  '#0ea5e9',
  '#14b8a6',
  '#f59e0b',
  '#a855f7',
  '#64748b',
];

export default function ChangeImpact() {
  const data = {
    labels: impactFiles.map((f) => f.file),
    datasets: [
      {
        data: impactFiles.map((f) => f.impact),
        backgroundColor: palette,
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: { color: '#475569', font: { size: 12 }, boxWidth: 12 },
      },
    },
  };

  return (
    <PageContainer>
      <PageHeader
        title="Change Impact"
        description="Files most affected by recent commits, ranked by impact score."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card h-[360px]">
          <Pie data={data} options={options} />
        </div>

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">
            Most affected files
          </h2>
          <ul className="space-y-3">
            {impactFiles.map((f, i) => (
              <li key={f.file} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: palette[i % palette.length] }}
                />
                <span className="flex-1 truncate text-sm text-slate-700">
                  {f.file}
                </span>
                <span className="text-xs text-slate-400">{f.commits} commits</span>
                <span className="w-10 text-right text-sm font-medium text-slate-900">
                  {f.impact}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}
