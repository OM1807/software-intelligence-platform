import re
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.database import get_db
from app.engine.pipeline import run_analysis
from app.models.schema import Repository, User
from app.schemas.repo import RepoImport, RepoOut

router = APIRouter()

GITHUB_URL = re.compile(r"github\.com[/:]([^/]+)/([^/]+?)(?:\.git)?/?$")


def _parse_github_repo(value: str) -> tuple[str, str]:
    if not value or not value.strip():
        raise HTTPException(status_code=400, detail="Repository URL is required")

    candidate = value.strip()
    if "@" in candidate and ":" in candidate:
        ssh_match = re.fullmatch(r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?/?", candidate)
        if ssh_match:
            return ssh_match.group(1), ssh_match.group(2)
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or parsed.hostname != "github.com":
        raise HTTPException(status_code=400, detail="Only GitHub HTTPS URLs are supported")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Repository URL must not contain credentials")
    if parsed.path.count("/") != 2 or parsed.path.startswith("/") is False:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")

    path_parts = [p for p in parsed.path.split("/") if p and p != "/"]
    if len(path_parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")
    owner, name = path_parts
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
        raise HTTPException(status_code=400, detail="Invalid GitHub repository owner or name")
    return owner, name


def get_user_repo(db: Session, repo_id: int, user: User) -> Repository:
    repo = db.get(Repository, repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.post("/import", response_model=RepoOut)
def import_repository(
    body: RepoImport,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    owner, name = _parse_github_repo(body.url)

    repo = db.query(Repository).filter_by(user_id=user.id, owner=owner, name=name).first()
    if not repo:
        repo = Repository(user_id=user.id, owner=owner, name=name,
                          url=f"https://github.com/{owner}/{name}")
        db.add(repo)
    elif repo.status == "processing":
        return repo

    repo.status = "processing"
    repo.error = None
    db.commit()
    db.refresh(repo)

    token = body.access_token or user.github_token
    background.add_task(run_analysis, repo.id, token)
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
