const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const tokenKey = 'sip.access_token';

export type User = {
  id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
};

export type Repo = {
  id: number;
  url: string;
  owner: string;
  name: string;
  is_private: boolean;
  status: string;
  error: string | null;
  last_analyzed: string | null;
};

export type FileMetric = {
  path: string;
  loc: number;
  complexity: number;
  churn: number;
  risk_score: number;
};

export type HealthSummary = {
  health_index: number;
  total_files: number;
  total_commits: number;
  high_risk_files: number;
};

export type Dashboard = {
  repo_id: number;
  summary: HealthSummary;
  timeline: { date: string; commits: number; health_index: number }[];
};

export type Analysis = {
  repo_id: number;
  summary: HealthSummary;
  risky_files: FileMetric[];
  explanation: string | null;
};

export type DependencyGraph = {
  nodes: {
    id: string;
    label: string;
    language: string;
    loc: number;
    fan_in: number;
    fan_out: number;
    centrality: number;
    instability: number;
    in_cycle: boolean;
  }[];
  edges: { source: string; target: string; weight: number }[];
  cycles: string[][];
  stats: Record<string, number>;
};

export type DriftReport = {
  repo_id: number;
  violations: { source: string; target: string; rule: string; severity: string }[];
};

export type ImpactReport = {
  repo_id: number;
  changed_files: string[];
  ignored_files: string[];
  impacted_files: {
    path: string;
    depth: number;
    relationship: string;
    risk_score: number;
    centrality: number;
  }[];
};

export type EngineeringReport = {
  repo_id: number;
  generated_at: string;
  summary: HealthSummary;
  key_metrics: Record<string, number | string>;
  highest_risk_files: FileMetric[];
  cycles: string[][];
  architecture_violations: { source: string; target: string; rule: string; severity: string }[];
  recommendations: { title: string; suggestion: string; evidence: string[]; severity: string }[];
  ai_explanation: string | null;
  llm_available: boolean;
};

export function getToken(): string | null {
  return localStorage.getItem(tokenKey);
}

export function setToken(token: string): void {
  localStorage.setItem(tokenKey, token);
}

export function clearToken(): void {
  localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // Preserve the HTTP error when the server does not return JSON.
    }
    if (response.status === 401) clearToken();
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  loginWithPat: (token: string) =>
    request<{ access_token: string; user: User }>('/auth/pat', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  me: () => request<User>('/auth/me'),
  listRepos: () => request<Repo[]>('/repositories'),
  importRepo: (url: string, accessToken?: string) =>
    request<Repo>('/repositories/import', {
      method: 'POST',
      body: JSON.stringify({ url, access_token: accessToken || null }),
    }),
  getRepo: (id: number) => request<Repo>(`/repositories/${id}`),
  deleteRepo: (id: number) => request<void>(`/repositories/${id}`, { method: 'DELETE' }),
  dashboard: (id: number) => request<Dashboard>(`/dashboard/${id}`),
  analysis: (id: number) => request<Analysis>(`/analysis/${id}?limit=200`),
  dependencies: (id: number) => request<DependencyGraph>(`/analysis/${id}/dependencies`),
  drift: (id: number) => request<DriftReport>(`/analysis/${id}/drift`),
  impact: (id: number, changedFiles: string[]) =>
    request<ImpactReport>(`/analysis/${id}/impact`, {
      method: 'POST',
      body: JSON.stringify({ changed_files: changedFiles, depth: 3, limit: 25 }),
    }),
  report: (id: number, includeAi = false) =>
    request<EngineeringReport>(`/analysis/${id}/report?include_ai=${includeAi}`),
};

export function backendUrl(path: string): string {
  return `${API_URL}${path}`;
}
