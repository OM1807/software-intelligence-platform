from __future__ import annotations

from collections import defaultdict, deque
from typing import Iterable, Sequence


def _find_matching_path(candidate: str, file_paths: set[str]) -> str | None:
    norm = candidate.replace("\\", "/").strip().lstrip("/")
    if not norm:
        return None
    # 1. Exact match
    if norm in file_paths:
        return norm
    # 2. Suffix match (e.g. "api.ts" -> "frontend/src/api.ts" or "core/database.py" -> "backend/app/core/database.py")
    matching = [p for p in file_paths if p.endswith("/" + norm) or p.endswith(norm)]
    if matching:
        # Return shortest/closest match deterministically
        return sorted(matching, key=lambda p: (len(p), p))[0]
    return None


def analyze_change_impact(
    file_metrics: Sequence[object],
    dependency_edges: Iterable[object],
    changed_files: Sequence[str],
    *,
    depth: int = 3,
    limit: int = 25,
) -> dict:
    """Return static dependency-based impact data for a set of changed paths.

    Graph semantics: source imports target. To find impacted dependents, we traverse the
    reverse dependency graph from each changed target to files that import it.
    """
    safe_depth = max(1, min(int(depth), 5))
    safe_limit = max(1, min(int(limit), 100))

    file_paths = {getattr(item, "path", "") for item in file_metrics if getattr(item, "path", None)}
    if not file_paths:
        return {
            "changed_files": [],
            "ignored_files": list(changed_files),
            "impacted_files": [],
        }

    risk_by_path: dict[str, float] = {}
    centrality_by_path: dict[str, float] = {}
    for item in file_metrics:
        path = getattr(item, "path", None)
        if path:
            risk_by_path[path] = float(getattr(item, "risk_score", 0.0) or 0.0)
            centrality_by_path[path] = float(getattr(item, "centrality", 0.0) or 0.0)

    reverse: dict[str, list[str]] = defaultdict(list)
    for edge in dependency_edges:
        source = getattr(edge, "source", None)
        target = getattr(edge, "target", None)
        if source and target:
            reverse[target].append(source)

    cleaned_changed: list[str] = []
    ignored: list[str] = []
    for candidate in changed_files:
        cand_str = str(candidate).strip()
        if not cand_str:
            continue
        matched = _find_matching_path(cand_str, file_paths)
        if matched:
            cleaned_changed.append(matched)
        else:
            ignored.append(cand_str)

    cleaned_changed = list(dict.fromkeys(cleaned_changed))
    if not cleaned_changed:
        return {
            "changed_files": [],
            "ignored_files": ignored,
            "impacted_files": [],
        }

    queue: deque[tuple[str, int]] = deque((path, 0) for path in cleaned_changed)
    seen: dict[str, int] = {path: 0 for path in cleaned_changed}
    while queue:
        current, current_depth = queue.popleft()
        if current_depth >= safe_depth:
            continue
        for dependent in sorted(set(reverse.get(current, []))):
            next_depth = current_depth + 1
            if dependent not in seen or next_depth < seen[dependent]:
                seen[dependent] = next_depth
                queue.append((dependent, next_depth))

    impacted = []
    for path, d in seen.items():
        if path in cleaned_changed:
            continue
        impacted.append(
            {
                "path": path,
                "depth": d,
                "relationship": "direct" if d == 1 else "transitive",
                "risk_score": risk_by_path.get(path, 0.0),
                "centrality": centrality_by_path.get(path, 0.0),
            }
        )

    # Sort impacted files: deepest / highest risk first
    impacted.sort(key=lambda item: (int(item["depth"]), -float(item["risk_score"]), item["path"]))
    return {
        "changed_files": cleaned_changed,
        "ignored_files": ignored,
        "impacted_files": impacted[:safe_limit],
    }
