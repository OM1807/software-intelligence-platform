import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Blocks,
  Bot,
  FileText,
  Files,
  GitBranch,
  GitCompareArrows,
  HeartPulse,
  Network,
  RotateCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  BarElement,
  Tooltip,
} from 'chart.js';
import { api, type Dashboard as DashboardData } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, BarElement, Tooltip, Legend);

export default function Dashboard() {
  const { activeRepo } = useRepos();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    setLoading(true);
    api
      .dashboard(activeRepo.id)
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dashboard.'))
      .finally(() => setLoading(false));
  }, [activeRepo]);

  const summary = data?.summary;
  const health = summary?.health_index ?? 100;

  const healthGrade =
    health >= 85
      ? { label: 'Robust Health', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Low risk profile across modules' }
      : health >= 70
      ? { label: 'Moderate Risk', badge: 'bg-amber-50 text-amber-700 border-amber-200', text: 'Some complexity or churn hotspots detected' }
      : { label: 'High Technical Debt', badge: 'bg-red-50 text-red-700 border-red-200', text: 'Multiple critical modules require refactoring' };

  const metrics = [
    { label: 'Architectural Health', value: summary ? `${summary.health_index.toFixed(1)}/100` : '-', icon: HeartPulse, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total Files Analyzed', value: summary?.total_files ?? '-', icon: Files, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Git Commits', value: summary?.total_commits ?? '-', icon: GitCompareArrows, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'High-Risk Hotspots', value: summary?.high_risk_files ?? '-', icon: ShieldAlert, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <PageContainer>
      <div className="mb-2 flex items-center justify-between">
        <PageHeader
          title="Overview & Health Index"
          description={activeRepo ? `Engineering intelligence and activity summary for ${activeRepo.name}.` : 'Select an analyzed repository to inspect its health.'}
        />
        {activeRepo?.status === 'completed' && (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${healthGrade.badge}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {healthGrade.label}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {error}
        </p>
      )}

      {!activeRepo && (
        <div className="card my-6 text-center py-12">
          <GitBranch className="mx-auto text-blue-600 mb-3" size={36} />
          <h3 className="text-base font-bold text-slate-800">No Repository Selected</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Choose a repository you can access from your connected GitHub account.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/repositories" className="btn-secondary text-xs">
              View Repositories
            </Link>
          </div>
        </div>
      )}

      {activeRepo && activeRepo.status !== 'completed' && (
        <div className="mb-6 card border-blue-200 bg-blue-50/50 p-5">
          <div className="flex items-center gap-3">
            <RotateCw size={20} className="animate-spin text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Repository Analysis Status: {activeRepo.status}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                AST parsing, Git history mining, and graph generation are running in the background. Return to repositories to monitor real-time completion.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeRepo?.status === 'completed' && (
        <>
          {/* Key Metric Scorecards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                  <span className={`rounded-xl p-2 ${color}`}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {label === 'Architectural Health' ? healthGrade.text : 'Mined repository fact'}
                </p>
              </div>
            ))}
          </div>

          {/* Activity Timeline Chart */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <TrendingUp size={16} className="text-blue-600" /> Git Commit Velocity Timeline
                  </h2>
                  <p className="text-[11px] text-slate-400">Monthly commit churn extracted from git logs</p>
                </div>
              </div>
              <div className="h-[260px]">
                {data?.timeline && data.timeline.length > 0 ? (
                  <Line
                    data={{
                      labels: data.timeline.map((point) => point.date),
                      datasets: [
                        {
                          label: 'Commits',
                          data: data.timeline.map((point) => point.commits),
                          borderColor: '#2563eb',
                          backgroundColor: 'rgba(37, 99, 235, 0.08)',
                          fill: true,
                          tension: 0.35,
                          pointRadius: 4,
                          pointBackgroundColor: '#2563eb',
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false } },
                      },
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    No timeline data recorded
                  </div>
                )}
              </div>
            </div>

            {/* Quick Intelligence Summary */}
            <div className="card flex flex-col justify-between border-blue-100 bg-gradient-to-br from-blue-50/50 to-white">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles size={18} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-800">Intelligence Directives</h3>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">
                  {summary?.high_risk_files && summary.high_risk_files > 0
                    ? `Found ${summary.high_risk_files} critical files that combine high cyclomatic complexity and code churn. Prioritize unit test coverage before modifying them.`
                    : 'Code churn and structural complexity are currently in balance. Explore the dependency graph or run change-impact tests.'}
                </p>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between border-b pb-1.5 text-slate-600">
                    <span>Repository Type</span>
                    <span className="font-semibold text-slate-800">{activeRepo.is_private ? 'Private' : 'Public / Local'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5 text-slate-600">
                    <span>Analysis Engine</span>
                    <span className="font-semibold text-slate-800">Tree-sitter + NetworkX</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-2">
                <Link to="/risk" className="btn-primary w-full justify-center text-xs gap-1.5 py-2">
                  <ShieldAlert size={14} /> Inspect Risk Hotspots
                </Link>
                <Link to="/assistant" className="btn-secondary w-full justify-center text-xs gap-1.5 py-2">
                  <Bot size={14} /> Ask AI Assistant
                </Link>
              </div>
            </div>
          </div>

          {/* Module Navigation Grid */}
          <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-wider text-slate-400">
            Platform Capabilities
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: '/dependencies', label: 'Dependency Graph', desc: 'Interactive NetworkX visualizer with cycle detection', icon: Network },
              { to: '/risk', label: 'Risk Analysis', desc: 'Complexity vs churn hotspot quadrant matrix', icon: ShieldAlert },
              { to: '/impact', label: 'Change Impact', desc: 'Blast radius prediction for modified files', icon: GitCompareArrows },
              { to: '/drift', label: 'Architecture Drift', desc: 'Layer constraints & forbidden import detection', icon: Blocks },
            ].map(({ to, label, desc, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="card group transition hover:border-blue-400 hover:shadow-md cursor-pointer"
              >
                <div className="mb-3 flex items-center justify-between text-slate-400 group-hover:text-blue-600">
                  <span className="rounded-xl bg-slate-50 p-2 group-hover:bg-blue-50 transition">
                    <Icon size={19} />
                  </span>
                  <ArrowUpRight size={16} />
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700">{label}</h3>
                <p className="mt-1 text-xs text-slate-500 leading-snug">{desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}
