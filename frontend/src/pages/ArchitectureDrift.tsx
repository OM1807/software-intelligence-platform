import { useEffect, useState } from 'react';
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
    <div className="space-y-4">{(report?.violations ?? []).map((violation, index) => <div key={`${violation.source}-${violation.target}-${index}`} className="card"><div className="flex items-start justify-between gap-4"><div><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium uppercase text-amber-700">{violation.severity}</span><h3 className="mt-2 text-sm font-semibold text-slate-900">{violation.source} → {violation.target}</h3><p className="mt-1.5 text-sm text-slate-600">{violation.rule}</p></div></div></div>)}</div>
    {report && report.violations.length === 0 && <p className="card text-sm text-slate-500">No architecture violations detected.</p>}
  </PageContainer>;
}
