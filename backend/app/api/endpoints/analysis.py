from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import get_user_repo
from app.core.database import get_db
from app.models.schema import User
from app.schemas.analysis import (AnalysisOut, DependencyGraph, DriftReport,
                                  DriftViolation, GraphEdge, GraphNode)
from app.schemas.metrics import FileMetric, HealthSummary

router = APIRouter()

# ---- MOCK DATA: replace with real engine output in Phase 2-4 ----
MOCK_FILES = [
    FileMetric(path="src/core/engine.py", loc=820, complexity=34.5, churn=61, risk_score=0.91),
    FileMetric(path="src/api/routes.py", loc=410, complexity=18.2, churn=40, risk_score=0.72),
    FileMetric(path="src/utils/helpers.py", loc=150, complexity=6.1, churn=12, risk_score=0.28),
]


@router.get("/{repo_id}", response_model=AnalysisOut)
def get_analysis(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    return AnalysisOut(
        repo_id=repo_id,
        summary=HealthSummary(health_index=72.5, total_files=128, total_commits=950, high_risk_files=2),
        risky_files=MOCK_FILES,
        explanation="(mock) engine.py has high complexity and churn; consider splitting it.",
    )


@router.get("/{repo_id}/risk", response_model=list[FileMetric])
def get_risk(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    return MOCK_FILES


@router.get("/{repo_id}/dependencies", response_model=DependencyGraph)
def get_dependencies(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    nodes = [GraphNode(id=f.path, label=f.path.split("/")[-1]) for f in MOCK_FILES]
    edges = [
        GraphEdge(source="src/api/routes.py", target="src/core/engine.py"),
        GraphEdge(source="src/core/engine.py", target="src/utils/helpers.py"),
    ]
    return DependencyGraph(nodes=nodes, edges=edges)


@router.get("/{repo_id}/drift", response_model=DriftReport)
def get_drift(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    return DriftReport(repo_id=repo_id, violations=[
        DriftViolation(source="src/utils/helpers.py", target="src/api/routes.py",
                       rule="utils must not depend on api", severity="high"),
    ])