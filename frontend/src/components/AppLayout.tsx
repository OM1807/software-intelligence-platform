import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useRepos } from '@/context/RepoContext';
import { clearToken, api, type UserRole, type SystemConfig } from '@/api';
import {
  Activity,
  ArrowLeft,
  Blocks,
  Bot,
  FileText,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  Network,
  RotateCw,
  Settings,
  ShieldAlert,
  UserCheck,
  X,
  CheckCircle2,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/dependencies', label: 'Dependency Graph', icon: Network },
  { to: '/risk', label: 'Risk Analysis', icon: ShieldAlert },
  { to: '/impact', label: 'Change Impact', icon: GitCompareArrows },
  { to: '/drift', label: 'Architecture Drift', icon: Blocks },
  { to: '/report', label: 'Engineering Report', icon: FileText },
  { to: '/assistant', label: 'Ask AI Assistant', icon: Bot },
];

function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getSystemConfig().then(setConfig).catch(() => {});
      setSaved(false);
    }
  }, [isOpen]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateSystemConfig({ llm_api_key: apiKey.trim() || undefined });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Settings className="text-blue-600" size={20} />
            <h3 className="text-base font-semibold text-slate-900">System Configuration</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Google Gemini API Key</label>
            <p className="mt-0.5 text-xs text-slate-500">Enables live Gemini 2.0 AI answers and narrative report generation.</p>
            <input
              type="password"
              placeholder={config?.llm_configured ? '•••••••••••••••• (Configured)' : 'AIzaSy...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="input mt-2"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Status: {config?.llm_configured ? <span className="font-medium text-emerald-600">Connected</span> : <span className="font-medium text-amber-600">Local Heuristics Engine Active</span>}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p><span className="font-semibold">Supported Parsers:</span> Python (Tree-sitter), TS/JS, Java</p>
            <p><span className="font-semibold">Graph Engine:</span> NetworkX Multi-language AST</p>
            <p><span className="font-semibold">Environment:</span> {config?.environment || 'Development'}</p>
          </div>

          {saved && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={15} /> Configuration updated successfully
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              Close
            </button>
            <button type="submit" disabled={saving} className="btn-primary py-1.5 text-xs">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeRepo } = useRepos();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-white md:flex">
      <div className="flex h-20 items-center px-5">
        <span className="mr-2.5 rounded-xl bg-blue-600 p-2 text-white shadow-md shadow-blue-500/20">
          <GitBranch size={20} aria-hidden="true" />
        </span>
        <div>
          <span className="text-base font-bold tracking-tight text-slate-900">
            SIP
          </span>
          <span className="block text-[11px] font-medium text-slate-400">
            Software Intelligence
          </span>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => navigate('/repositories')}
          className="group flex w-full items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Active Repository
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">
              {activeRepo ? activeRepo.name : 'Select repository'}
            </p>
            {activeRepo && (
              <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${
                activeRepo.status === 'completed'
                  ? 'text-emerald-600'
                  : activeRepo.status === 'processing'
                  ? 'text-blue-600'
                  : 'text-red-500'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  activeRepo.status === 'completed' ? 'bg-emerald-500' : activeRepo.status === 'processing' ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                }`} />
                {activeRepo.status}
              </span>
            )}
          </div>
          <span className="ml-2 shrink-0 text-xs font-semibold text-blue-600 group-hover:underline">
            Switch
          </span>
        </button>
      </div>

      <p className="mb-2 mt-6 px-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
        Analytics Modules
      </p>
      <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const active =
            location.pathname === item.to ||
            location.pathname.startsWith(item.to + '/');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={() =>
                `flex items-center rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-inset ring-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon size={17} className={`mr-3 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Activity size={14} className="text-emerald-500" /> Walchand CSE SIP
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Autonomous repository intelligence & architecture validation.</p>
        </div>
        <button
          onClick={() => { clearToken(); navigate('/'); }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft size={13} aria-hidden="true" /> Sign out
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Mobile workspace" className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white px-3 py-2 md:hidden">
      <NavLink
        to="/repositories"
        className={({ isActive }) =>
          `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
          }`
        }
      >
        Repositories
      </NavLink>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { activeRepo, currentUser, switchRole, reanalyzeRepo } = useRepos();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const roleLabels: Record<UserRole, { label: string; badge: string }> = {
    developer: { label: 'Developer', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    architect: { label: 'Software Architect', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
    administrator: { label: 'Administrator', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  };

  const currentRole = (currentUser?.role || 'developer') as UserRole;
  const roleInfo = roleLabels[currentRole] || roleLabels.developer;

  async function handleReanalyze() {
    if (!activeRepo) return;
    try {
      setReanalyzing(true);
      await reanalyzeRepo(activeRepo.id);
    } catch {
      // Ignore
    } finally {
      setReanalyzing(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-500">
              Software Intelligence <span className="mx-1.5 text-slate-300">/</span>
              <span className="text-slate-800">{activeRepo ? activeRepo.name : 'Workspace'}</span>
            </p>
            {activeRepo && (
              <button
                type="button"
                onClick={handleReanalyze}
                title="Re-run analysis engine"
                disabled={reanalyzing || activeRepo.status === 'processing'}
                className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCw size={12} className={reanalyzing || activeRepo.status === 'processing' ? 'animate-spin text-blue-600' : ''} />
                Re-analyze
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Role Switcher Pill */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1 text-xs">
              <span className="flex items-center gap-1 px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                <UserCheck size={13} /> Role:
              </span>
              <select
                aria-label="Active Role"
                value={currentRole}
                onChange={(e) => void switchRole(e.target.value as UserRole)}
                className={`rounded-lg border px-2 py-0.5 text-xs font-semibold cursor-pointer outline-none ${roleInfo.badge}`}
              >
                <option value="developer">Developer</option>
                <option value="architect">Software Architect</option>
                <option value="administrator">Administrator</option>
              </select>
            </div>

            {/* System Settings Button */}
            <button
              onClick={() => setSettingsOpen(true)}
              title="System Configuration & LLM"
              className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>
        <MobileNav />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
