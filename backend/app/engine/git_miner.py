"""Repository mining: clone or read local Git repos, extract commit history + per-file stats."""
import os
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from git import InvalidGitRepositoryError, Repo
from git.exc import GitCommandError

from app.core.config import settings

SEP = "\x1f"
MARK = "@@COMMIT@@"


class CloneError(Exception):
    pass


def clone_repo(owner: str, name: str, dest_name: str, token: str | None = None) -> Path:
    """Clone (or refresh) a repo into REPOS_DIR/dest_name and return its path."""
    dest = Path(settings.REPOS_DIR) / dest_name
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    dest.parent.mkdir(parents=True, exist_ok=True)

    auth = f"x-access-token:{token}@" if token else ""
    url = f"https://{auth}github.com/{owner}/{name}.git"
    try:
        repo = Repo.clone_from(url, dest, env={"GIT_TERMINAL_PROMPT": "0"})
    except GitCommandError as e:
        shutil.rmtree(dest, ignore_errors=True)
        msg = str(e).replace(token, "***") if token else str(e)
        raise CloneError(f"Could not clone {owner}/{name}: {msg[-300:]}") from None

    repo.remote("origin").set_url(f"https://github.com/{owner}/{name}.git")
    return dest


def mine_commits(repo_path: str | Path) -> list[dict]:
    """One pass over `git log --numstat`. Returns commits, newest first."""
    try:
        repo = Repo(repo_path)
    except (InvalidGitRepositoryError, Exception):
        return []

    fmt = f"{MARK}%H{SEP}%an{SEP}%ae{SEP}%aI{SEP}%s"
    try:
        out = repo.git.log("--no-renames", "--numstat", f"--pretty=format:{fmt}")
    except (GitCommandError, Exception):
        return []

    commits, current = [], None
    for line in out.splitlines():
        if line.startswith(MARK):
            try:
                sha, author, email, date, msg = line[len(MARK):].split(SEP, 4)
                current = {"sha": sha, "author": author, "email": email,
                           "date": date, "message": msg, "files": []}
                commits.append(current)
            except ValueError:
                current = None
        elif line.strip() and current is not None:
            parts = line.split("\t", 2)
            if len(parts) == 3:
                added, deleted, path = parts
                # Normalize Windows slashes
                norm_path = path.replace("\\", "/")
                current["files"].append({
                    "path": norm_path,
                    "added": int(added) if added.isdigit() else 0,
                    "deleted": int(deleted) if deleted.isdigit() else 0,
                })
    return commits


def file_stats(commits: list[dict]) -> dict[str, dict]:
    """Aggregate per-file churn: commit count, lines changed, authors, last change."""
    stats = defaultdict(lambda: {"commits": 0, "added": 0, "deleted": 0,
                                 "authors": set(), "last_modified": None})
    for c in commits:
        for f in c["files"]:
            s = stats[f["path"]]
            s["commits"] += 1
            s["added"] += f["added"]
            s["deleted"] += f["deleted"]
            s["authors"].add(c["email"])
            if s["last_modified"] is None:
                s["last_modified"] = c["date"]
    return {p: {**s, "authors": len(s["authors"])} for p, s in stats.items()}


def monthly_timeline(commits: list[dict]) -> list[dict]:
    """Commits per month (for the dashboard timeline)."""
    counts = defaultdict(int)
    for c in commits:
        if c.get("date"):
            counts[c["date"][:7]] += 1
    if not counts:
        now_month = datetime.now(timezone.utc).strftime("%Y-%m")
        return [{"date": now_month, "commits": len(commits) or 1}]
    return [{"date": d, "commits": n} for d, n in sorted(counts.items())]


def mine_repository(owner: str, name: str, dest_name: str, token: str | None = None) -> dict:
    """Full mining pipeline used by the remote import endpoint."""
    path = clone_repo(owner, name, dest_name, token)
    commits = mine_commits(path)
    return {
        "path": str(path),
        "total_commits": len(commits),
        "contributors": len({c["email"] for c in commits}) or 1,
        "file_stats": file_stats(commits),
        "timeline": monthly_timeline(commits),
        "commits": commits,
        "is_cloned": True,
    }


def mine_local_repository(local_path: str | Path) -> dict:
    """Mining pipeline for local directories or existing git repos."""
    path = Path(local_path).resolve()
    commits = mine_commits(path)
    stats = file_stats(commits) if commits else {}
    return {
        "path": str(path),
        "total_commits": len(commits),
        "contributors": len({c["email"] for c in commits}) if commits else 1,
        "file_stats": stats,
        "timeline": monthly_timeline(commits),
        "commits": commits,
        "is_cloned": False,
    }
