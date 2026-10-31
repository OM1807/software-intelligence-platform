import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github, GitBranch, Layers3, LoaderCircle, ShieldCheck, Sparkles, KeyRound } from 'lucide-react';
import { api, backendUrl, getToken, setToken } from '@/api';

const features = [
  { icon: GitBranch, label: 'Multi-Language AST & Graph', desc: 'Parses Python, TypeScript, JavaScript & Java' },
  { icon: ShieldCheck, label: 'Risk & Churn Analytics', desc: 'Identifies high-complexity, churn-heavy hotspots' },
  { icon: Layers3, label: 'Architecture Drift Detection', desc: 'Enforces custom layer constraints & detects violations' },
];

export default function Login() {
  const navigate = useNavigate();
  const [token, setPat] = useState('');
  const [activeTab, setActiveTab] = useState<'pat' | 'oauth'>('oauth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const callback = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    if (!callback.current) {
      const callbackToken = new URLSearchParams(window.location.search).get('token');
      callback.current = callbackToken
        ? Promise.resolve().then(() => {
            setToken(callbackToken);
            window.history.replaceState({}, '', '/login');
          })
        : Promise.resolve();
    }
    callback.current
      .then(() => {
        if (!active) return;
        setLoading(false);
        if (getToken()) navigate('/repositories', { replace: true });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLoading(false);
        setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleGitHubLogin() {
    setError('');
    setLoading(true);
    window.location.assign(backendUrl('/auth/github/login'));
  }

  async function handlePatSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.loginWithPat(token);
      setToken(result.access_token);
      navigate('/repositories', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in with token.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      {/* Brand Hero Panel */}
      <section className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-12 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-16 lg:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-24 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-blue-600 p-2.5 shadow-lg shadow-blue-500/30">
              <GitBranch size={24} aria-hidden="true" />
            </span>
            <div>
              <span className="text-sm font-bold tracking-wider">SOFTWARE INTELLIGENCE PLATFORM</span>
              <p className="text-[11px] text-blue-300">Walchand College of Engineering, Sangli (Autonomous)</p>
            </div>
          </div>
        </div>

        <div className="relative my-12 hidden max-w-lg lg:block">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-blue-400">
            Repository Intelligence & Analytics
          </p>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Understand Code.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
              Control Architecture.
            </span>
          </h2>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-300">
            Automated multi-language AST parsing, Git repository mining, circular dependency resolution, and blast-radius change impact prediction in a unified engineering dashboard.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <Icon className="mb-2 text-blue-400" size={20} aria-hidden="true" />
                <p className="text-xs font-bold text-slate-100">{label}</p>
                <p className="mt-1 text-[10px] text-slate-400 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative hidden items-center gap-2 text-xs text-slate-400 lg:flex">
          <Sparkles size={14} className="text-blue-400" aria-hidden="true" /> Mini-Project 2026-27 · Department of Computer Science & Engineering
        </p>
      </section>

      {/* Auth Panel */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <span className="badge mb-2 bg-blue-50 text-blue-700 border border-blue-200">
              SIP Engineering Suite
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Sign in to workspace</h1>
            <p className="mt-1 text-sm text-slate-500">Access engineering dashboards, dependency graphs, and drift detection.</p>
          </div>

          {/* Authentication method selector */}
          <div className="mb-6 flex rounded-xl bg-slate-200/60 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('pat')}
              className={`flex-1 rounded-lg py-2 transition ${
                activeTab === 'pat' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Personal Access Token
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('oauth')}
              className={`flex-1 rounded-lg py-2 transition ${
                activeTab === 'oauth' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              GitHub OAuth
            </button>
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </p>
          )}

          <div className="card space-y-4" aria-busy={loading}>
            {activeTab === 'pat' && (
              <form onSubmit={handlePatSubmit} className="space-y-4">
                <div>
                  <label htmlFor="github-token" className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                    GitHub Personal Access Token (PAT)
                  </label>
                  <input
                    id="github-token"
                    type="password"
                    autoComplete="off"
                    required
                    disabled={loading}
                    value={token}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="ghp_••••••••••••••••••••"
                    className="input"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Requires `repo` scope to clone private repos.</p>
                </div>
                <button type="submit" disabled={loading || !token.trim()} className="btn-primary w-full gap-2 py-2.5">
                  <KeyRound size={16} /> Sign in with PAT <ArrowRight size={15} />
                </button>
              </form>
            )}

            {activeTab === 'oauth' && (
              <div className="space-y-4 py-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Redirects to GitHub OAuth authorization. Requires GITHUB_CLIENT_ID configured in the backend environment.
                </p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGitHubLogin}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 shadow-md shadow-slate-900/20"
                >
                  {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Github size={18} />}
                  Login with GitHub OAuth
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
