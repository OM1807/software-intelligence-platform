import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import get_user_repo
from app.core.database import get_db
from app.engine.llm_service import generate_ai_response
from app.models.schema import Analysis, DependencyEdge, FileMetric as FileMetricRow, User
from app.schemas.analysis import (
    AnalysisOut,
    DependencyGraph,
    DriftReport,
    DriftViolation,
    GraphEdge,
    GraphNode,
)
from app.schemas.metrics import FileMetric, HealthSummary

logger = logging.getLogger(__name__)

router = APIRouter()

# Request body for Gemini prompt testing
class AITestRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Enter the prompt you want to send to Gemini",
    )


# Existing mock data
MOCK_FILES = [
    FileMetric(
        path="src/core/engine.py",
        loc=820,
        complexity=34.5,
        churn=61,
        risk_score=0.91,
    ),
    FileMetric(
        path="src/api/routes.py",
        loc=410,
        complexity=18.2,
        churn=40,
        risk_score=0.72,
    ),
    FileMetric(
        path="src/utils/helpers.py",
        loc=150,
        complexity=6.1,
        churn=12,
        risk_score=0.28,
    ),
]


@router.get("/{repo_id}", response_model=AnalysisOut)
def get_analysis(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_user_repo(db, repo_id, user)

    return AnalysisOut(
        repo_id=repo_id,
        summary=HealthSummary(
            health_index=72.5,
            total_files=128,
            total_commits=950,
            high_risk_files=2,
        ),
        risky_files=MOCK_FILES,
        explanation=(
            "(mock) engine.py has high complexity and churn; "
            "consider splitting it."
        ),
    )


@router.get("/{repo_id}/risk", response_model=list[FileMetric])
def get_risk(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_user_repo(db, repo_id, user)
    return MOCK_FILES


@router.get("/{repo_id}/dependencies", response_model=DependencyGraph)
def get_dependencies(
    repo_id: int,
    include_isolated: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    files = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()

    if not include_isolated:  # hide files with no dependencies at all (less clutter in the graph view)
        connected = {e.source for e in edges} | {e.target for e in edges}
        files = [f for f in files if f.path in connected]

    return DependencyGraph(
        nodes=[
            GraphNode(
                id=f.path, label=f.path.split("/")[-1], language=f.language, loc=f.loc,
                fan_in=f.fan_in, fan_out=f.fan_out, centrality=f.centrality,
                instability=f.instability, in_cycle=f.in_cycle,
            )
            for f in files
        ],
        edges=[GraphEdge(source=e.source, target=e.target, weight=e.weight) for e in edges],
        cycles=analysis.cycles if analysis else [],
        stats=analysis.graph_stats if analysis else {},
    )


@router.get("/{repo_id}/drift", response_model=DriftReport)
def get_drift(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_user_repo(db, repo_id, user)

    return DriftReport(
        repo_id=repo_id,
        violations=[
            DriftViolation(
                source="src/utils/helpers.py",
                target="src/api/routes.py",
                rule="utils must not depend on api",
                severity="high",
            ),
        ],
    )


@router.post("/ai-test")
def test_gemini(
    request: AITestRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a custom prompt to Gemini for an authenticated user."""

    prompt = request.prompt.strip()

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="Prompt cannot be empty.",
        )

    try:
        answer = generate_ai_response(prompt)

        return {
            "provider": "gemini",
            "prompt": prompt,
            "response": answer,
        }

    except Exception:
        logger.exception("Gemini integration test failed.")

        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini request failed. Check backend logs and "
                "verify API key, model availability, and configuration."
            ),
        )