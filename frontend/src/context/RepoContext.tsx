import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, type Repo, type User, type UserRole } from '@/api';

type RepoContextValue = {
  repos: Repo[];
  activeRepoId: number | null;
  activeRepo: Repo | null;
  currentUser: User | null;
  authLoading: boolean;
  loading: boolean;
  error: string;
  refreshRepos: () => Promise<void>;
  removeRepo: (id: number) => Promise<void>;
  addRepo: (url: string) => Promise<Repo>;
  reanalyzeRepo: (id: number) => Promise<void>;
  selectRepo: (id: number) => void;
  switchRole: (role: UserRole) => Promise<void>;
  loadUser: () => Promise<void>;
};

const RepoContext = createContext<RepoContextValue | undefined>(undefined);
const activeRepoKey = 'sip.active_repo';

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRepoId, setActiveRepoId] = useState<number | null>(() => {
    const stored = localStorage.getItem(activeRepoKey);
    return stored ? Number(stored) : null;
  });
  const [authLoading, setAuthLoading] = useState(Boolean(getToken()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    try {
      const me = await api.me();
      setCurrentUser(me);
      setError('');
    } catch (cause) {
      setCurrentUser(null);
      setError(cause instanceof Error ? cause.message : 'Unable to verify your session.');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshRepos = useCallback(async () => {
    if (!getToken()) {
      setRepos([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await api.listRepos();
      setRepos(list);
      setError('');

      // Auto select first repo if none active or active not in list
      if (list.length > 0) {
        setActiveRepoId((prev) => {
          if (prev && list.some((r) => r.id === prev)) return prev;
          const firstId = list[0].id;
          localStorage.setItem(activeRepoKey, String(firstId));
          return firstId;
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load repositories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
    void refreshRepos();
  }, [loadUser, refreshRepos]);

  useEffect(() => {
    if (!repos.some((repo) => repo.status === 'processing')) return;
    const timer = window.setInterval(() => { void refreshRepos(); }, 2000);
    return () => window.clearInterval(timer);
  }, [repos, refreshRepos]);

  function selectRepo(id: number) {
    setActiveRepoId(id);
    localStorage.setItem(activeRepoKey, String(id));
  }

  async function addRepo(url: string) {
    const repo = await api.importRepo(url);
    setRepos((current) => [repo, ...current.filter((item) => item.id !== repo.id)]);
    selectRepo(repo.id);
    return repo;
  }

  async function reanalyzeRepo(id: number) {
    const updated = await api.reanalyzeRepo(id);
    setRepos((current) => current.map((r) => (r.id === id ? updated : r)));
  }

  async function removeRepo(id: number) {
    await api.deleteRepo(id);
    setRepos((current) => current.filter((repo) => repo.id !== id));
    if (activeRepoId === id) {
      setActiveRepoId(null);
      localStorage.removeItem(activeRepoKey);
    }
  }

  async function switchRole(role: UserRole) {
    try {
      const updated = await api.updateRole(role);
      setCurrentUser(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to switch role.');
    }
  }

  const activeRepo = repos.find((repo) => repo.id === activeRepoId) ?? null;

  return (
    <RepoContext.Provider
      value={{
        repos,
        activeRepoId,
        activeRepo,
        currentUser,
        authLoading,
        loading,
        error,
        refreshRepos,
        addRepo,
        reanalyzeRepo,
        removeRepo,
        selectRepo,
        switchRole,
        loadUser,
      }}
    >
      {children}
    </RepoContext.Provider>
  );
}

export function useRepos() {
  const context = useContext(RepoContext);
  if (!context) throw new Error('useRepos must be used within RepoProvider');
  return context;
}
