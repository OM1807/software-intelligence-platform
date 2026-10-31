import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import get_user_repo
from app.core.config import settings
from app.core.database import get_db
from app.engine.change_impact import analyze_change_impact
from app.engine.llm_service import (
    answer_repository_question,
    generate_ai_response,
    generate_structured_repo_explanation,
)
from app.engine.report_generator import build_report
from app.engine.risk_calculator import HIGH_RISK_THRESHOLD, compute_health_index, recalculate_file_risk_scores
from app.models.schema import (
    Analysis,
    ArchitectureRule as ArchitectureRuleRow,
    DependencyEdge,
    FileMetric as FileMetricRow,
    User,
)
from app.schemas.analysis import (
    AnalysisOut,
    AskAIRequest,
    AskAIResponse,
    DependencyGraph,
    DriftReport,
    DriftViolation,
    EngineeringReport,
    GraphEdge,
    GraphNode,
    ImpactItem,
    ImpactReport,
    ImpactRequest,
    RuleCreate,
    RuleOut,
    SystemConfigOut,
    SystemConfigUpdate,
)
from app.schemas.metrics import FileMetric as PublicFileMetric, HealthSummary

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_DRIFT_RULES = [
    {"id": "api-cannot-import-engine", "source": "api", "target": "engine", "severity": "high"},
    {"id": "api-cannot-import-models", "source": "api", "target": "models", "severity": "medium"},
    {"id": "core-cannot-import-api", "source": "core", "target": "api", "severity": "medium"},
]


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
    return value == pattern or value.startswith(f"{pattern}/") or f"/{pattern}/" in value or value.endswith(f"/{pattern}")


def evaluate_drift_rules(
    edges: list[DependencyEdge],
    rules: list[dict] | None = None,
) -> list[DriftViolation]:
    active_rules = rules if rules is not None else DEFAULT_DRIFT_RULES
    violations: list[DriftViolation] = []
    seen: set[tuple[str, str, str]] = set()

    for edge in edges:
        src = edge.source or ""
        tgt = edge.target or ""
        for rule in active_rules:
            if not rule.get("is_active", True):
                continue
            rule_id = rule.get("id") or rule.get("rule_id", "rule")
            rule_src = rule.get("source") or rule.get("source_layer", "")
            rule_tgt = rule.get("target") or rule.get("target_layer", "")
            severity = rule.get("severity", "medium")

            if _rule_matches(src, rule_src) and _rule_matches(tgt, rule_tgt):
                key = (src, tgt, rule_id)
                if key in seen:
                    continue
                seen.add(key)
                violations.append(
                    DriftViolation(
                        source=src,
                        target=tgt,
                        rule=rule_id,
                        severity=severity,
                    )
                )
    return violations


@router.get("/{repo_id}", response_model=AnalysisOut)
def get_analysis(
    repo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = 200,
    skip: int = 0,
):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
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
    limit: int = 100,
    skip: int = 0,
):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")
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

    if not include_isolated:
        connected = {e.source for e in edges} | {e.target for e in edges}
        files = [f for f in files if f.path in connected]

    return DependencyGraph(
        nodes=[
            GraphNode(
                id=f.path,
                label=f.path.split("/")[-1],
                language=f.language,
                loc=f.loc,
                fan_in=f.fan_in,
                fan_out=f.fan_out,
                centrality=f.centrality,
                instability=f.instability,
                in_cycle=f.in_cycle,
            )
            for f in files
        ],
        edges=[GraphEdge(source=e.source, target=e.target, weight=e.weight) for e in edges],
        cycles=analysis.cycles if analysis else [],
        stats=analysis.graph_stats if analysis else {},
    )


