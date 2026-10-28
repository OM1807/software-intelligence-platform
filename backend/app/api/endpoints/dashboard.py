from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import get_user_repo
from app.core.database import get_db
from app.engine.risk_calculator import HIGH_RISK_THRESHOLD, compute_health_index, recalculate_file_risk_scores
from app.models.schema import Analysis, FileMetric, User
from app.schemas.metrics import DashboardOut, HealthSummary, TimelinePoint

router = APIRouter()


@router.get("/{repo_id}", response_model=DashboardOut)
def get_dashboard(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    repo = get_user_repo(db, repo_id, user)
    if repo.status != "completed":
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {repo.status})")

    analysis = db.query(Analysis).filter_by(repo_id=repo_id).first()
    rows = db.query(FileMetric).filter_by(repo_id=repo_id).all()
    rows = recalculate_file_risk_scores(rows)
    risk_values = [row.risk_score or 0.0 for row in rows]
    current_health = compute_health_index(rows)
    total_files = analysis.total_files if analysis and analysis.total_files else len(rows)
    total_commits = analysis.total_commits if analysis else sum(row.commits for row in rows)
    high_risk_files = sum(1 for value in risk_values if value >= HIGH_RISK_THRESHOLD)

    timeline = []
    raw_timeline = analysis.timeline if analysis else []
    for point in raw_timeline:
        if not isinstance(point, dict):
            continue
        timeline.append(
            TimelinePoint(
                date=str(point.get("date", "unknown")),
                commits=int(point.get("commits", 0) or 0),
                health_index=float(current_health),
            )
        )

    if not timeline:
        timeline = [TimelinePoint(date="current", commits=total_commits, health_index=float(current_health))]

    return DashboardOut(
        repo_id=repo_id,
        summary=HealthSummary(
            health_index=float(current_health),
            total_files=total_files,
            total_commits=total_commits,
            high_risk_files=high_risk_files,
        ),
        timeline=timeline,
    )