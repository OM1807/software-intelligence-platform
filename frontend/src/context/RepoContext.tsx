import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type Repo = {
  id: string;
  url: string;
  name: string;
  analyzedAt: string;
  healthScore: number;
  files: number;
};

const seedRepos: Repo[] = [
  {
    id: 'r1',
    url: 'https://github.com/acme/payment-service',
    name: 'payment-service',
    analyzedAt: '2026-08-18',
    healthScore: 78,
    files: 4812,
  },
  {
    id: 'r2',
    url: 'https://github.com/acme/auth-gateway',
    name: 'auth-gateway',
    analyzedAt: '2026-08-15',
    healthScore: 64,
    files: 2310,
  },
  {
    id: 'r3',
    url: 'https://github.com/acme/notification-engine',
    name: 'notification-engine',
    analyzedAt: '2026-08-10',
    healthScore: 91,
    files: 1840,
  },
];

type RepoContextValue = {
  repos: Repo[];
  activeRepoId: string | null;
  activeRepo: Repo | null;
  addRepo: (url: string) => Repo;
  selectRepo: (id: string) => void;
};

const RepoContext = createContext<RepoContextValue | undefined>(undefined);

function repoNameFromUrl(url: string): string {
  const clean = url.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1] || 'repository';
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repo[]>(seedRepos);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);

  function addRepo(url: string): Repo {
    const repo: Repo = {
      id: `r${Date.now()}`,
      url,
      name: repoNameFromUrl(url),
      analyzedAt: new Date().toISOString().slice(0, 10),
      healthScore: 70 + Math.floor(Math.random() * 25),
      files: 1000 + Math.floor(Math.random() * 4000),
    };
    setRepos((prev) => [repo, ...prev]);
    setActiveRepoId(repo.id);
    return repo;
  }

  function selectRepo(id: string) {
    setActiveRepoId(id);
  }

  const activeRepo = repos.find((r) => r.id === activeRepoId) ?? null;

  return (
    <RepoContext.Provider
      value={{ repos, activeRepoId, activeRepo, addRepo, selectRepo }}
    >
      {children}
    </RepoContext.Provider>
  );
}

export function useRepos() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepos must be used within RepoProvider');
  return ctx;
}
