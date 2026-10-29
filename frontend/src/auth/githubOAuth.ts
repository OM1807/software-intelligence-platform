export type GitHubConfig = { clientId: string; redirectUri: string; scope?: string };
export type GitHubAuthorization = { code: string; state: string; redirectUri: string; codeVerifier: string };
// Internal frontend interface, not an HTTP contract. Resolve only once the
// backend has established and verified an app session.
export type GitHubExchange = (authorization: GitHubAuthorization, signal: AbortSignal) => Promise<void>;
const storageKey = 'sip.github.authorization';
const maxAge = 10 * 60 * 1000;
type PendingAuthorization = { state: string; verifier: string; redirectUri: string; createdAt: number };

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function validateConfig(config: GitHubConfig): URL {
  if (!config.clientId.trim()) throw new Error('GitHub sign-in is not configured yet. You can explore the demo below.');
  let redirect: URL;
  try { redirect = new URL(config.redirectUri); }
  catch { throw new Error('The GitHub callback URL is not configured correctly.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
  if (redirect.origin !== window.location.origin || redirect.search || redirect.hash ||
      redirect.username || redirect.password || !['/', '/auth/github/callback'].includes(redirect.pathname) ||
      (redirect.protocol !== 'https:' && !(local && redirect.protocol === 'http:'))) {
    throw new Error('The GitHub callback must use this site’s origin and a supported login route.');
  }
  return redirect;
}

export async function createGitHubAuthorizationUrl(config: GitHubConfig): Promise<string> {
  const redirect = validateConfig(config);
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const pending: PendingAuthorization = { state, verifier, redirectUri: redirect.href, createdAt: Date.now() };
  try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
  catch { throw new Error('Allow session storage in your browser to sign in with GitHub.'); }
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId.trim(), redirect_uri: redirect.href,
    state, code_challenge: challenge, code_challenge_method: 'S256',
    ...(config.scope?.trim() ? { scope: config.scope.trim() } : {}),
  }).toString();
  return url.href;
}

// Consume once and scrub the URL before asynchronous work. Never log codes.
export function captureGitHubCallback(): GitHubAuthorization | null {
  const url = new URL(window.location.href);
  if (!['code', 'state', 'error', 'error_description'].some((key) => url.searchParams.has(key))) return null;
  const params = new URLSearchParams(url.search);
  for (const key of ['code', 'state', 'error', 'error_description', 'error_uri']) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  let pending: PendingAuthorization;
  try {
    const stored = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    pending = JSON.parse(stored || 'null');
  } catch { throw new Error('Your sign-in session could not be read. Please start again.'); }
  if (!pending || typeof pending.state !== 'string' || typeof pending.verifier !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier) ||
      typeof pending.createdAt !== 'number' || !Number.isFinite(pending.createdAt) ||
      params.getAll('state').length !== 1 || params.get('state') !== pending.state ||
      Date.now() - pending.createdAt > maxAge || Date.now() < pending.createdAt ||
      pending.redirectUri !== url.origin + url.pathname) {
    throw new Error('This sign-in link is invalid or expired. Please start again.');
  }
  if (params.has('error')) throw new Error(params.get('error') === 'access_denied'
    ? 'GitHub authorization was cancelled. You can try again.'
    : 'GitHub could not authorize this request. Please try again.');
  const code = params.get('code');
  if (!code || params.getAll('code').length !== 1) throw new Error('GitHub did not return a valid authorization code. Please try again.');
  return { code, state: pending.state, redirectUri: pending.redirectUri, codeVerifier: pending.verifier };
}

export async function exchangeGitHubAuthorization(authorization: GitHubAuthorization, exchange: GitHubExchange): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      exchange(authorization, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Sign-in timed out. Please start again.'));
        }, 20000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
