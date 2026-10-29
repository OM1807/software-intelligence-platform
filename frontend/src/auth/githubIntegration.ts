import type { GitHubConfig } from './githubOAuth';

export const githubConfig: GitHubConfig = {
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
  redirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI || `${window.location.origin}/auth/github/callback`,
  scope: import.meta.env.VITE_GITHUB_SCOPE || '',
};
