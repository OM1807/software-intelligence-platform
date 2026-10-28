"""Import pipeline: clone -> mine git history -> parse code -> build dependency graph -> store results."""
import shutil
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.database import SessionLocal
from app.engine import git_miner, parser
from app.engine.dependency_graph import build_dependency_graph
from app.models.schema import Analysis, DependencyEdge, FileMetric, Repository


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value).astimezone(timezone.utc).replace(tzinfo=None)


def _fetch_is_private(owner: str, name: str, token: str | None) -> bool | None:
    """Best effort: ask GitHub whether the repo is private. None if unknown."""
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = httpx.get(f"https://api.github.com/repos/{owner}/{name}", headers=headers, timeout=10)
        if r.status_code == 200:
            return bool(r.json().get("private"))
    except httpx.HTTPError:
        pass
    return None


def build_file_rows(repo_id: int, parsed: dict, git_stats: dict) -> list[FileMetric]:
    rows = []
    for f in parsed["files"]:
        g = git_stats.get(f["path"], {})
        cx = [fn["complexity"] for fn in f["functions"]]
        rows.append(FileMetric(
            repo_id=repo_id,
            path=f["path"],
            language=f["language"],
            loc=f["loc"],
            num_functions=len(f["functions"]),
            num_classes=len(f["classes"]),
            avg_complexity=round(sum(cx) / len(cx), 2) if cx else 0.0,
            max_complexity=max(cx, default=0),
            commits=g.get("commits", 0),
            lines_added=g.get("added", 0),
            lines_deleted=g.get("deleted", 0),
            authors=g.get("authors", 0),
            last_modified=_parse_date(g.get("last_modified")),
            parse_errors=f["parse_errors"],
            structure={"functions": f["functions"], "classes": f["classes"], "imports": f["imports"]},
        ))
    return rows


def apply_graph_metrics(rows: list[FileMetric], graph: dict) -> None:
    """Copy fan-in/out, centrality, instability and cycle flag onto each file row."""
    for row in rows:
        m = graph["metrics"].get(row.path)
        if m:
            row.fan_in, row.fan_out = m["fan_in"], m["fan_out"]
            row.centrality, row.instability = m["centrality"], m["instability"]
            row.in_cycle = m["in_cycle"]


def run_analysis(repo_id: int, token: str | None = None) -> None:
    """Runs in a background task. Always leaves the repo as 'completed' or 'failed'."""
    db = SessionLocal()
    try:
        repo = db.get(Repository, repo_id)
        if repo is None:
            return
        is_private = _fetch_is_private(repo.owner, repo.name, token)
        if is_private is not None:
            repo.is_private = is_private

        mined = git_miner.mine_repository(repo.owner, repo.name, f"repo_{repo_id}", token)
        parsed = parser.parse_repository(mined["path"])
        rows = build_file_rows(repo_id, parsed, mined["file_stats"])
        graph = build_dependency_graph(parsed["files"])
        apply_graph_metrics(rows, graph)

        # replace results of any previous run
        db.query(FileMetric).filter_by(repo_id=repo_id).delete()
        db.query(Analysis).filter_by(repo_id=repo_id).delete()
        db.query(DependencyEdge).filter_by(repo_id=repo_id).delete()
        db.add_all(rows)
        db.add_all(DependencyEdge(repo_id=repo_id, source=s_, target=t_, weight=w)
                   for s_, t_, w in graph["edges"])
        db.add(Analysis(
            repo_id=repo_id,
            total_commits=mined["total_commits"],
            contributors=mined["contributors"],
            total_files=len(rows),
            timeline=mined["timeline"],
            cycles=graph["cycles"],
            graph_stats=graph["stats"],
        ))
        repo.status = "completed"
        repo.error = None
        repo.last_analyzed = datetime.utcnow()
        db.commit()
    except Exception as e:  # noqa: BLE001 - any failure must be reported, not lost
        db.rollback()
        msg = str(e)
        if token:
            msg = msg.replace(token, "***")
        repo = db.get(Repository, repo_id)
        if repo is not None:
            repo.status = "failed"
            repo.error = msg[:500]
            db.commit()
    finally:
        shutil.rmtree(Path(settings.REPOS_DIR) / f"repo_{repo_id}", ignore_errors=True)
        db.close()