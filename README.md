# Software Intelligence Platform (SIP)

> An end-to-end repository analytics platform for evaluating source code structure, Git development history, cross-module dependencies, architecture drift, and technical debt risk.

![Project Status](https://img.shields.io/badge/Status-Active_Development-blue.svg)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React_18-61DAFB.svg?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6.svg?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

---

## 📋 Overview

The **Software Intelligence Platform (SIP)** is a developer tool and repository observatory. It automatically mines Git history, parses multi-language source code into Abstract Syntax Trees (ASTs), constructs dependency graphs, calculates deterministic maintainability risk scores, enforces architectural boundary rules, and predicts blast-radius change impacts.

Core analytics operate deterministically without requiring an LLM, with optional Google Gemini integration for conversational explanations.

---

## ✨ Features

- **Multi-Language AST Parsing**: Language-independent structure extraction for **Python**, **TypeScript**, **JavaScript**, and **Java** via Tree-sitter.
- **Git History & Churn Mining**: Computes commit velocity, line additions/deletions, author counts, and hotspot metrics.
- **Dependency Graph Engine**: Built using NetworkX to map package and module imports, compute PageRank centrality, and identify **circular dependencies**.
- **Deterministic Risk Scoring**:
  - Cyclomatic complexity: 35%
  - Git churn: 25%
  - Contributor spread: 10%
  - Graph centrality: 10%
  - Dependency intensity: 10%
  - Cycle detection: 5%
  - Parse errors: 5%
  - *Uses log-scaling to prevent large files from masking other hotspots. Files with `risk_score >= 0.7` are classified as high-risk.*
- **Architecture Drift & Layer Enforcement**: Configurable layer rules (e.g., `api` cannot import `engine`, `core` cannot import `api`) with automated compliance percentage scoring.
- **Change Impact Prediction**: Reverse dependency traversal (`POST /analysis/{id}/impact`) to evaluate blast radius when specific files are modified.
- **Engineering Health Dashboard**: Health index on a 0–100 scale (`(1 - average_risk) * 100`), commit timelines, and risk distributions.
- **AI Codebase Assistant**: Optional Google Gemini 2.0 integration for natural language code review, technical debt summaries, and remediation strategies.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Flow, Chart.js, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2.0, Alembic |
| **Analysis** | Tree-sitter, Tree-sitter Python, GitPython, NetworkX |
| **Database** | PostgreSQL (Production) / Automatic SQLite fallback (`sip_local.db` for zero-setup local dev) |
| **AI / LLM** | Google GenAI SDK (Gemini 2.0 / Flash) with local heuristic fallback |

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** & **npm**
- **Git**

---

### 1. Clone the Repository

```bash
git clone https://github.com/OM1807/software-intelligence-platform.git
cd software-intelligence-platform
```

---

### 2. Backend Setup

1. **Activate Virtual Environment:**
   * On Windows:
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   * On macOS / Linux:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

2. **Install Dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Configure Environment:**
   Create a `.env` file in `backend/` (or copy `backend/.env.example`):
   ```env
   ENVIRONMENT=development
   AUTO_CREATE_SCHEMA=true
   DATABASE_URL=postgresql://sip_user:sip_password@localhost:5432/sip_database
   SECRET_KEY=dev-secret-key-change-in-prod
   FRONTEND_URL=http://localhost:5173
   BACKEND_URL=http://localhost:8000
   LLM_API_KEY=               # Optional: your Gemini API key
   GITHUB_CLIENT_ID=          # Optional: required only for GitHub OAuth
   GITHUB_CLIENT_SECRET=      # Optional: required only for GitHub OAuth
   ```
   > 💡 **Tip:** If PostgreSQL is not running, the backend automatically falls back to an embedded SQLite database (`sip_local.db`), so you can develop without Docker or database setup.

4. **Run Backend Tests:**
   ```bash
   # Windows PowerShell
   $env:PYTHONPATH = "backend"
   python -m pytest backend/tests

   # Linux / macOS
   PYTHONPATH=backend pytest backend/tests
   ```

5. **Start Backend Server:**
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload --port 8000
   ```
   *API will be available at `http://localhost:8000` with interactive docs at `http://localhost:8000/docs`.*

---

### 3. Frontend Setup

1. Open a new terminal window:
   ```bash
   cd frontend
   npm ci
   ```

2. **Run Tests & Typecheck:**
   ```bash
   npm test
   npm run typecheck
   ```

3. **Start Development Server:**
   ```bash
   npm run dev
   ```
   *The frontend will run at `http://localhost:5173`.*

---

## 🔐 Authentication

The platform supports two authentication methods on the login screen (`http://localhost:5173`):

1. **Personal Access Token (PAT) — Recommended for Quick Start:**
   - Go to [GitHub Token Settings](https://github.com/settings/tokens) and generate a classic token with the `repo` scope.
   - Switch to the **Personal Access Token** tab on the login screen and paste your token.
2. **GitHub OAuth:**
   - Create an OAuth App in GitHub Developer Settings.
   - Set Authorization callback URL to: `http://localhost:8000/auth/github/callback`.
   - Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `backend/.env`.

---

## 🧪 Testing Summary

The project includes unit and integration tests for both frontend and backend:

```bash
# Run all backend tests (22 test cases)
pytest backend/tests/ -v

# Run frontend test suite (14 test cases)
cd frontend && npm test
```

Tested scenarios include:
- Multi-language AST parsing (Python, TypeScript, Java)
- Network centrality and circular dependency resolution
- Owner authorization and JWT token lifecycle
- Deterministic risk scoring equations and log scaling
- Architecture drift constraint validation
- Reverse-traversal change-impact calculations

---

## 📂 Project Structure

```text
software-intelligence-platform/
├── backend/
│   ├── alembic/                # Database migrations
│   ├── app/
│   │   ├── api/endpoints/      # REST API route controllers
│   │   │   ├── analysis.py     # Metrics, graph, drift, and report endpoints
│   │   │   ├── auth.py         # JWT, PAT, and OAuth authentication
│   │   │   ├── dashboard.py    # Health overview aggregation
│   │   │   └── repositories.py # Repo lifecycle and worker triggers
│   │   ├── core/               # Configuration, DB connection, and security
│   │   ├── engine/             # Core analysis algorithms
│   │   │   ├── parser.py       # Multi-language Tree-sitter AST parser
│   │   │   ├── git_miner.py    # GitPython history and churn analyzer
│   │   │   ├── dependency_graph.py # NetworkX graph and cycle detector
│   │   │   ├── risk_calculator.py  # Deterministic weighted risk scoring
│   │   │   ├── change_impact.py    # Reverse-dependency impact solver
│   │   │   └── llm_service.py      # Google Gemini integration & local fallback
│   │   └── models/schema.py    # SQLAlchemy database models
│   ├── tests/                  # Pytest test suite
│   └── requirements.txt        # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── components/         # Layouts, navigation, and modals
│   │   ├── pages/              # Overview, Graph, Risk, Drift, Impact, AI Assistant
│   │   ├── context/            # Repo and user authentication context
│   │   └── api.ts              # Strongly-typed API client
│   └── package.json            # Frontend dependencies and test scripts
└── docker-compose.yml          # Container orchestration (Postgres, Backend, Frontend)
```

---

## 👥 Authors & Academic Context

Built as an engineering project at **Walchand College of Engineering, Sangli (Autonomous)**, Department of Computer Science & Engineering.
