# Software Intelligence Platform (SIP)

A software engineering analytics platform for analyzing repository structure, development history, dependencies, and engineering risks.

## Features

- Source-code structure analysis
- Git history and code churn analysis
- Dependency graph generation
- Engineering metrics and risk scoring
- Change-impact analysis
- Architecture rule checks
- Repository health dashboard
- Optional LLM explanations for analysis results

Core analysis is designed to work without an LLM.

## Backend Phase 1 analytics

The backend now computes deterministic per-file risk scores from repository data that is actually stored in the database. The score is bounded to [0.0, 1.0] and is derived from weighted normalized signals:

- complexity: 35%
- churn: 25%
- contributor spread: 10%
- centrality: 10%
- dependency intensity: 10%
- cycle flag: 5%
- parse errors: 5%

The normalized values use log scaling so a very large repository or a large file does not make all other files appear risk-free. A file is counted as high risk when `risk_score >= 0.7`.

The health index is derived from the average file risk and reported as a 0–100 value where higher is healthier: `health_index = (1 - average risk) * 100`.

The repository analysis, risk, dashboard, and drift endpoints are owner-protected and use persisted repository metrics instead of mock data. Repositories that are still processing or failed return HTTP `409` with a clear status message instead of pretending to have analysis results.

## Backend verification

Run the backend tests from the `backend/` directory:

```bash
python -m pytest -q
```

## Phase 2 change-impact and reporting

The backend now includes:

- `POST /analysis/{repo_id}/impact` for dependency-based impact analysis using reverse traversal on the persisted graph.
- `GET /analysis/{repo_id}/report` for a deterministic engineering report assembled from persisted metrics, graph stats, cycles, and architecture violations.
- `POST /analysis/{repo_id}/ai-explain` for an advisory optional AI explanation generated from a bounded structured summary only when an LLM key is configured.

Example payload for impact analysis:

```json
{
  "changed_files": ["src/core/service.py"],
  "depth": 2,
  "limit": 25
}
```

The report schema includes repository metadata, summary health metrics, top-risk files, cycle and dependency stats, architecture violations, impact results, and deterministic recommendations. If no LLM key is configured, the report still functions and the AI section is omitted gracefully.

## Tech Stack

- **Frontend:** React, TypeScript
- **Backend:** Python, FastAPI
- **Analysis:** Python AST, GitPython, NetworkX
- **Database:** PostgreSQL
- **Visualization:** Chart.js / React Flow

## Getting Started

Setup instructions will be added as the application structure and development scripts are finalized.

## Project Status

This project is under development. Features and setup instructions may change.

## Team

Built as an academic software engineering project.
