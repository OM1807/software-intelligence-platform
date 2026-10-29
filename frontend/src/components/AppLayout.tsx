import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useRepos } from '@/context/RepoContext';
import { Activity, ArrowLeft, Blocks, GitBranch, GitCompareArrows, LayoutDashboard, Network, ShieldAlert } from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/dependencies', label: 'Dependency Graph', icon: Network },
  { to: '/risk', label: 'Risk Analysis', icon: ShieldAlert },
  { to: '/impact', label: 'Change Impact', icon: GitCompareArrows },
  { to: '/drift', label: 'Architecture Drift', icon: Blocks },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeRepo } = useRepos();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-white md:flex">
      <div className="flex h-20 items-center px-5">
        <span className="mr-2.5 rounded-xl bg-blue-600 p-2 text-white"><GitBranch size={20} aria-hidden="true" /></span>
        <span className="text-base font-semibold tracking-tight text-slate-900">
          SIP
        </span>
        <span className="ml-2 text-xs font-medium text-slate-500">
          Software Intelligence
        </span>
      </div>

      <div className="px-3">
        <button
          onClick={() => navigate('/repositories')}
          className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition hover:bg-slate-50"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400">
              Active repository
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-800">
              {activeRepo ? activeRepo.name : 'Select a repository'}
            </p>
          </div>
          <span className="ml-2 shrink-0 text-xs font-medium text-blue-600">
            Switch
          </span>
        </button>
      </div>

      <p className="mb-2 mt-7 px-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
      <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const active =
            location.pathname === item.to ||
            location.pathname.startsWith(item.to + '/');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={() =>
                `flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon size={17} className="mr-3 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Activity size={15} aria-hidden="true" /> Prototype workspace</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">Explore insights with sample repository data.</p>
        </div>
        <NavLink to="/" className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><ArrowLeft size={14} aria-hidden="true" /> Back to sign in</NavLink>
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
          `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            isActive
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-50'
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
            `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50'
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
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-white/90 px-5 py-3 sm:px-8">
          <p className="text-xs font-medium text-slate-500">Software Intelligence <span className="mx-2 text-slate-300">/</span><span className="text-slate-800">Workspace</span></p>
          <span className="badge"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Sample data</span>
        </header>
        <MobileNav />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