# ---------- Architecture Rules CRUD (Software Architect) ----------
@router.get("/{repo_id}/rules", response_model=list[RuleOut])
def get_rules(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    rules = db.query(ArchitectureRuleRow).filter_by(repo_id=repo_id).all()
    if not rules:
        # Seed default architecture rules for this repo
        default_objs = [
            ArchitectureRuleRow(
                repo_id=repo_id,
                rule_id=r["id"],
                rule_name=r["id"].replace("-", " ").title(),
                rule_description=f"Modules in layer '{r['source']}' cannot import '{r['target']}'",
                source_layer=r["source"],
                target_layer=r["target"],
                severity=r["severity"],
                is_active=True,
            )
            for r in DEFAULT_DRIFT_RULES
        ]
        db.add_all(default_objs)
        db.commit()
        rules = db.query(ArchitectureRuleRow).filter_by(repo_id=repo_id).all()
    return rules


@router.post("/{repo_id}/rules", response_model=RuleOut)
def create_rule(repo_id: int, body: RuleCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    existing = db.query(ArchitectureRuleRow).filter_by(repo_id=repo_id, rule_id=body.rule_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Rule ID already exists for this repository")

    rule = ArchitectureRuleRow(
        repo_id=repo_id,
        rule_id=body.rule_id.strip(),
        rule_name=body.rule_name.strip(),
        rule_description=body.rule_description,
        source_layer=body.source_layer.strip(),
        target_layer=body.target_layer.strip(),
        severity=body.severity.lower() if body.severity in {"low", "medium", "high"} else "medium",
        is_active=body.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{repo_id}/rules/{rule_id}", status_code=204)
def delete_rule(repo_id: int, rule_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    rule = db.query(ArchitectureRuleRow).filter_by(id=rule_id, repo_id=repo_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()


@router.patch("/{repo_id}/rules/{rule_id}/toggle", response_model=RuleOut)
def toggle_rule(repo_id: int, rule_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    rule = db.query(ArchitectureRuleRow).filter_by(id=rule_id, repo_id=repo_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = not rule.is_active
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/{repo_id}/drift", response_model=DriftReport)
def get_drift(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    rules = db.query(ArchitectureRuleRow).filter_by(repo_id=repo_id).all()
    if not rules:
        rules_dicts = DEFAULT_DRIFT_RULES
        rule_outs = []
    else:
        rules_dicts = [
            {
                "id": r.rule_id,
                "source": r.source_layer,
                "target": r.target_layer,
                "severity": r.severity,
                "is_active": r.is_active,
            }
            for r in rules
        ]
        rule_outs = [RuleOut.model_validate(r) for r in rules]

    violations = evaluate_drift_rules(edges, rules_dicts)
    compliance_score = max(0.0, round((1.0 - (len(violations) / max(1, len(edges)))) * 100, 1))

    return DriftReport(
        repo_id=repo_id,
        violations=violations,
        rules=rule_outs,
        compliance_score=compliance_score,
    )


@router.post("/{repo_id}/impact", response_model=ImpactReport)
def change_impact(
    repo_id: int,
    payload: ImpactRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    if not payload.changed_files:
        raise HTTPException(status_code=400, detail="changed_files must not be empty")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    impact = analyze_change_impact(rows, edges, payload.changed_files, depth=payload.depth, limit=payload.limit)
    if impact["ignored_files"]:
        invalid = ", ".join(impact["ignored_files"][:5])
        suffix = " ..." if len(impact["ignored_files"]) > 5 else ""
        raise HTTPException(
            status_code=400,
            detail=f"Unknown file path(s): {invalid}{suffix}. Use paths from the analyzed repository.",
        )
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
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()
    rules = db.query(ArchitectureRuleRow).filter_by(repo_id=repo_id).all()
    rules_dicts = [
        {"id": r.rule_id, "source": r.source_layer, "target": r.target_layer, "severity": r.severity, "is_active": r.is_active}
        for r in rules
    ] if rules else None

    violations = evaluate_drift_rules(edges, rules_dicts)
    report = build_report(repo, analysis, rows, edges, violations, changed_files=changed_files, depth=depth, limit=limit)

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
        "cycles": list(report.cycles),
        "impact": [f"{item.path} (depth={item.depth})" for item in report.impact.impacted_files] if report.impact else [],
    }

    if include_ai:
        explanation = generate_structured_repo_explanation(summary)
        report.ai_explanation = explanation
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
        "cycles": list(report.cycles),
        "impact": [f"{item.path} (depth={item.depth})" for item in report.impact.impacted_files] if report.impact else [],
    }
    llm_explanation = generate_structured_repo_explanation(summary)
    return {"repo_id": repo_id, "explanation": llm_explanation}


@router.post("/{repo_id}/ai-ask", response_model=AskAIResponse)
def ask_ai(
    repo_id: int,
    payload: AskAIRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ask AI Assistant: Natural language queries on codebase health, risks, architecture, and impact."""
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    rows = db.query(FileMetricRow).filter_by(repo_id=repo_id).all()
    edges = db.query(DependencyEdge).filter_by(repo_id=repo_id).all()
    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()
    violations = evaluate_drift_rules(edges)
    report = build_report(repo, analysis, rows, edges, violations)

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
        "cycles": list(report.cycles),
    }

    answer = answer_repository_question(summary, payload.question)
    provider = "gemini" if settings.LLM_API_KEY else "local-intelligence-engine"
    return AskAIResponse(repo_id=repo_id, question=payload.question, answer=answer, provider=provider)


@router.get("/system/config", response_model=SystemConfigOut)
def get_system_config(user: User = Depends(get_current_user)):
    return SystemConfigOut(
        environment=settings.ENVIRONMENT,
        llm_configured=bool(settings.LLM_API_KEY),
        default_depth=3,
        supported_languages=["Python", "TypeScript", "JavaScript", "Java"],
    )


@router.post("/system/config", response_model=SystemConfigOut)
def update_system_config(payload: SystemConfigUpdate, user: User = Depends(get_current_user)):
    if payload.llm_api_key is not None:
        settings.LLM_API_KEY = payload.llm_api_key.strip()
    return SystemConfigOut(
        environment=settings.ENVIRONMENT,
        llm_configured=bool(settings.LLM_API_KEY),
        default_depth=3,
        supported_languages=["Python", "TypeScript", "JavaScript", "Java"],
    )


@router.post("/ai-test")
def test_gemini(
    request: AITestRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")
    try:
        answer = generate_ai_response(prompt)
        return {"provider": "gemini", "prompt": prompt, "response": answer}
    except Exception:
        logger.exception("Gemini integration test failed.")
        raise HTTPException(
            status_code=502,
            detail="Gemini request failed. Check backend logs and verify API key, model availability, and configuration.",
        )
