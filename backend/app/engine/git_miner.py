"""Repository mining: clone a GitHub repo and extract commit history + per-file stats."""
import shutil
from collections import defaultdict
from pathlib import Path

from git import Repo
from git.exc import GitCommandError

from app.core.config import settings

SEP = "\x1f"  # field separator that can't appear in names/messages
MARK = "@@COMMIT@@"


class CloneError(Exception):
    pass


def clone_repo(owner: str, name: str, dest_name: str, token: str | None = None) -> Path:
    """Clone (or refresh) a repo into REPOS_DIR/dest_name and return its path."""
    dest = Path(settings.REPOS_DIR) / dest_name
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    auth = f"x-access-token:{token}@" if token else ""
    url = f"https://{auth}github.com/{owner}/{name}.git"
    try:
        repo = Repo.clone_from(url, dest)
    except GitCommandError as e:
        shutil.rmtree(dest, ignore_errors=True)
        # never leak the token in error messages
        msg = str(e).replace(token, "***") if token else str(e)
        raise CloneError(f"Could not clone {owner}/{name}: {msg[-300:]}") from None
    # don't keep the token inside .git/config
    repo.remote("origin").set_url(f"https://github.com/{owner}/{name}.git")
    return dest


def mine_commits(repo_path: str | Path) -> list[dict]:
    """One pass over `git log --numstat`. Returns commits, newest first."""
    repo = Repo(repo_path)
    fmt = f"{MARK}%H{SEP}%an{SEP}%ae{SEP}%aI{SEP}%s"
    out = repo.git.log("--no-renames", "--numstat", f"--pretty=format:{fmt}")

    commits, current = [], None
    for line in out.splitlines():
        if line.startswith(MARK):
            sha, author, email, date, msg = line[len(MARK):].split(SEP, 4)
            current = {"sha": sha, "author": author, "email": email,
                       "date": date, "message": msg, "files": []}
            commits.append(current)
        elif line.strip() and current is not None:
            added, deleted, path = line.split("\t", 2)
            current["files"].append({
                "path": path,
                "added": int(added) if added.isdigit() else 0,   # "-" = binary file
                "deleted": int(deleted) if deleted.isdigit() else 0,
            })
    return commits


def file_stats(commits: list[dict]) -> dict[str, dict]:
    """Aggregate per-file churn: commit count, lines changed, authors, last change."""
    stats = defaultdict(lambda: {"commits": 0, "added": 0, "deleted": 0,
                                 "authors": set(), "last_modified": None})
    for c in commits:  # newest first, so the first date seen is the latest
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
        counts[c["date"][:7]] += 1
    return [{"date": d, "commits": n} for d, n in sorted(counts.items())]


def mine_repository(owner: str, name: str, dest_name: str, token: str | None = None) -> dict:
    """Full mining pipeline used by the import endpoint."""
    path = clone_repo(owner, name, dest_name, token)
    commits = mine_commits(path)
    return {
        "path": str(path),
        "total_commits": len(commits),
        "contributors": len({c["email"] for c in commits}),
        "file_stats": file_stats(commits),
        "timeline": monthly_timeline(commits),
        "commits": commits,
    }


if __name__ == "__main__":
    # Quick manual test:  python -m app.engine.git_miner owner name [token]
    import sys
    owner, name = sys.argv[1], sys.argv[2]
    token = sys.argv[3] if len(sys.argv) > 3 else None
    r = mine_repository(owner, name, f"test_{name}", token)
    print(f"commits={r['total_commits']} contributors={r['contributors']} files={len(r['file_stats'])}")
    top = sorted(r["file_stats"].items(), key=lambda kv: kv[1]["commits"], reverse=True)[:5]
    for path, s in top:
        print(f"  {s['commits']:>4} commits  +{s['added']}/-{s['deleted']}  {path}")
    print("timeline (last 3):", r["timeline"][-3:])