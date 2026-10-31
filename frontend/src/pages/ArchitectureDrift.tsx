import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, type DriftReport } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

export default function ArchitectureDrift() {
  const { activeRepo } = useRepos();
  const [report, setReport] = useState<DriftReport | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    api.drift(activeRepo.id).then(setReport).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load drift report.'));
  }, [activeRepo]);
  return <PageContainer>
    <PageHeader title="Architecture Drift" description="Detected violations of the intended architectural boundaries." />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {report && <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <div className="card"><p className="text-xs font-semibold uppercase text-slate-500">Compliance score</p><p className="mt-2 text-3xl font-bold text-slate-900">{report.compliance_score.toFixed(0)}%</p></div>
      <div className="card"><p className="text-xs font-semibold uppercase text-slate-500">Active rules</p><p className="mt-2 text-3xl font-bold text-slate-900">{report.rules.filter((rule) => rule.is_active).length}</p></div>
      <div className="card"><p className="text-xs font-semibold uppercase text-slate-500">Violations</p><p className="mt-2 text-3xl font-bold text-slate-900">{report.violations.length}</p></div>
    </div>}
    {report && report.violations.length > 0 && <div className="space-y-4">{report.violations.map((violation, index) => <div key={`${violation.source}-${violation.target}-${index}`} className="card border-amber-200"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} /><div><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium uppercase text-amber-700">{violation.severity}</span><h3 className="mt-2 text-sm font-semibold text-slate-900">{violation.source} → {violation.target}</h3><p className="mt-1.5 text-sm text-slate-600">Rule: {violation.rule}</p></div></div></div>)}</div>}
    {report && report.violations.length === 0 && <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50/50 text-sm text-emerald-800"><CheckCircle2 size={20} /> No active architectural rules were violated by the analyzed dependency graph.</div>}
  </PageContainer>;
}
