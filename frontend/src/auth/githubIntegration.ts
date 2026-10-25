import type { GitHubConfig, GitHubExchange } from './githubOAuth';

export const githubConfig: GitHubConfig = {
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
  redirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI || `${window.location.origin}/auth/github/callback`,
  scope: import.meta.env.VITE_GITHUB_SCOPE || '',
};

// Backend auth.py is currently empty. Replace null with an async adapter once
// its URL, payload, response and session behavior are agreed. See INTEGRATION.md.
// Never place a client secret or GitHub access token in VITE_* variables.
export const exchangeGitHubCode: GitHubExchange | null = null;
