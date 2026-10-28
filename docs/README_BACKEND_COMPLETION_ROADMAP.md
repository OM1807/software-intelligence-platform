# Software Intelligence Platform (SIP) — Backend Completion Roadmap

## Purpose

This plan is based on the current SIP source archive and the project synopsis. It is intended to be given to Antigravity or a VS Code coding agent **one phase at a time**. The frontend is explicitly out of scope for these phases.

The synopsis describes a FastAPI + Python backend, PostgreSQL persistence, repository parsing/mining, dependency graph generation, engineering risk analysis, change impact analysis, architecture validation, reports, and optional LLM explanations.

## What already exists in the supplied code

The current repository already contains a useful backend skeleton:

- FastAPI application, CORS configuration, health endpoint, and SQLAlchemy database setup.
- GitHub OAuth callback, GitHub PAT login, JWT authentication, and `/auth/me`.
- Repository import/list/detail/delete endpoints and a background analysis task.
- A repository analysis pipeline that clones/mines a Git repository, parses source files, builds a dependency graph, calculates graph metrics, and persists file metrics, dependency edges, and repository-level analysis data.
- A Tree-sitter Python parser, Git history mining, NetworkX dependency graph module, and optional Gemini service.
- SQLAlchemy models for users, repositories, analysis summaries, file metrics, and dependency edges.
- Analysis, risk, dependency, drift, and dashboard endpoints exist, but some responses still use mock data.

## Gaps found in the supplied archive

These are findings from the source archive, not assumptions about code that might exist in another local branch:

1. `backend/app/engine/risk_calculator.py` is empty, while the database model comments say the risk engine is still to be implemented.
2. `GET /analysis/{repo_id}` and `GET /analysis/{repo_id}/risk` return hard-coded mock file metrics.
3. `GET /analysis/{repo_id}/drift` returns one hard-coded violation instead of evaluating configurable rules against the graph.
4. `GET /dashboard/{repo_id}` returns hard-coded summary and timeline values even though persisted analysis data is available.
5. Change-impact analysis is named in the synopsis and README but no dedicated implementation or endpoint was found in the supplied backend archive.
6. Report generation is part of the synopsis workflow, but there is no report generator or report endpoint in the supplied backend archive.
7. Gemini integration can test a free-form prompt, but it is not yet connected to repository-specific analysis/report context.
8. The supplied archive has no backend test suite or Alembic migration scripts. `main.py` calls `Base.metadata.create_all`, which is acceptable for a prototype but not a robust schema migration workflow.
9. The parser currently imports the Python Tree-sitter grammar. Do not claim multi-language support unless additional language parsers are implemented and tested.
10. The user model stores a GitHub token in plaintext; the source itself marks encryption at rest as TODO. Repository clone handling, token redaction, and resource limits need a security review.

## Recommended order: 3 implementation phases

| Phase | Focus | Main result |
|---|---|---|
| 1 | Complete core analytics | Real risk scores, accurate analysis/dashboard responses, architecture rules, consistent persisted results |
| 2 | Change impact and engineering reports | Impact analysis API, report generation API, contextual optional AI explanations |
| 3 | Reliability, security, testing, and delivery | Automated tests, migrations, safer repository processing, configuration/docs, end-to-end backend acceptance |

Run the phases in order. Ask the coding agent to inspect the current code before editing and preserve working behavior. Do not ask it to rewrite the entire backend from scratch.

## General instructions for the coding agent

- Work only in the backend unless a backend integration requires a small documented contract change. Do not build or redesign the frontend.
- First inspect the existing files and current Git diff. Do not overwrite user changes.
- Reuse the current FastAPI, SQLAlchemy, Pydantic, GitPython, Tree-sitter, NetworkX, PostgreSQL, and Gemini setup where suitable.
- Do not fabricate analytics or return mock values from production API routes. If results are unavailable, return an accurate empty state or a clear HTTP error.
- Keep repository ownership checks on every repository-scoped endpoint.
- Keep expensive repository analysis isolated from request handling; do not run arbitrary repository code.
- Use small, reviewable changes. Add tests alongside each feature and run the existing test suite after each phase.
- If a design decision cannot be inferred from the project, choose a simple, explainable implementation and document the decision.
- Update README/API documentation and `.env.example` as behavior changes.
- Never log access tokens, secrets, or full credential-bearing clone URLs.
- At the end of each phase, report files changed, endpoints added/changed, tests run and results, migrations/configuration needed, and known limitations.

## Definition of backend completion

The backend is considered ready for frontend integration when all phase acceptance criteria pass, core routes return persisted repository-specific data, failures are observable, API schemas are documented, and the project can be run and tested from clean setup instructions.
