import re
from urllib.parse import urlparse

import httpx
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


def _verify_github_access(owner: str, name: str, token: str | None) -> bool:
    if not token:
        raise HTTPException(status_code=401, detail="A GitHub sign-in is required before importing repositories")
    try:
        response = httpx.get(
            f"https://api.github.com/repos/{owner}/{name}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub could not be reached to verify repository access") from exc
    if response.status_code in {401, 403, 404}:
        raise HTTPException(status_code=403, detail="Your GitHub account does not have access to this repository")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="GitHub rejected repository access verification")
    return bool(response.json().get("private"))


@router.post("/import", response_model=RepoOut)
def import_repository(
    body: RepoImport,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    url_val = (body.url or "").strip()
    owner, name = _parse_github_repo(url_val)
    url = f"https://github.com/{owner}/{name}"
    is_private = _verify_github_access(owner, name, user.github_token)

    repo = db.query(Repository).filter_by(user_id=user.id, owner=owner, name=name).first()
    if not repo:
        repo = Repository(user_id=user.id, owner=owner, name=name, url=url, is_private=is_private)
        db.add(repo)
    elif repo.status == "processing":
        return repo

    repo.status = "processing"
    repo.error = None
    repo.is_private = is_private
    db.commit()
    db.refresh(repo)

    background.add_task(run_analysis, repo.id, user.github_token)
    return repo


@router.post("/{repo_id}/reanalyze", response_model=RepoOut)
def reanalyze_repository(
    repo_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = get_user_repo(db, repo_id, user)
    repo.status = "processing"
    repo.error = None
    db.commit()
    db.refresh(repo)
    background.add_task(run_analysis, repo.id, user.github_token)
    return repo


@router.get("", response_model=list[RepoOut])
def list_repositories(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Repository).filter_by(user_id=user.id).order_by(Repository.id.desc()).all()


@router.get("/{repo_id}", response_model=RepoOut)
def get_repository(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_user_repo(db, repo_id, user)


@router.delete("/{repo_id}", status_code=204)
def delete_repository(repo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    repo = get_user_repo(db, repo_id, user)
    db.delete(repo)
    db.commit()
