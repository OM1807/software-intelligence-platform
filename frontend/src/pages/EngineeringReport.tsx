import { useEffect, useState } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import { api, type EngineeringReport as ReportData } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

export default function EngineeringReport() {
  const { activeRepo } = useRepos();
  const [report, setReport] = useState<ReportData | null>(null);
  const [includeAi, setIncludeAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadReport(withAi = includeAi) {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    try {
      setLoading(true);
      setError('');
      setReport(await api.report(activeRepo.id, withAi));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the engineering report.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReport(false); }, [activeRepo]);

  return (
    <PageContainer>
      <PageHeader title="Engineering Report" description="A consolidated, backend-generated summary of repository health, risks, dependencies, and architecture." />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!activeRepo && <p className="card text-sm text-slate-500">Select a repository first.</p>}
      {activeRepo && activeRepo.status !== 'completed' && <p className="card text-sm text-amber-800">The report becomes available when repository analysis completes.</p>}
      {activeRepo?.status === 'completed' && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{report ? `Generated ${new Date(report.generated_at).toLocaleString()}` : 'Preparing report…'}</p>
            <button type="button" disabled={loading} onClick={() => { setIncludeAi(true); void loadReport(true); }} className="btn-primary gap-2">
              <Sparkles size={16} aria-hidden="true" /> {loading ? 'Generating…' : 'Generate AI explanation'}
            </button>
          </div>
          {report && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Health index', report.summary.health_index.toFixed(0)],
                  ['Files', report.summary.total_files],
                  ['Commits', report.summary.total_commits],
                  ['High-risk files', report.summary.high_risk_files],
                ].map(([label, value]) => <div key={label} className="card"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>)}
              </div>
              {report.ai_explanation && <div className="mt-6 card border-blue-100 bg-blue-50/50"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Sparkles size={17} className="text-blue-600" /> AI explanation</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{report.ai_explanation}</p></div>}
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section className="card"><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800"><FileText size={17} /> Recommendations</h2>{report.recommendations.length ? <ul className="space-y-4">{report.recommendations.map((item) => <li key={item.title}><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.suggestion}</p></li>)}</ul> : <p className="text-sm text-slate-500">No recommendations were generated.</p>}</section>
                <section className="card"><h2 className="mb-4 text-sm font-semibold text-slate-800">Highest-risk files</h2>{report.highest_risk_files.length ? <ul className="space-y-3">{report.highest_risk_files.map((file) => <li key={file.path} className="flex justify-between gap-3 text-sm"><span className="truncate">{file.path}</span><span className="font-medium text-red-600">{(file.risk_score * 100).toFixed(0)}</span></li>)}</ul> : <p className="text-sm text-slate-500">No risky files found.</p>}</section>
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
