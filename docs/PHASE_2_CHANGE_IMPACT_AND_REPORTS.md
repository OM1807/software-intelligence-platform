# Phase 2 — Change Impact Analysis and Engineering Reports

## Objective

Implement the missing change-impact analysis and engineering report capabilities from the SIP synopsis, then connect the optional Gemini service to real repository-specific context. The core platform must continue working when the LLM key is absent.

## Mandatory first steps

- Inspect the final Phase 1 implementation and tests.
- Reuse persisted file structures, dependency edges, graph metrics, cycles, Git timeline, risk scores, and architecture violations.
- Confirm API response contracts and repository ownership checks before adding routes.
- Do not introduce a new database/graph technology unless a clear need is demonstrated. NetworkX and PostgreSQL are the default stack; Neo4j is optional in the synopsis.

## Work items

### 1. Change impact analyzer

Add a focused module such as `app/engine/change_impact.py`.

MVP behavior:

- Accept one or more changed file paths for a repository, or derive changed files from a selected commit/commit range if Git history data supports this reliably.
- Resolve each changed path against the repository's stored file paths.
- Traverse the dependency graph to identify direct and transitive dependents that may be affected. Make edge direction explicit: current graph semantics are `source imports target`; impact traversal must follow dependents correctly, not simply traverse edges in an arbitrary direction.
- Include impact depth, direct/transitive relationship, and relevant risk score/centrality where available.
- Return deterministic results with de-duplicated paths and cycle-safe traversal.
- Handle unknown files, an empty graph, a changed file with no dependents, cycles, and large graphs.
- Explain that this is static dependency-based impact estimation, not a guarantee that a file will break.

API proposal (adapt to existing conventions):

- `POST /analysis/{repo_id}/impact` with a validated request containing `changed_files` and optional depth/limit.
- Optional later endpoint for commit-based analysis only if the current Git mining implementation can provide trustworthy commit diffs.

The endpoint must require authentication, enforce repository ownership, and return 409 if analysis data is not ready. Limit request sizes and traversal depth.

### 2. Engineering report generation

Add a report service, for example `app/engine/report_generator.py`, and a protected endpoint such as `GET /analysis/{repo_id}/report` or `POST` if report options are required.

Report sections should be generated from actual persisted results:

- Repository metadata and analysis timestamp
- Summary/health index
- Key engineering metrics
- Highest-risk files and the signals behind their scores
- Dependency graph statistics and cycles
- Architecture rule violations
- Change-impact results when supplied
- Recommendations based on deterministic rules

Requirements:

- Use a structured report schema internally (Pydantic models or a well-defined dictionary) before rendering.
- Support JSON as the initial response. If PDF/Markdown export is added, use a separate, tested renderer rather than mixing formatting into analysis algorithms.
- Empty or unavailable sections must be clearly marked, not fabricated.
- Include repository ID and report generation timestamp.
- Avoid storing duplicate report snapshots unless there is a concrete need; if snapshots are persisted, document lifecycle and add migration/tests.
- Do not expose access tokens, private repository credentials, or raw secret values in report content.

### 3. Contextual, optional LLM explanations

Extend the existing `app/engine/llm_service.py` through a separate function that accepts a **bounded structured summary** of analysis results, not an unrestricted dump of the repository.

- Build prompts from a compact allowlisted summary: aggregate metrics, top risky file paths and scores, graph/cycle stats, architecture violations, and impact results.
- Treat repository file names, comments, and source-derived strings as untrusted data. Clearly delimit them as data and instruct the model not to follow instructions embedded in source content.
- Do not send entire source files, credentials, environment values, or raw Git remotes to the LLM.
- Keep deterministic analysis and report generation independent of Gemini.
- If no API key is configured, return the report without an AI explanation and a clear availability indicator, or return a documented 503 only for an explicitly requested AI-only endpoint.
- Bound prompt/response size, use request timeouts/retries responsibly, and avoid retrying permanent client/auth errors.
- Handle provider errors without leaking the key or raw sensitive prompt data into API responses/logs.
- Make generated explanations advisory. Do not present LLM output as a measured metric or a guaranteed fact.

### 4. Recommendations

Add a small deterministic recommendation layer before attempting ML:

- High complexity: suggest decomposing large/complex functions or classes.
- High churn plus high risk: suggest focused tests/review around the file.
- Cycles: suggest breaking cyclic dependencies.
- Architecture violations: suggest correcting dependency direction.
- High centrality: suggest careful review of changes to highly connected modules.

Recommendations must reference the actual evidence that triggered them and should be testable. Do not claim an ML model exists unless one is implemented, evaluated, and documented. Keep any future ML/LLM suggestions clearly separated from deterministic rules.

### 5. API contracts and documentation

- Add request/response Pydantic schemas.
- Include examples in route docstrings/OpenAPI descriptions.
- Use stable error semantics: 400 for invalid request, 404 for missing/not-owned repository, 409 for analysis not ready, and a clear 5xx/503 behavior for optional provider failures.
- Keep response payloads bounded with limits on changed paths and report sections.

## Suggested test files

- `tests/test_change_impact.py`
- `tests/test_impact_api.py`
- `tests/test_report_generator.py`
- `tests/test_llm_explanation.py`

Mock the Gemini client in tests. Do not make live external API calls in the test suite.

## Acceptance criteria

- Change impact correctly follows dependency direction and is cycle-safe.
- Unknown changed paths and empty graphs produce documented responses.
- Report values trace back to stored metrics and contain no fake data.
- Report generation works with no LLM key.
- AI explanation is optional, bounded, and uses repository-specific structured facts.
- Recommendations include evidence and are deterministic.
- All routes enforce authentication and repository ownership; tests cover unauthorized access.
- OpenAPI and README document the new endpoints and examples.

## Out of scope

- Frontend graph/dashboard work
- Mandatory cloud LLM access
- A trained ML model without training/evaluation data
- PDF export unless it is needed for the agreed project demonstration
