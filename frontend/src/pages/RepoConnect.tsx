import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepos } from '@/context/RepoContext';
import { clearToken } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import {
  ArrowLeft,
  ArrowUpRight,
  FolderGit2,
  GitBranch,
  Search,
  Trash2,
  RotateCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export default function RepoConnect() {
  const navigate = useNavigate();
  const { repos, addRepo, selectRepo, removeRepo, reanalyzeRepo, refreshRepos, loadUser, loading, error: repoError } = useRepos();
  const [repoUrl, setRepoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const visibleRepos = repos.filter((repo) => `${repo.name} ${repo.url} ${repo.owner}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    void loadUser();
    void refreshRepos();
  }, [loadUser, refreshRepos]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    try {
      setSubmitting(true);
      setError('');
      if (!repoUrl.trim()) return;
      await addRepo(repoUrl.trim());
      setRepoUrl('');
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

  async function handleReanalyze(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    try {
      await reanalyzeRepo(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to re-analyze repository.');
    }
  }

  async function handleDelete(e: React.MouseEvent, id: number, name: string) {
    e.stopPropagation();
    if (!window.confirm(`Delete repository "${name}" and all extracted analysis records?`)) return;
    try {
      setError('');
      await removeRepo(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove repository.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PageContainer>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => { clearToken(); navigate('/login', { replace: true }); }} className="inline-flex items-center gap-2 rounded text-xs font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
          </button>
          <span className="badge bg-blue-50 text-blue-700 border-blue-200">
            Connected Workspace
          </span>
        </div>

        <PageHeader
          title="Repositories"
          description="Connect a GitHub repository you can access to generate engineering intelligence."
        />

        {(error || repoError) && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {error || repoError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Connect Form */}
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                <GitBranch size={18} className="text-blue-600" /> Connect Repository
              </span>
            </div>

            <>
                <div>
                  <label htmlFor="repository-url" className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                    GitHub Repository URL
                  </label>
                  <input
                    id="repository-url"
                    type="url"
                    required
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    placeholder="https://github.com/pallets/flask"
                    className="input"
                  />
                </div>
            </>

            <button
              type="submit"
              disabled={submitting || !repoUrl.trim()}
              className="btn-primary w-full gap-2 py-2.5"
            >
              {submitting ? (
                <>
                  <RotateCw className="animate-spin" size={16} /> Initializing Analysis…
                </>
              ) : (
                <>
                  Start Repository Analysis <ArrowUpRight size={16} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* Analyzed Repositories List */}
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <FolderGit2 size={18} className="text-blue-600" /> Analyzed Repositories
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {repos.length}
              </span>
            </div>

            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search connected repositories…"
                className="input pl-9 text-xs"
              />
            </div>

            {loading && !repos.length ? (
              <p className="py-8 text-center text-xs text-slate-500">Loading repositories…</p>
            ) : visibleRepos.length ? (
              <ul className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {visibleRepos.map((repo) => (
                  <li
                    key={repo.id}
                    onClick={() => handleSelect(repo.id)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-blue-400 hover:shadow-sm cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-800 group-hover:text-blue-600">
                          {repo.name}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{repo.url}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          repo.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : repo.status === 'failed'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                        }`}
                      >
                        {repo.status === 'completed' ? (
                          <CheckCircle2 size={12} />
                        ) : repo.status === 'failed' ? (
                          <AlertCircle size={12} />
                        ) : (
                          <RotateCw size={12} className="animate-spin" />
                        )}
                        {repo.status}
                      </span>

                      <button
                        type="button"
                        title="Re-analyze repository"
                        onClick={(e) => void handleReanalyze(e, repo.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                      >
                        <RotateCw size={14} />
                      </button>

                      <button
                        type="button"
                        title="Delete repository"
                        onClick={(e) => void handleDelete(e, repo.id, repo.name)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <FolderGit2 className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="text-xs font-semibold text-slate-600">No repositories imported yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">Connect a GitHub URL that your signed-in account can access.</p>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
