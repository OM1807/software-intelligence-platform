const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const tokenKey = 'sip.access_token';

export type UserRole = 'developer' | 'architect' | 'administrator';

export type User = {
  id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
  role: UserRole;
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

export type GraphNode = {
  id: string;
  label: string;
  language: string;
  loc: number;
  fan_in: number;
  fan_out: number;
  centrality: number;
  instability: number;
  in_cycle: boolean;
};

export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
};

export type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];
  stats: Record<string, number>;
};

export type Rule = {
  id: number;
  repo_id: number | null;
  rule_id: string;
  rule_name: string;
  rule_description: string | null;
  source_layer: string;
  target_layer: string;
  severity: 'low' | 'medium' | 'high';
  is_active: boolean;
};

export type DriftViolation = {
  source: string;
  target: string;
  rule: string;
  severity: string;
};

export type DriftReport = {
  repo_id: number;
  violations: DriftViolation[];
  rules: Rule[];
  compliance_score: number;
};

export type ImpactItem = {
  path: string;
  depth: number;
  relationship: string;
  risk_score: number;
  centrality: number;
};

export type ImpactReport = {
  repo_id: number;
  changed_files: string[];
  ignored_files: string[];
  impacted_files: ImpactItem[];
};

export type Recommendation = {
  title: string;
  suggestion: string;
  evidence: string[];
  severity: string;
};

export type EngineeringReport = {
  repo_id: number;
  generated_at: string;
  summary: HealthSummary;
  key_metrics: Record<string, number | string>;
  highest_risk_files: FileMetric[];
  cycles: string[][];
  architecture_violations: DriftViolation[];
  impact?: ImpactReport | null;
  recommendations: Recommendation[];
  ai_explanation: string | null;
  llm_available: boolean;
};

export type AskAIResponse = {
  repo_id: number;
  question: string;
  answer: string;
  provider: string;
};

export type SystemConfig = {
  environment: string;
  llm_configured: boolean;
  default_depth: number;
  supported_languages: string[];
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
      // Preserve status text if not JSON
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
  updateRole: (role: string) =>
    request<User>('/auth/role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  me: () => request<User>('/auth/me'),
  listRepos: () => request<Repo[]>('/repositories'),
  importRepo: (url: string) =>
    request<Repo>('/repositories/import', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  reanalyzeRepo: (id: number) =>
    request<Repo>(`/repositories/${id}/reanalyze`, {
      method: 'POST',
    }),
  getRepo: (id: number) => request<Repo>(`/repositories/${id}`),
  deleteRepo: (id: number) => request<void>(`/repositories/${id}`, { method: 'DELETE' }),
  dashboard: (id: number) => request<Dashboard>(`/dashboard/${id}`),
  analysis: (id: number, limit = 200) => request<Analysis>(`/analysis/${id}?limit=${limit}`),
  dependencies: (id: number, includeIsolated = true) =>
    request<DependencyGraph>(`/analysis/${id}/dependencies?include_isolated=${includeIsolated}`),
  drift: (id: number) => request<DriftReport>(`/analysis/${id}/drift`),
  getRules: (id: number) => request<Rule[]>(`/analysis/${id}/rules`),
  createRule: (id: number, rule: { rule_id: string; rule_name: string; rule_description?: string; source_layer: string; target_layer: string; severity: string }) =>
    request<Rule>(`/analysis/${id}/rules`, {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  toggleRule: (repoId: number, ruleId: number) =>
    request<Rule>(`/analysis/${repoId}/rules/${ruleId}/toggle`, {
      method: 'PATCH',
    }),
  deleteRule: (repoId: number, ruleId: number) =>
    request<void>(`/analysis/${repoId}/rules/${ruleId}`, {
      method: 'DELETE',
    }),
  impact: (id: number, changedFiles: string[], depth = 3, limit = 25) =>
    request<ImpactReport>(`/analysis/${id}/impact`, {
      method: 'POST',
      body: JSON.stringify({ changed_files: changedFiles, depth, limit }),
    }),
  report: (id: number, includeAi = false) =>
    request<EngineeringReport>(`/analysis/${id}/report?include_ai=${includeAi}`),
  askAI: (id: number, question: string) =>
    request<AskAIResponse>(`/analysis/${id}/ai-ask`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  getSystemConfig: () => request<SystemConfig>('/analysis/system/config'),
  updateSystemConfig: (config: { llm_api_key?: string }) =>
    request<SystemConfig>('/analysis/system/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};

export function backendUrl(path: string): string {
  return `${API_URL}${path}`;
}
