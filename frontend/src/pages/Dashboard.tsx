import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';
import { overviewMetrics, aiSummary } from '@/data/mockData';
import { ArrowUpRight, Files, GitCompareArrows, HeartPulse, Network, ShieldAlert, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const metricIcons = [Files, HeartPulse, ShieldAlert, GitCompareArrows];
const shortcuts = [
  { to: '/dependencies', label: 'Explore dependencies', description: 'See how your services connect.', icon: Network },
  { to: '/risk', label: 'Review risk hotspots', description: 'Find modules that need attention.', icon: ShieldAlert },
  { to: '/impact', label: 'Understand change impact', description: 'Inspect the files affected by commits.', icon: GitCompareArrows },
];

export default function Dashboard() {
  const { activeRepo } = useRepos();

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description={
          activeRepo
            ? `High-level summary of ${activeRepo.name}.`
            : 'High-level summary of your analyzed repository.'
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overviewMetrics.map((metric, index) => {
          const Icon = metricIcons[index];
          return (
          <div key={metric.label} className="card relative overflow-hidden">
            <span className="mb-5 inline-flex rounded-xl bg-blue-50 p-2.5 text-blue-600"><Icon size={19} aria-hidden="true" /></span>
            <p className="text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {metric.value}
            </p>
            {metric.sub ? (
              <p className="mt-1 text-xs text-slate-400">{metric.sub}</p>
            ) : null}
            {metric.trend ? (
              <p className="mt-4 border-t pt-3 text-xs font-medium text-blue-700">
                {metric.trend}
              </p>
            ) : null}
          </div>
        ); })}
      </div>

      <div className="mt-6 card border-blue-100 bg-gradient-to-br from-blue-50 to-white">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-blue-600" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-700">
            AI Assistant Summary
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{aiSummary}</p>
        <Link to="/risk" className="mt-4 inline-flex items-center gap-1 rounded text-sm font-medium text-blue-700">Review risk analysis <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <h2 className="mb-4 mt-8 text-sm font-semibold text-slate-800">Go deeper into your codebase</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {shortcuts.map(({ to, label, description, icon: Icon }) => <Link key={to} to={to} className="card group transition hover:border-blue-300 hover:shadow-md"><div className="mb-4 flex items-center justify-between text-slate-500"><Icon size={20} aria-hidden="true" /><ArrowUpRight size={17} className="group-hover:text-blue-600" aria-hidden="true" /></div><h3 className="text-sm font-semibold text-slate-900">{label}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p></Link>)}
      </div>
    </PageContainer>
  );
}
