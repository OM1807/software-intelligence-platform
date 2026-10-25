import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRepos } from '@/context/RepoContext';
import { PageContainer, PageHeader } from '@/components/Page';
import { ArrowLeft, ArrowUpRight, FolderGit2, GitBranch, Search } from 'lucide-react';

const loadingSteps = [
  'Cloning repository…',
  'Parsing source files…',
  'Building dependency graph…',
  'Computing risk scores…',
  'Finalizing analysis…',
];

export default function RepoConnect() {
  const navigate = useNavigate();
  const { repos, addRepo, selectRepo } = useRepos();
  const [repoUrl, setRepoUrl] = useState('');
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [search, setSearch] = useState('');
  const analysisInterval = useRef<ReturnType<typeof setInterval>>();
  const navigationTimer = useRef<ReturnType<typeof setTimeout>>();
  const visibleRepos = repos.filter((repo) => `${repo.name} ${repo.url}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => () => {
    clearInterval(analysisInterval.current);
    clearTimeout(navigationTimer.current);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim() || loading) return;
    setLoading(true);
    setStepIndex(0);

    let step = 0;
    analysisInterval.current = setInterval(() => {
      if (step >= loadingSteps.length - 1) {
        clearInterval(analysisInterval.current);
        addRepo(repoUrl.trim());
        navigationTimer.current = setTimeout(() => navigate('/dashboard'), 500);
        return;
      }
      step += 1;
      setStepIndex(step);
    }, 700);
  }

  function handleSelect(id: string) {
    selectRepo(id);
    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PageContainer>
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded text-xs font-medium text-slate-600"><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</Link>
          <span className="badge">Prototype · Sample data</span>
        </div>
        <PageHeader
          title="Repositories"
          description="Connect a new repository or select a previously analyzed one to view its insights."
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Add new repo */}
          <div>
            {loading ? (
              <div className="card" role="status" aria-live="polite" aria-busy="true">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                  <span className="text-sm font-medium text-slate-700">
                    {loadingSteps[stepIndex]}
                  </span>
                </div>
                <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{
                      width: `${((stepIndex + 1) / loadingSteps.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="card space-y-5">
                <span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><GitBranch size={24} aria-hidden="true" /></span>
                <h2 className="text-lg font-semibold tracking-tight text-slate-800">
                  Connect a new repository
                </h2>
                <div>
                  <label htmlFor="repository-url" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Repository URL
                  </label>
                  <input
                    id="repository-url"
                    type="url"
                    required
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/your-org/your-repo"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="repository-token" className="mb-1.5 block text-sm font-medium text-slate-700">
                    GitHub Personal Access Token
                    <span className="ml-1.5 font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="repository-token"
                    autoComplete="off"
                    type="password"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="ghp_••••••••••••••••"
                    className="input"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Demo only: this value is not used or sent. Do not enter a real token.
                  </p>
                </div>
                <button type="submit" className="btn-primary w-full gap-2">
                  Start Analysis <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </form>
            )}
          </div>

          {/* Recent repos */}
          <div>
            <div className="card">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FolderGit2 size={18} aria-hidden="true" /> Recently analyzed <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs">{repos.length}</span>
              </h2>
              <label htmlFor="repository-search" className="sr-only">Search repositories</label>
              <div className="relative mb-4"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="repository-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search repositories…" className="input pl-10" /></div>
              {visibleRepos.length === 0 ? (
                <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">{repos.length ? 'No repositories match your search.' : 'No repositories yet.'}</p>
              ) : (
                <ul className="space-y-2">
                  {visibleRepos.map((repo) => (
                    <li key={repo.id}>
                      <button
                        onClick={() => handleSelect(repo.id)}
                        className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {repo.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {repo.url}
                          </p>
                        </div>
                        <div className="ml-4 shrink-0 text-right">
                          <p className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${repo.healthScore >= 70 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                            {repo.healthScore} / 100
                          </p>
                          <p className="text-xs text-slate-400">
                            {repo.analyzedAt}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
