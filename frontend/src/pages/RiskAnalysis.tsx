import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Filter,
  Flame,
  HelpCircle,
  RotateCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Bar, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { api, type Analysis, type FileMetric } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, Tooltip, Legend);

export default function RiskAnalysis() {
  const { activeRepo } = useRepos();
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'matrix' | 'barchart' | 'table'>('matrix');
  const [sortField, setSortField] = useState<keyof FileMetric>('risk_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'moderate' | 'low'>('all');

  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    setLoading(true);
    api
      .analysis(activeRepo.id, 200)
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load risk analysis.'))
      .finally(() => setLoading(false));
  }, [activeRepo]);

  const files = data?.risky_files ?? [];

  const stats = useMemo(() => {
    const critical = files.filter((f) => f.risk_score >= 0.7);
    const moderate = files.filter((f) => f.risk_score >= 0.4 && f.risk_score < 0.7);
    const low = files.filter((f) => f.risk_score < 0.4);
    const avgRisk = files.length ? files.reduce((acc, f) => acc + f.risk_score, 0) / files.length : 0;
    return { critical, moderate, low, avgRisk };
  }, [files]);

  const filteredAndSortedFiles = useMemo(() => {
    return files
      .filter((file) => {
        if (search && !file.path.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterSeverity === 'critical' && file.risk_score < 0.7) return false;
        if (filterSeverity === 'moderate' && (file.risk_score < 0.4 || file.risk_score >= 0.7)) return false;
        if (filterSeverity === 'low' && file.risk_score >= 0.4) return false;
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        return sortAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });
  }, [files, search, filterSeverity, sortField, sortAsc]);

  const top10 = useMemo(() => {
    return [...files].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
  }, [files]);

  function handleSort(field: keyof FileMetric) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Engineering Risk & Hotspot Analysis"
        description="Multi-factor risk assessment combining AST cyclomatic complexity, Git commit churn, contributor dispersion, and network centrality."
      />

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {error}
        </p>
      )}

      {/* Summary Scorecards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="card shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
            <span>Critical Hotspots</span>
            <span className="rounded-xl bg-red-50 p-2 text-red-600"><Flame size={17} /></span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-red-600">{stats.critical.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">Files with risk score &ge; 70%</p>
        </div>

        <div className="card shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
            <span>Moderate Risk</span>
            <span className="rounded-xl bg-amber-50 p-2 text-amber-600"><AlertTriangle size={17} /></span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-amber-600">{stats.moderate.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">Files with risk score 40%–69%</p>
        </div>

        <div className="card shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
            <span>Stable Modules</span>
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><CheckCircle2 size={17} /></span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-emerald-600">{stats.low.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">Files with risk score &lt; 40%</p>
        </div>

        <div className="card shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
            <span>Mean Repository Risk</span>
            <span className="rounded-xl bg-blue-50 p-2 text-blue-600"><ShieldAlert size={17} /></span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900">{(stats.avgRisk * 100).toFixed(1)}%</p>
          <p className="mt-1 text-[11px] text-slate-400">Weighted cross-module average</p>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`rounded-lg px-3 py-1.5 transition ${
              activeTab === 'matrix' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hotspot Quadrant Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('barchart')}
            className={`rounded-lg px-3 py-1.5 transition ${
              activeTab === 'barchart' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Top 10 Risk Chart
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`rounded-lg px-3 py-1.5 transition ${
              activeTab === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            File Metrics Table ({files.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search file path…"
              className="input pl-8 text-xs py-1"
            />
          </div>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as any)}
            className="input text-xs py-1"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical (&ge; 70%)</option>
            <option value="moderate">Moderate (40-69%)</option>
            <option value="low">Low (&lt; 40%)</option>
          </select>
        </div>
      </div>

      {/* Tab 1: Hotspot Quadrant Scatter Matrix (Complexity vs Churn) */}
      {activeTab === 'matrix' && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Flame size={16} className="text-red-500" /> Complexity vs. Churn Hotspot Matrix
              </h2>
              <p className="text-[11px] text-slate-500">
                Files in the upper-right quadrant combine frequent modifications with high branch complexity, representing the greatest architectural risk.
              </p>
            </div>
          </div>
          <div className="h-[420px]">
            {files.length > 0 ? (
              <Scatter
                data={{
                  datasets: [
                    {
                      label: 'Files',
                      data: files.map((f) => ({
                        x: f.churn,
                        y: f.complexity,
                        path: f.path,
                        risk: (f.risk_score * 100).toFixed(0),
                      })),
                      backgroundColor: files.map((f) =>
                        f.risk_score >= 0.7 ? '#dc2626' : f.risk_score >= 0.4 ? '#f59e0b' : '#16a34a'
                      ),
                      pointRadius: files.map((f) => Math.max(6, Math.min(18, f.loc / 30))),
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx: any) => {
                          const item = ctx.raw;
                          return `${item.path} (Risk: ${item.risk}%, Churn: ${item.x}, Complexity: ${item.y})`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      title: { display: true, text: 'Git Churn (Commits + Lines Changed)', font: { size: 11 } },
                      grid: { color: '#f1f5f9' },
                    },
                    y: {
                      title: { display: true, text: 'Mean Cyclomatic Complexity', font: { size: 11 } },
                      grid: { color: '#f1f5f9' },
                    },
                  },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No risk data available yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Top 10 Risk Bar Chart */}
      {activeTab === 'barchart' && (
        <div className="card">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-800">Top 10 Risk Hotspots</h2>
            <p className="text-[11px] text-slate-500">Individual file risk scores (0 to 100 scale)</p>
          </div>
          <div className="h-[400px]">
            {top10.length > 0 ? (
              <Bar
                data={{
                  labels: top10.map((f) => f.path.split('/').pop() || f.path),
                  datasets: [
                    {
                      label: 'Risk Score %',
                      data: top10.map((f) => f.risk_score * 100),
                      backgroundColor: top10.map((f) =>
                        f.risk_score >= 0.7 ? '#dc2626' : f.risk_score >= 0.4 ? '#f59e0b' : '#16a34a'
                      ),
                      borderRadius: 8,
                      maxBarThickness: 40,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } },
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        title: (ctx) => top10[ctx[0].dataIndex]?.path || '',
                      },
                    },
                  },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No files analyzed yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Detailed Searchable & Sortable File Table */}
      {activeTab === 'table' && (
        <div className="card p-0 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th onClick={() => handleSort('path')} className="cursor-pointer px-4 py-3 hover:text-slate-900">
                    <span className="flex items-center gap-1">File Path <ArrowUpDown size={12} /></span>
                  </th>
                  <th onClick={() => handleSort('loc')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    <span className="flex items-center justify-end gap-1">LOC <ArrowUpDown size={12} /></span>
                  </th>
                  <th onClick={() => handleSort('complexity')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    <span className="flex items-center justify-end gap-1">Complexity <ArrowUpDown size={12} /></span>
                  </th>
                  <th onClick={() => handleSort('churn')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    <span className="flex items-center justify-end gap-1">Churn <ArrowUpDown size={12} /></span>
                  </th>
                  <th onClick={() => handleSort('risk_score')} className="cursor-pointer px-4 py-3 text-right hover:text-slate-900">
                    <span className="flex items-center justify-end gap-1">Risk Score <ArrowUpDown size={12} /></span>
                  </th>
                  <th className="px-4 py-3 text-center">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedFiles.length > 0 ? (
                  filteredAndSortedFiles.map((file) => (
                    <tr key={file.path} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-mono text-slate-800 font-medium">
                        {file.path}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600">{file.loc}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600">{file.complexity.toFixed(1)}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600">{file.churn}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {(file.risk_score * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            file.risk_score >= 0.7
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : file.risk_score >= 0.4
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {file.risk_score >= 0.7 ? 'Critical' : file.risk_score >= 0.4 ? 'Moderate' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No files matching the current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
