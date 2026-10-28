# Phase 3 — Backend Hardening, Testing, Security, and Delivery

## Objective

Make the backend repeatable to set up, safe enough for an academic demonstration, observable when work fails, and ready for frontend integration. This phase should harden the features delivered in Phases 1 and 2 rather than add unrelated scope.

## Mandatory first steps

- Inspect all changes from Phases 1 and 2.
- Run the full backend test suite and record current failures before changing code.
- Review environment variables, Docker Compose, database lifecycle, repository cloning, auth, and exception handling.
- Preserve the documented API contracts unless a tested, documented correction is required.

## Work items

### 1. Automated test coverage

Set up pytest and appropriate test dependencies.

Cover at least:

- Health endpoint and OpenAPI availability
- JWT creation/expiration/invalid token and protected route behavior
- GitHub OAuth state validation and PAT login with mocked HTTP calls
- Repository URL validation, duplicate import behavior, ownership isolation, list/detail/delete
- Analysis pipeline success/failure with mocked clone/mining/parser where appropriate
- Risk scoring, graph metrics, architecture rules, impact analysis, dashboard aggregates, and reports
- Missing/processing/failed repository behavior
- LLM disabled, successful mocked response, provider failure, and retry behavior
- Secret/token redaction in error messages/loggable output

Tests must not require real GitHub credentials, a live Gemini key, network access, or a public internet connection. Use a dedicated test database or isolated SQLite configuration where compatible with the schema; if PostgreSQL-specific behavior is used, document and test it with PostgreSQL in CI/Docker.

### 2. Database migrations

- Add/configure Alembic migrations based on the existing SQLAlchemy metadata.
- Generate an initial migration that matches the actual schema, or a safe upgrade migration if a deployed database already exists. Do not blindly drop data.
- Document `alembic upgrade head` and local development workflow.
- Keep startup from automatically creating a divergent schema in production. Development-only `create_all` may remain behind an explicit setting if useful.
- Test migration upgrade on a fresh database and document backup/upgrade expectations.

### 3. Authentication and secret handling

Review and implement proportionate safeguards:

- Replace the default `SECRET_KEY` with startup validation in non-development environments.
- Ensure the OAuth state token has a purpose, expiry, and robust validation; use a nonce/state strategy that cannot be reused if feasible.
- Handle non-2xx and malformed GitHub OAuth/token/user responses with safe errors and timeouts.
- Never return GitHub tokens to clients, logs, or exception payloads.
- Encrypt GitHub tokens at rest using a maintained approach if practical for this project, with a required encryption key configured via environment. If encryption is deferred, document this explicitly as a demo-only limitation and avoid claiming production readiness.
- Review JWT expiry and algorithm configuration; never accept algorithms chosen by the incoming token.
- Validate repository URLs strictly. Only allow expected GitHub HTTPS/SSH URL forms; reject unexpected hosts, local paths, URL credentials, and malformed owner/repository names.
- Avoid shell interpolation when cloning. Apply clone timeout, repository/file/commit limits where practical, and clean temporary directories in all paths.
- Ensure tokens are not persisted in clone URLs or included in errors. Continue redacting secrets from analysis failures.
- Configure CORS from environment and avoid permissive production defaults.

### 4. Background analysis reliability

The current project uses FastAPI `BackgroundTasks`; this is acceptable for a small single-process demo but has limitations if the server restarts or several workers are used.

- Keep analysis work out of the request transaction/session; ensure background tasks own and close their DB sessions.
- Ensure state transitions are valid: `pending -> processing -> completed|failed`.
- Persist useful, sanitized failure status and timestamps.
- Make retry/re-analysis behavior explicit and avoid duplicate simultaneous work for the same repository.
- Confirm cleanup executes on success and failure.
- Document that the in-process background task is not a durable distributed queue. Do not add Celery/Redis unless the project actually needs them.
- Add a repository status endpoint only if the existing detail endpoint does not adequately support polling.

### 5. Data correctness and database constraints

- Review uniqueness and indexing for repository identity per user, file path per repository, and dependency edge identity per repository.
- Add constraints only with a migration and a safe strategy for existing duplicate rows.
- Make result replacement atomic: an analysis run should not leave half-updated metrics if persistence fails.
- Decide and document whether old analysis results remain visible while a re-analysis is running or are replaced only after a successful new run.
- Ensure cascade deletion works for all repository result tables on the supported database configuration.
- Review pagination and response limits for repository/file/report APIs.

### 6. Operational readiness

- Add `.env.example` with variable descriptions and safe placeholders. Never include real secrets.
- Update README with:
  - Supported Python version and setup steps
  - Docker Compose startup and shutdown commands
  - Required vs optional environment variables
  - Database migration commands
  - Test/lint commands
  - Endpoint list and representative API flow
  - Analysis lifecycle/status meanings
  - Risk formula and health-index explanation
  - Known limitations (Python-only parser if still true, in-process background tasks, optional Gemini, no ML unless implemented)
- Add structured, useful logging for run IDs/repository IDs and stage durations without logging tokens or private source content.
- Add consistent error response conventions. Do not expose stack traces or raw internal errors to clients.
- Add lint/type-check tooling only if practical; fix issues introduced by this project rather than doing a large unrelated style rewrite.
- Verify Docker Compose startup ordering and environment configuration. A simple `depends_on` does not always mean PostgreSQL is ready; retain or improve the existing retry/health-check behavior.

### 7. Final backend acceptance run

On a clean environment:

1. Configure `.env` from `.env.example`.
2. Start PostgreSQL and the backend using documented commands.
3. Apply migrations.
4. Verify `/health` and `/docs`.
5. Authenticate using mocked tests and, for manual smoke testing, configured GitHub OAuth/PAT.
6. Import a small test repository and verify status transitions.
7. Confirm stored file metrics, risk results, dependency graph, cycles, architecture checks, dashboard values, change impact, and report output.
8. Confirm a repository owned by another user returns 404.
9. Confirm an invalid/unavailable LLM does not prevent core analysis/report generation.
10. Run the full automated test suite and record results.

## Suggested final deliverables

- Working backend implementation
- Alembic migration history
- Automated tests
- `.env.example`
- Updated README/API documentation
- A short `BACKEND_STATUS.md` listing completed functionality, commands verified, test results, and known limitations

## Acceptance criteria

- A new developer can follow the README to set up and run the backend.
- Database schema changes are managed through migrations.
- Tests run repeatably without external credentials.
- No endpoint returns mock analytics.
- Auth, ownership isolation, token handling, and URL validation have explicit tests.
- Failures are visible and sanitized; analysis jobs clean up after themselves.
- API contracts and limitations are documented honestly.
- Frontend is not implemented as part of this phase.
