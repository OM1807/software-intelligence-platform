# Phase 1 — Complete Core Repository Analytics

## Objective

Replace placeholder analytics with real values derived from the existing persisted repository analysis. Finish the risk engine, dashboard aggregates, and architecture drift checks. Keep the existing FastAPI route structure and database models where practical.

## Mandatory first steps

1. Inspect the current Git diff and all backend files before modifying them.
2. Read `app/engine/pipeline.py`, `parser.py`, `git_miner.py`, `dependency_graph.py`, the SQLAlchemy models, schemas, and current API routes.
3. Trace the data path from repository import through analysis persistence and confirm actual field names/types.
4. Write a short implementation checklist before coding. Do not rebuild already-working parsing/mining/graph features.

## Work items

### 1. Implement `app/engine/risk_calculator.py`

Implement deterministic, explainable per-file engineering risk scoring using data that is actually available in `FileMetric` and graph metrics. Candidate signals include:

- Cyclomatic complexity (`avg_complexity`, `max_complexity`)
- Change frequency/churn (`commits`, `lines_added`, `lines_deleted`)
- Number of contributors (`authors`)
- Dependency centrality (`centrality`, `fan_in`, `fan_out`)
- Cyclic dependency flag (`in_cycle`)
- Parse errors (`parse_errors`), if useful as a separate warning signal

Requirements:

- Normalize inputs so a large repository or an unusually large file does not make all other files appear risk-free.
- Use a documented weighted formula with bounded output in `[0.0, 1.0]`.
- Handle empty repositories, missing values, zero denominators, and outliers without exceptions.
- Provide a function with a clear interface, for example `calculate_file_risk(...)` plus a batch helper. Adapt to the existing architecture rather than forcing this exact signature.
- Keep raw metrics separate from the score. Do not silently treat missing metrics as proof of low risk.
- Return a short list of reason codes or explanatory signals per file if this can be added without breaking current API consumers.
- Add unit tests for normal inputs, boundary values, empty data, and relative ordering (a high-complexity/high-churn file should generally score above a low-complexity/low-churn file).

### 2. Replace mock responses in `app/api/endpoints/analysis.py`

- Replace `MOCK_FILES` usage in `GET /analysis/{repo_id}` and `GET /analysis/{repo_id}/risk` with database-backed metrics.
- Preserve `get_user_repo(...)` ownership enforcement.
- If repository status is not `completed`, return HTTP 409 with a clear status message instead of misleading data.
- Map database fields to the existing response schema correctly. The public schema currently uses `complexity` and `churn`, while the ORM uses `avg_complexity`, `commits`, `lines_added`, and `lines_deleted`. Define and document a consistent mapping; do not rename public fields casually.
- Sort risky files by risk score descending and support bounded pagination/limit if appropriate, with validation.
- Ensure the summary counts, file counts, and high-risk threshold are computed from stored data and clearly document the threshold.
- If a prior analysis row or metrics are absent, return a clear empty/409 response rather than invented totals.
- Keep `/analysis/ai-test` separate; it is only an integration test and must not be used as the report/analysis implementation.

### 3. Replace mock dashboard values in `app/api/endpoints/dashboard.py`

Build `GET /dashboard/{repo_id}` from `Analysis`, `FileMetric`, and persisted Git timeline data:

- Total files and commits from the persisted analysis and/or metric rows, using one consistent source of truth.
- High-risk file count based on the Phase 1 documented threshold.
- Health index derived from risk/quality metrics using a documented formula and bounded range (for example 0–100). Make clear that higher means healthier.
- Timeline points from the actual mined timeline. If historical health values were not stored, either calculate a defensible value from available historical data or return a documented `health_index` policy (e.g., current health only where it is meaningful); do not invent a time series.
- Keep the current response contract where practical. If the schema must change, document the compatibility impact and add schema tests.

### 4. Implement actual architecture drift detection

Replace the hard-coded violation in `GET /analysis/{repo_id}/drift` with a rule evaluator that checks the persisted dependency graph.

- Create a small, documented architecture-rule model/schema. Support a clear MVP rule set, such as forbidden dependency direction between named layers or path patterns.
- Provide sensible default rules only if they can be evaluated against real paths/edges; document them.
- If configurable rules are added, validate them and scope them to the repository/user. Do not silently accept malformed rules.
- Each violation should identify source, target, rule, and severity. Include a stable rule identifier if it fits the response schema.
- Avoid reporting a violation when the relevant source/target cannot be resolved.
- Add tests for compliant edges, violating edges, empty graphs, and unknown paths.

### 5. Consistency and persistence

- Apply risk scores during the analysis pipeline before commit, or implement a safe, explicit recalculation path. Prefer calculating all analytics in the pipeline so stored results are consistent.
- Ensure a failed analysis does not leave a mixture of stale and new results. Review transaction boundaries and rollback behavior.
- If new database columns/tables are needed, add an Alembic migration in Phase 3 or add it now if the feature cannot be implemented safely without it; document the choice.
- Add indexes/constraints only when justified by actual query patterns.

## Suggested test files

Adapt names to the repository's test layout:

- `tests/test_risk_calculator.py`
- `tests/test_analysis_api.py`
- `tests/test_dashboard_api.py`
- `tests/test_architecture_rules.py`

Use a test database and dependency overrides; tests must not need a real GitHub account, live repository clone, or Gemini API key.

## Acceptance criteria

- No mock file metrics, mock dashboard totals/timeline, or hard-coded drift violations remain in active API paths.
- Analysis, risk, dashboard, and drift endpoints are repository-owner protected and use persisted data.
- Risk scoring is bounded, deterministic, documented, and unit-tested.
- A repository still processing/failed cannot accidentally return successful-looking analysis.
- Dashboard summary values reconcile with persisted records.
- All tests pass; `GET /health` and FastAPI OpenAPI generation still work.
- README contains the risk formula, health-index interpretation, route behavior, and test command.

## Out of scope for this phase

- Frontend/dashboard implementation
- Machine-learning-based risk prediction
- Mandatory LLM usage
- Multi-language parser expansion unless the current code has an easy, already-supported path
