import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github, GitBranch, Layers3, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { api, backendUrl, getToken, setToken } from '@/api';

const features = [
  { icon: GitBranch, label: 'Map dependencies' },
  { icon: ShieldCheck, label: 'Surface risks' },
  { icon: Layers3, label: 'Track architecture' },
];

export default function Login() {
  const navigate = useNavigate();
  const [token, setPat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Reuse the callback operation across React StrictMode effect replays.
  const callback = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    if (!callback.current) {
      const callbackToken = new URLSearchParams(window.location.search).get('token');
      callback.current = callbackToken
        ? Promise.resolve().then(() => { setToken(callbackToken); window.history.replaceState({}, '', '/login'); })
        : Promise.resolve();
    }
    callback.current.then(() => {
      if (!active) return;
      setLoading(false);
      if (getToken()) navigate('/repositories', { replace: true });
    }).catch((cause: unknown) => {
      if (!active) return;
      setLoading(false);
      setMessage('');
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    });
    return () => { active = false; };
  }, [navigate]);

  async function handleGitHubLogin() {
    setError('');
    setMessage('');
    setLoading(true);
    window.location.assign(backendUrl('/auth/github/login'));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.loginWithPat(token);
      setToken(result.access_token);
      navigate('/repositories', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <section className="relative overflow-hidden bg-slate-950 px-6 py-6 text-white sm:px-12 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-16 lg:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-24 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="rounded-xl bg-blue-500 p-2.5"><GitBranch size={24} aria-hidden="true" /></span>
          <span className="text-sm font-semibold tracking-wide">SOFTWARE INTELLIGENCE</span>
        </div>
        <div className="relative my-20 hidden max-w-lg lg:block">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Clarity for your codebase</p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Understand the code.<br /><span className="text-blue-300">See the bigger picture.</span></h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">Explore dependencies, spot architectural risks, and understand the impact of every change in one workspace.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {features.map(({ icon: Icon, label }) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4"><Icon className="mb-3 text-blue-300" size={20} aria-hidden="true" /><p className="text-xs font-medium text-slate-200">{label}</p></div>)}
          </div>
        </div>
        <p className="relative hidden items-center gap-2 text-xs text-slate-400 lg:flex"><Sparkles size={15} aria-hidden="true" /> Built for a clearer view of software.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <span className="badge mb-5">Your engineering workspace</span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mb-8 mt-2 text-sm leading-relaxed text-slate-500">Connect with GitHub to analyze your repositories.</p>
          <div className="card space-y-5" aria-busy={loading}>
            <button type="button" disabled={loading} onClick={handleGitHubLogin} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <LoaderCircle className="motion-safe:animate-spin" size={19} aria-hidden="true" /> : <Github size={19} aria-hidden="true" />}
              Login with GitHub
            </button>
            <div role="status" aria-live="polite" className={message ? 'rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-relaxed text-blue-900' : ''}>{message}</div>
            {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="flex items-center gap-3"><span className="h-px flex-1 bg-slate-200" /><span className="text-xs text-slate-500">or use a token</span><span className="h-px flex-1 bg-slate-200" /></div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="github-token" className="mb-1.5 block text-sm font-medium text-slate-700">GitHub Personal Access Token</label>
                <input id="github-token" name="github-token" type="password" autoComplete="off" required disabled={loading} value={token} onChange={(e) => setPat(e.target.value)} placeholder="ghp_••••••••••••••••" className="input" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full gap-2">Sign in with token <ArrowRight size={16} aria-hidden="true" /></button>
              <p className="text-xs leading-relaxed text-slate-500">The token is sent only to the backend and is never stored in frontend environment variables.</p>
            </form>
          </div>
          <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">Repository analysis is powered by the connected backend.</p>
        </div>
      </section>
    </main>
  );
}
