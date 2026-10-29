import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Files, GitCompareArrows, HeartPulse, Network, ShieldAlert, Sparkles } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { api, type Dashboard as DashboardData } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

export default function Dashboard() {
  const { activeRepo } = useRepos();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    api.dashboard(activeRepo.id).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dashboard.'));
  }, [activeRepo]);

  const summary = data?.summary;
  const metrics = [
    { label: 'Total Files Analyzed', value: summary?.total_files ?? '-', icon: Files },
    { label: 'Overall Health Score', value: summary ? summary.health_index.toFixed(0) : '-', icon: HeartPulse },
    { label: 'Open Risk Items', value: summary?.high_risk_files ?? '-', icon: ShieldAlert },
    { label: 'Total Commits', value: summary?.total_commits ?? '-', icon: GitCompareArrows },
  ];

  return (
    <PageContainer>
      <PageHeader title="Overview" description={activeRepo ? `High-level summary of ${activeRepo.name}.` : 'Select an analyzed repository to view its insights.'} />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {activeRepo?.status !== 'completed' && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Analysis is {activeRepo?.status || 'not started'}. Return to repositories to monitor its progress.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card">
            <span className="mb-5 inline-flex rounded-xl bg-blue-50 p-2.5 text-blue-600"><Icon size={19} aria-hidden="true" /></span>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 card border-blue-100 bg-gradient-to-br from-blue-50 to-white">
        <div className="mb-3 flex items-center gap-2"><Sparkles size={18} className="text-blue-600" aria-hidden="true" /><h2 className="text-sm font-semibold text-slate-700">Analysis summary</h2></div>
        <p className="text-sm leading-relaxed text-slate-600">{activeRepo?.status === 'completed' ? 'Your repository analysis is ready. Explore the connected metrics below.' : 'Connect a repository to generate real dependency, risk, impact, and drift insights.'}</p>
        <Link to="/risk" className="mt-4 inline-flex items-center gap-1 rounded text-sm font-medium text-blue-700">Review risk analysis <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      {data?.timeline.length ? <div className="mt-6 card h-[300px]"><h2 className="mb-4 text-sm font-semibold text-slate-700">Repository activity</h2><Line data={{ labels: data.timeline.map((point) => point.date), datasets: [{ label: 'Commits', data: data.timeline.map((point) => point.commits), borderColor: '#2563eb', backgroundColor: '#2563eb', tension: 0.3 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div> : null}
      <h2 className="mb-4 mt-8 text-sm font-semibold text-slate-800">Go deeper into your codebase</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {[['/dependencies', 'Explore dependencies', Network], ['/risk', 'Review risk hotspots', ShieldAlert], ['/impact', 'Understand change impact', GitCompareArrows]].map(([to, label, Icon]) => (
          <Link key={to as string} to={to as string} className="card group transition hover:border-blue-300 hover:shadow-md"><div className="mb-4 flex items-center justify-between text-slate-500"><Icon size={20} aria-hidden="true" /><ArrowUpRight size={17} className="group-hover:text-blue-600" aria-hidden="true" /></div><h3 className="text-sm font-semibold text-slate-900">{label as string}</h3></Link>
        ))}
      </div>
    </PageContainer>
  );
}
