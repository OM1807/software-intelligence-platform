from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import get_user_repo
from app.core.database import get_db
from app.models.schema import User
from app.schemas.metrics import DashboardOut, HealthSummary, TimelinePoint

router = APIRouter()


@router.get("/{repo_id}", response_model=DashboardOut)
def get_dashboard(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_user_repo(db, repo_id, user)
    # MOCK DATA: replace with real aggregates in Phase 5
    return DashboardOut(
        repo_id=repo_id,
        summary=HealthSummary(health_index=72.5, total_files=128, total_commits=950, high_risk_files=2),
        timeline=[
            TimelinePoint(date="2026-07", commits=120, health_index=80.1),
            TimelinePoint(date="2026-08", commits=210, health_index=76.4),
            TimelinePoint(date="2026-09", commits=180, health_index=74.0),
            TimelinePoint(date="2026-10", commits=140, health_index=72.5),
        ],
    )