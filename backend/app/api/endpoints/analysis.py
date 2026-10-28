import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import get_user_repo
from app.core.config import settings
from app.core.database import get_db
from app.engine.change_impact import analyze_change_impact
from app.engine.llm_service import generate_ai_response, generate_structured_repo_explanation
from app.engine.report_generator import build_report
from app.engine.risk_calculator import HIGH_RISK_THRESHOLD, compute_health_index, recalculate_file_risk_scores
from app.models.schema import Analysis, DependencyEdge, FileMetric as FileMetricRow, User
from app.schemas.analysis import (
    AnalysisOut,
    DependencyGraph,
    DriftReport,
    DriftViolation,
    EngineeringReport,
    GraphEdge,
    GraphNode,
    ImpactItem,
    ImpactReport,
    ImpactRequest,
)
from app.schemas.metrics import FileMetric as PublicFileMetric, HealthSummary

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


def _serialize_file_metric(row: FileMetricRow) -> PublicFileMetric:
    risk_score = row.risk_score if row.risk_score is not None else 0.0
    return PublicFileMetric(
        path=row.path,
        loc=row.loc,
        complexity=float(row.avg_complexity or 0.0),
        churn=int((row.commits or 0) + (row.lines_added or 0) + (row.lines_deleted or 0)),
        risk_score=float(risk_score),
    )


def _build_risk_list(repo_id: int, db: Session, limit: int = 10, skip: int = 0) -> list[PublicFileMetric]:
    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    if not rows:
        return []

    rows = recalculate_file_risk_scores(rows)
    rows = sorted(rows, key=lambda row: (row.risk_score or 0.0, row.path), reverse=True)
    rows = rows[skip: skip + limit]
    return [_serialize_file_metric(row) for row in rows]


def _build_analysis_summary(repo_id: int, db: Session, rows: list[FileMetricRow]) -> HealthSummary:
    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()
    total_files = analysis.total_files if analysis and analysis.total_files else len(rows)
    total_commits = analysis.total_commits if analysis else sum(row.commits for row in rows)
    risk_rows = recalculate_file_risk_scores(rows)
    high_risk = sum(1 for row in risk_rows if (row.risk_score or 0.0) >= HIGH_RISK_THRESHOLD)
    return HealthSummary(
        health_index=compute_health_index(risk_rows),
        total_files=total_files,
        total_commits=total_commits,
        high_risk_files=high_risk,
    )


def _rule_matches(value: str, pattern: str) -> bool:
    value = value.replace("\\", "/").lower()
    pattern = pattern.replace("\\", "/").lower().strip("/")
    if not pattern:
        return False
    return value == pattern or value.startswith(f"{pattern}/") or f"/{pattern}/" in value


def evaluate_drift_rules(edges: list[DependencyEdge]) -> list[DriftViolation]:
    rules = [
        {"id": "api-cannot-import-engine", "source": "api", "target": "engine", "severity": "high"},
        {"id": "api-cannot-import-models", "source": "api", "target": "models", "severity": "medium"},
        {"id": "core-cannot-import-api", "source": "core", "target": "api", "severity": "medium"},
    ]
    violations: list[DriftViolation] = []
    seen: set[tuple[str, str, str]] = set()
    for edge in edges:
        src = edge.source or ""
        tgt = edge.target or ""
        for rule in rules:
            if _rule_matches(src, rule["source"]) and _rule_matches(tgt, rule["target"]):
                key = (src, tgt, rule["id"])
                if key in seen:
                    continue
                seen.add(key)
                violations.append(
                    DriftViolation(
                        source=src,
                        target=tgt,
                        rule=rule["id"],
                        severity=rule["severity"],
                    )
                )
    return violations


@router.get("/{repo_id}", response_model=AnalysisOut)
def get_analysis(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = 10,
    skip: int = 0,
):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip must be >= 0")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    risk_rows = recalculate_file_risk_scores(rows)
    risk_rows = sorted(risk_rows, key=lambda row: (row.risk_score or 0.0, row.path), reverse=True)
    selected_rows = risk_rows[skip: skip + limit]
    risky_files = [_serialize_file_metric(row) for row in selected_rows]

    summary = _build_analysis_summary(repo_id, db, rows)
    explanation = None
    if risky_files:
        top_paths = [item.path for item in risky_files[:3]]
        explanation = "Highest-risk files: " + ", ".join(top_paths) + ". Review the complex and churn-heavy hotspots first."
    elif rows:
        explanation = "No files exceeded the high-risk threshold, but dependency and churn hotspots should still be reviewed."

    return AnalysisOut(repo_id=repo_id, summary=summary, risky_files=risky_files, explanation=explanation)


