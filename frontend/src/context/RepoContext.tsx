import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, type Repo } from '@/api';

type RepoContextValue = {
  repos: Repo[];
  activeRepoId: number | null;
  activeRepo: Repo | null;
  loading: boolean;
  error: string;
  refreshRepos: () => Promise<void>;
  removeRepo: (id: number) => Promise<void>;
  addRepo: (url: string, accessToken?: string) => Promise<Repo>;
  selectRepo: (id: number) => void;
};

const RepoContext = createContext<RepoContextValue | undefined>(undefined);
const activeRepoKey = 'sip.active_repo';

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<number | null>(() => {
    const stored = localStorage.getItem(activeRepoKey);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [error, setError] = useState('');

  const refreshRepos = useCallback(async () => {
    if (!getToken()) {
      setRepos([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setRepos(await api.listRepos());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load repositories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshRepos(); }, [refreshRepos]);

  function selectRepo(id: number) {
    setActiveRepoId(id);
    localStorage.setItem(activeRepoKey, String(id));
  }

  async function addRepo(url: string, accessToken?: string) {
    const repo = await api.importRepo(url, accessToken);
    setRepos((current) => [repo, ...current.filter((item) => item.id !== repo.id)]);
    selectRepo(repo.id);
    return repo;
  }

  async function removeRepo(id: number) {
    await api.deleteRepo(id);
    setRepos((current) => current.filter((repo) => repo.id !== id));
    if (activeRepoId === id) {
      setActiveRepoId(null);
      localStorage.removeItem(activeRepoKey);
    }
  }

  const activeRepo = repos.find((repo) => repo.id === activeRepoId) ?? null;
  return (
    <RepoContext.Provider value={{ repos, activeRepoId, activeRepo, loading, error, refreshRepos, addRepo, removeRepo, selectRepo }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepos() {
  const context = useContext(RepoContext);
  if (!context) throw new Error('useRepos must be used within RepoProvider');
  return context;
}
