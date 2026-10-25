# Software Intelligence Platform — frontend handoff

## What is implemented

- A responsive split-panel login, accessible form labels, password visibility control, progress and error messages, and an explicit demo entry point.
- Icon navigation, a workspace header, dashboard metric cards and working exploration links, repository search, empty results, and health badges. The existing repository selection, mock analysis, charts, graph, and architecture views remain available.
- `Login.tsx` starts GitHub authorization and captures the returned authorization code on `/auth/github/callback` (also supported on `/`). State is random, checked against a single-use sessionStorage transaction, and expires after ten minutes. S256 PKCE binds the exchange to that transaction.
- Callback parameters are removed from the address bar before asynchronous work. Codes are never logged, displayed, or stored persistently. Provider errors are mapped to fixed messages.
- A typed backend adapter, disabled until the backend contract exists. An absent adapter reports authorization received; it does **not** claim the user is signed in or redirect to the workspace automatically.

This version is based on the latest `frontend.zip` supplied on 25 October 2026. Its React entry points and all six page files were empty. The earlier working prototype has been adapted to the latest page names (`Dashboard`, `DependencyView`, and `RepoConnect`) while retaining the latest Dockerfile, dependency ranges, Tailwind/PostCSS settings, and Vite server settings. Lucide icons are the only added application dependency. A package lock is included for reproducible installation.

The earlier screenshot showed an empty backend `auth.py`; a Python requirements list does not define any API contract. No backend URL, request body, token format, user schema, or session mechanism has been assumed. No remote, branch, or commit has been created or modified.

## Run locally

Use Node.js 20.11+ or a newer supported version. The existing Dockerfile is retained with Node 20. The test runner uses the project's TypeScript compiler to make the tests compatible with that runtime; it does not depend on Node's built-in TypeScript stripping.

```sh
npm ci
cp .env.example .env.local
npm run dev -- --host localhost --port 5173 --strictPort
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if preferred. On Windows where PowerShell blocks npm scripts, use `npm.cmd`.

In the GitHub OAuth app settings, register `http://localhost:5173/auth/github/callback` as the authorization callback URL. Set `VITE_GITHUB_CLIENT_ID` to that app's **public client ID**. Keep `VITE_GITHUB_REDIRECT_URI` identical to the registered URL and your browser's origin; `localhost` and `127.0.0.1` are different origins. Restart Vite after changing environment variables. The redirect defaults to the current origin plus `/auth/github/callback` if omitted. The app currently assumes hosting at the origin root.

`VITE_GITHUB_SCOPE` is optional and blank by default. Agree the minimum permissions with the backend teammate. GitHub may reuse previously granted scopes for an existing authorization, so an empty scope value is not a guarantee of restricted access.

Never add a GitHub client secret, access token, or refresh token to frontend source or any `VITE_*` variable. Vite exposes those variables to browsers. Use HTTPS in deployment; localhost HTTP is supported for development.

## Backend teammate: wire the exchange

The integration point is `src/auth/githubIntegration.ts`. Replace `exchangeGitHubCode = null` with an implementation of the exported `GitHubExchange` type from `src/auth/githubOAuth.ts`. It receives:

| Internal argument | Meaning |
| --- | --- |
| `authorization.code` | GitHub's temporary authorization code |
| `authorization.state` | State already validated against this tab's transaction |
| `authorization.redirectUri` | The exact URI used to start authorization |
| `authorization.codeVerifier` | The original PKCE verifier needed for the server exchange |
| `signal` | AbortSignal for the 20-second exchange timeout |

These names are **not an HTTP payload specification**. The adapter maps them to the actual FastAPI contract. Agree the endpoint URL, method, input model, response model, failure semantics, and session persistence before implementing it. If the backend needs a server-issued transaction before redirecting, add that handshake to the authorization-start flow too.

The adapter must:

1. Send the necessary values to the agreed backend endpoint over HTTPS (localhost HTTP for development only), passing the AbortSignal. Configure the actual backend URL in this adapter or a public environment variable once it exists. Do not call GitHub's token endpoint from the browser.
2. Match the backend's credentials, CSRF, and CORS requirements. For cookie sessions across origins, configure exact allowed frontend origins and credentialed requests; do not combine credentialed access with wildcard CORS.
3. Reject failed HTTP responses, invalid application responses, and unsuccessful session creation. A resolved fetch or a returned authorization code alone is not successful login. Validate the backend response according to its agreed schema and confirm that an app session exists.
4. Resolve `Promise<void>` only after session establishment is verified. `Login.tsx` then navigates to `/repositories`. Reject on failure; the UI shows a generic error without displaying backend secrets. The UI does not retry a consumed code; the user restarts authorization.

The backend must hold the client secret server-side, exchange the code with GitHub using the same redirect URI and PKCE verifier, validate the resulting GitHub identity, and establish its own authenticated application session. Prefer a secure HttpOnly cookie rather than returning GitHub tokens to browser storage. Enforce CSRF/origin checks and authorization on protected APIs. A frontend state check alone is not a complete backend authentication system.

Reference: [GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow).

## Deployment and prototype boundaries

- Configure the web server to serve `index.html` for `/auth/github/callback` and other client routes. Otherwise a direct OAuth return may 404.
- Serve callback pages with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; a no-referrer meta policy is already included. Redact callback query strings from hosting/proxy/analytics logs. Browser-side URL cleanup cannot remove initial server access logs.
- The demo email/password flow remains available and does not authenticate. Dashboard routes remain public prototype routes, and repository/analysis data remain mocked. The placeholder identity was replaced with a prototype label to avoid implying a verified GitHub user.
- Before production, disable or separate demo access, add session-aware route handling, authenticated API authorization, session restoration, and logout according to the backend contract. “Back to sign in” is navigation, not logout.
- The existing personal access token input is retained for compatibility but clearly marked as unused in the demo. It is not sent to a service.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

See `VALIDATION.md` for results and remaining limitations. The latest ZIP did not include a lint script or ESLint configuration, so no lint command is advertised. The existing `build` script runs both TypeScript and Vite.

Manual smoke checks once dependencies are installed:

1. Check login at mobile and desktop widths; tab through fields, buttons, and links. Toggle password visibility. With no public client ID, GitHub login should show a configuration message.
2. Use sample email/password values to enter the demo. Search recent repositories, verify empty results, clear search, select a repo, and visit every analysis view. Start a new mock analysis and confirm only one repository is added.
3. With a configured OAuth app, approve or deny GitHub authorization. On approval with no exchange adapter, expect the backend-not-connected message and a cleaned URL. Denial, invalid state, expired state, replay, and missing code must not sign the user in.
4. With the real adapter, verify success, backend rejection, offline/network failure, timeout, browser refresh, and duplicate callback handling. React StrictMode must not initiate a second exchange. Test the deployed callback URL directly for SPA fallback support.

## Apply to the repository

Extract `frontend-updated.zip`. Copy the contents of its `frontend` folder into your repository's existing `frontend` folder while on your feature branch. Do not create a nested `frontend/frontend` folder. This package is based on your latest uploaded ZIP and does not include Git metadata or backend files. If you pull further teammate changes after this handoff, compare those changes before copying.
