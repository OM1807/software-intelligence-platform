import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { api, type Analysis } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function RiskAnalysis() {
  const { activeRepo } = useRepos();
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    api.analysis(activeRepo.id).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load risk analysis.'));
  }, [activeRepo]);
  const files = data?.risky_files ?? [];
  return <PageContainer>
    <PageHeader title="Risk Analysis" description="Risk scores across codebase files. Higher scores indicate greater risk." />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="card h-[420px]">{files.length ? <Bar data={{ labels: files.map((file) => file.path), datasets: [{ label: 'Risk Score', data: files.map((file) => file.risk_score * 100), backgroundColor: files.map((file) => file.risk_score >= .7 ? '#dc2626' : file.risk_score >= .5 ? '#f59e0b' : '#16a34a'), borderRadius: 6, maxBarThickness: 48 }] }} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }} /> : <p className="p-4 text-sm text-slate-500">No risk metrics are available yet.</p>}</div>
  </PageContainer>;
}
