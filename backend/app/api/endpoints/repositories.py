import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.schema import Repository, User
from app.schemas.repo import RepoImport, RepoOut

router = APIRouter()

GITHUB_URL = re.compile(r"github\.com[/:]([^/]+)/([^/]+?)(?:\.git)?/?$")


def get_user_repo(db: Session, repo_id: int, user: User) -> Repository:
    repo = db.get(Repository, repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.post("/import", response_model=RepoOut)
def import_repository(
    body: RepoImport,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = GITHUB_URL.search(body.url.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")
    owner, name = m.groups()

    repo = (
        db.query(Repository)
        .filter_by(user_id=user.id, owner=owner, name=name)
        .first()
    )
    if not repo:
        repo = Repository(user_id=user.id, owner=owner, name=name,
                          url=f"https://github.com/{owner}/{name}")
        db.add(repo)

    # STUB: Phase 2 will start a background job here (git_miner + parser)
    # and set status to "processing" -> "completed" / "failed".
    repo.status = "completed"
    repo.last_analyzed = datetime.utcnow()
    db.commit()
    db.refresh(repo)
    return repo


@router.get("", response_model=list[RepoOut])
def list_repositories(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Repository).filter_by(user_id=user.id).order_by(Repository.id.desc()).all()


@router.get("/{repo_id}", response_model=RepoOut)
def get_repository(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_user_repo(db, repo_id, user)


@router.delete("/{repo_id}", status_code=204)
def delete_repository(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(get_user_repo(db, repo_id, user))
    db.commit()