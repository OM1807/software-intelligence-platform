import { useState } from 'react';
import { api, type ImpactReport } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

export default function ChangeImpact() {
  const { activeRepo } = useRepos();
  const [files, setFiles] = useState('');
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!activeRepo) return;
    try {
      setError('');
      setReport(await api.impact(activeRepo.id, files.split(/\r?\n|,/).map((file) => file.trim()).filter(Boolean)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to calculate change impact.'); }
  }
  return <PageContainer>
    <PageHeader title="Change Impact" description="Find files affected by changed files in the repository dependency graph." />
    <form onSubmit={submit} className="card mb-6 space-y-3"><label htmlFor="changed-files" className="block text-sm font-medium text-slate-700">Changed files (one per line)</label><textarea id="changed-files" required value={files} onChange={(event) => setFiles(event.target.value)} className="input min-h-24" placeholder="src/api/routes.py" /><button className="btn-primary" type="submit">Calculate impact</button></form>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {report && <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Impacted files</h2>
        <span className="text-xs text-slate-500">{report.changed_files.length} changed · {report.impacted_files.length} affected</span>
      </div>
      {report.impacted_files.length ? <ul className="space-y-3">{report.impacted_files.map((file) => <li key={file.path} className="flex justify-between gap-4 text-sm"><span className="truncate">{file.path}</span><span className="shrink-0 text-slate-500">{file.relationship} · depth {file.depth} · risk {(file.risk_score * 100).toFixed(0)}</span></li>)}</ul> : <p className="text-sm text-slate-500">No dependent files were found in the selected depth.</p>}
    </div>}
  </PageContainer>;
}
