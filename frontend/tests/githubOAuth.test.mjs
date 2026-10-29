import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureGitHubCallback, createGitHubAuthorizationUrl, exchangeGitHubAuthorization, validateConfig } from '../src/auth/githubOAuth.ts';

const origin = 'http://localhost:5173';
const redirectUri = `${origin}/auth/github/callback`;
const config = { clientId: 'test-public-client-id', redirectUri };
const storageKey = 'sip.github.authorization';
let data;
beforeEach(() => {
  data = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  globalThis.window = {
    location: { origin, href: redirectUri },
    history: { state: { keep: true }, replaceState(state, _, path) {
      assert.deepEqual(state, { keep: true });
      window.location.href = new URL(path, origin).href;
    } },
  };
});
async function callback(query = {}) {
  const url = new URL(await createGitHubAuthorizationUrl(config));
  window.location.href = `${redirectUri}?${new URLSearchParams({ code: 'test-code', state: url.searchParams.get('state'), ...query })}`;
  return JSON.parse(data.get(storageKey));
}

test('authorization uses GitHub, fresh random state and S256 PKCE without a secret', async () => {
  const first = new URL(await createGitHubAuthorizationUrl(config));
  const pending = JSON.parse(data.get(storageKey));
  assert.equal(first.origin + first.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(first.searchParams.get('client_id'), config.clientId);
  assert.equal(first.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(first.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(first.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.equal(first.searchParams.has('client_secret'), false);
  assert.equal(first.searchParams.has('scope'), false);
  const second = new URL(await createGitHubAuthorizationUrl({ ...config, scope: 'read:user' }));
  assert.notEqual(first.searchParams.get('state'), second.searchParams.get('state'));
  assert.equal(second.searchParams.get('scope'), 'read:user');
});
test('captures a valid callback once, scrubs sensitive URL fields, preserves unrelated query', async () => {
  const pending = await callback({ keep: 'yes' });
  const result = captureGitHubCallback();
  assert.deepEqual(result, { code: 'test-code', state: pending.state, codeVerifier: pending.verifier, redirectUri });
  assert.equal(data.has(storageKey), false);
  assert.equal(window.location.href, `${redirectUri}?keep=yes`);
  assert.equal(captureGitHubCallback(), null);
});
test('rejects mismatched state and consumes the transaction', async () => {
  await callback({ state: 'attacker' });
  assert.throws(captureGitHubCallback, /invalid or expired/);
  assert.equal(data.size, 0);
  assert.equal(window.location.href, redirectUri);
});
test('rejects missing session and replayed authorization codes', async () => {
  await callback();
  const previous = window.location.href;
  captureGitHubCallback();
  window.location.href = previous;
  assert.throws(captureGitHubCallback, /invalid or expired/);
});
test('rejects expired and future-dated transactions', async () => {
  for (const createdAt of [Date.now() - 600001, Date.now() + 600000]) {
    const pending = await callback();
    data.set(storageKey, JSON.stringify({ ...pending, createdAt }));
    assert.throws(captureGitHubCallback, /invalid or expired/);
  }
});
test('rejects corrupted stored data without exposing it', async () => {
  await callback();
  data.set(storageKey, '{invalid');
  assert.throws(captureGitHubCallback, /could not be read/);
  assert.equal(data.size, 0);
});
test('handles provider cancellation without rendering untrusted error text', async () => {
  await callback({ error: 'access_denied', error_description: '<script>secret</script>' });
  assert.throws(captureGitHubCallback, /authorization was cancelled/);
  assert.equal(window.location.href, redirectUri);
});
test('rejects missing code and duplicate code or state parameters', async () => {
  await callback({ code: '' });
  assert.throws(captureGitHubCallback, /valid authorization code/);
  await callback();
  window.location.href += '&code=second';
  assert.throws(captureGitHubCallback, /valid authorization code/);
  await callback();
  window.location.href += '&state=second';
  assert.throws(captureGitHubCallback, /invalid or expired/);
});
test('rejects a callback on a different path', async () => {
  await callback();
  window.location.href = window.location.href.replace('/auth/github/callback', '/');
  assert.throws(captureGitHubCallback, /invalid or expired/);
});
test('requires a client ID and a supported same-origin redirect', () => {
  assert.throws(() => validateConfig({ ...config, clientId: '' }), /not configured/);
  for (const uri of ['https://evil.example/', `${origin}/repositories`, `${redirectUri}?x=1`, `${redirectUri}#hash`, 'not a url']) {
    assert.throws(() => validateConfig({ ...config, redirectUri: uri }));
  }
  assert.equal(validateConfig(config).href, redirectUri);
});
test('reports blocked session storage before redirecting', async () => {
  sessionStorage.setItem = () => { throw new Error('blocked'); };
  await assert.rejects(createGitHubAuthorizationUrl(config), /Allow session storage/);
});
test('passes code, redirect and PKCE verifier to the configured adapter exactly once', async () => {
  await callback();
  const authorization = captureGitHubCallback();
  let calls = 0;
  await exchangeGitHubAuthorization(authorization, async (value, signal) => {
    calls++;
    assert.deepEqual(value, authorization);
    assert.equal(signal.aborted, false);
  });
  assert.equal(calls, 1);
});
test('propagates backend exchange failure instead of treating it as sign-in', async () => {
  await callback();
  await assert.rejects(exchangeGitHubAuthorization(captureGitHubCallback(), async () => { throw new Error('backend failure'); }), /backend failure/);
});
test('times out an unresponsive exchange and aborts the request', async (context) => {
  await callback();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal;
  const operation = exchangeGitHubAuthorization(captureGitHubCallback(), (_, signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  });
  const rejection = assert.rejects(operation, /timed out/);
  context.mock.timers.tick(20000);
  await rejection;
  assert.equal(requestSignal.aborted, true);
});