@router.get("/{repo_id}/risk", response_model=list[PublicFileMetric])
def get_risk(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = 10,
    skip: int = 0,
):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip must be >= 0")
    return _build_risk_list(repo_id, db, limit=limit, skip=skip)


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
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    violations = evaluate_drift_rules(edges)
    return DriftReport(repo_id=repo_id, violations=violations)


@router.post("/{repo_id}/impact", response_model=ImpactReport)
def change_impact(
    repo_id: int,
    payload: ImpactRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Static impact analysis based on the repository dependency graph."""
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    if not payload.changed_files:
        raise HTTPException(status_code=400, detail="changed_files must not be empty")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    impact = analyze_change_impact(rows, edges, payload.changed_files, depth=payload.depth, limit=payload.limit)
    return ImpactReport(
        repo_id=repo_id,
        changed_files=impact["changed_files"],
        ignored_files=impact["ignored_files"],
        impacted_files=[
            ImpactItem(
                path=item["path"],
                depth=item["depth"],
                relationship=item["relationship"],
                risk_score=item["risk_score"],
                centrality=item["centrality"],
            )
            for item in impact["impacted_files"]
        ],
    )


@router.get("/{repo_id}/report", response_model=EngineeringReport)
def get_report(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    changed_files: list[str] = Query(default_factory=list),
    depth: int = Query(default=3, ge=1, le=5),
    limit: int = Query(default=25, ge=1, le=100),
    include_ai: bool = Query(default=False),
):
    """Generate a deterministic engineering summary from stored analysis and metrics."""
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()
    violations = evaluate_drift_rules(edges)
    report = build_report(repo, analysis, rows, edges, violations, changed_files=changed_files, depth=depth, limit=limit)

    if include_ai:
        summary = {
            "health_index": report.summary.health_index,
            "total_files": report.summary.total_files,
            "total_commits": report.summary.total_commits,
            "high_risk_files": report.summary.high_risk_files,
            "top_risky_files": [
                {"path": item.path, "risk_score": item.risk_score} for item in report.highest_risk_files[:5]
            ],
            "architecture_violations": [
                f"{item.source} -> {item.target} ({item.rule})" for item in report.architecture_violations
            ],
            "impact": [
                f"{item.path} (depth={item.depth})" for item in report.impact.impacted_files
            ] if report.impact else [],
        }
        explanation = generate_structured_repo_explanation(summary)
        report.ai_explanation = explanation
        report.llm_available = bool(settings.LLM_API_KEY)
    else:
        report.ai_explanation = None
        report.llm_available = bool(settings.LLM_API_KEY)

    return report


@router.post("/{repo_id}/ai-explain")
def explain_repo_summary(
    repo_id: int,
    payload: ImpactRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Optional repository-specific AI explanation using only bounded structured facts."""
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()
    violations = evaluate_drift_rules(edges)
    report = build_report(repo, analysis, rows, edges, violations, changed_files=payload.changed_files, depth=payload.depth, limit=payload.limit)
    summary = {
        "health_index": report.summary.health_index,
        "total_files": report.summary.total_files,
        "total_commits": report.summary.total_commits,
        "high_risk_files": report.summary.high_risk_files,
        "top_risky_files": [
            {"path": item.path, "risk_score": item.risk_score} for item in report.highest_risk_files[:5]
        ],
        "architecture_violations": [
            f"{item.source} -> {item.target} ({item.rule})" for item in report.architecture_violations
        ],
        "impact": [f"{item.path} (depth={item.depth})" for item in report.impact.impacted_files] if report.impact else [],
    }
    llm_explanation = generate_structured_repo_explanation(summary)
    if llm_explanation is None:
        raise HTTPException(status_code=503, detail="Optional AI explanation is unavailable because no API key is configured.")
    return {"repo_id": repo_id, "explanation": llm_explanation}


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