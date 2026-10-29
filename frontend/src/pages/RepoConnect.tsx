import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRepos } from '@/context/RepoContext';
import { PageContainer, PageHeader } from '@/components/Page';
import { ArrowLeft, ArrowUpRight, FolderGit2, GitBranch, Search, Trash2 } from 'lucide-react';

export default function RepoConnect() {
  const navigate = useNavigate();
  const { repos, addRepo, selectRepo, removeRepo, refreshRepos, loading, error: repoError } = useRepos();
  const [repoUrl, setRepoUrl] = useState('');
  const [pat, setPat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const visibleRepos = repos.filter((repo) => `${repo.name} ${repo.url}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const processing = repos.some((repo) => repo.status === 'processing');
    if (!processing) return;
    const timer = window.setInterval(() => { void refreshRepos(); }, 2000);
    return () => window.clearInterval(timer);
  }, [repos, refreshRepos]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!repoUrl.trim() || submitting) return;
    try {
      setSubmitting(true);
      setError('');
      await addRepo(repoUrl.trim(), pat.trim() || undefined);
      setRepoUrl('');
      setPat('');
      navigate('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to import repository.');
      setSubmitting(false);
    }
  }

  function handleSelect(id: number) {
    selectRepo(id);
    navigate('/dashboard');
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Remove ${name} and its analysis?`)) return;
    try {
      setError('');
      await removeRepo(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove repository.');
    }
  }

  return <div className="min-h-screen bg-slate-50"><PageContainer>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3"><Link to="/" className="inline-flex items-center gap-2 rounded text-xs font-medium text-slate-600"><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</Link><span className="badge">Connected workspace</span></div>
    <PageHeader title="Repositories" description="Connect a GitHub repository or select one that has already been analyzed." />
    {(error || repoError) && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error || repoError}</p>}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="card space-y-5">
        <span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><GitBranch size={24} aria-hidden="true" /></span>
        <h2 className="text-lg font-semibold tracking-tight text-slate-800">Connect a new repository</h2>
        <div><label htmlFor="repository-url" className="mb-1.5 block text-sm font-medium text-slate-700">Repository URL</label><input id="repository-url" type="url" required value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/your-org/your-repo" className="input" /></div>
        <div><label htmlFor="repository-token" className="mb-1.5 block text-sm font-medium text-slate-700">Repository access token <span className="font-normal text-slate-400">(optional)</span></label><input id="repository-token" autoComplete="off" type="password" value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Uses your sign-in token by default" className="input" /></div>
        <button type="submit" disabled={submitting} className="btn-primary w-full gap-2">{submitting ? 'Starting analysis…' : 'Start analysis'} <ArrowUpRight size={16} aria-hidden="true" /></button>
      </form>
      <div className="card"><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><FolderGit2 size={18} aria-hidden="true" /> Recently analyzed <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs">{repos.length}</span></h2><label htmlFor="repository-search" className="sr-only">Search repositories</label><div className="relative mb-4"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="repository-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search repositories…" className="input pl-10" /></div>{loading && !repos.length ? <p className="text-sm text-slate-500">Loading repositories…</p> : visibleRepos.length ? <ul className="space-y-2">{visibleRepos.map((repo) => <li key={repo.id} className="flex items-center gap-2 rounded-lg border px-4 py-3"><button onClick={() => handleSelect(repo.id)} className="min-w-0 flex-1 text-left transition hover:text-blue-700"><p className="truncate text-sm font-medium text-slate-800">{repo.name}</p><p className="mt-0.5 truncate text-xs text-slate-400">{repo.url}</p></button><div className="shrink-0 text-right"><p className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${repo.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : repo.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{repo.status}</p><p className="text-xs text-slate-400">{repo.last_analyzed ? new Date(repo.last_analyzed).toLocaleDateString() : 'Not analyzed'}</p></div><button type="button" aria-label={`Remove ${repo.name}`} onClick={() => void handleDelete(repo.id, repo.name)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button></li>)}</ul> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No repositories yet.</p>}</div>
    </div>
  </PageContainer></div>;
}
