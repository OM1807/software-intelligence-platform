from __future__ import annotations

from math import log1p
from typing import Any, Iterable

HIGH_RISK_THRESHOLD = 0.7


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _normalize_log(value: float, scale: float = 25.0) -> float:
    if value <= 0:
        return 0.0
    return _clamp(log1p(value) / log1p(scale))


def _normalize_ratio(value: float, scale: float = 1.0) -> float:
    if scale <= 0:
        return 0.0
    return _clamp(value / scale)


def _normalize_count(value: Any, scale: float = 5.0) -> float:
    return _normalize_log(float(value or 0), scale)


def calculate_file_risk(metric: Any) -> dict[str, Any]:
    """Compute a bounded, explainable risk score for one file metric row.

    Weighted formula uses only metrics persisted on `FileMetric` and graph metrics:
    - complexity: 0.35
    - churn: 0.25
    - contributor spread: 0.10
    - centrality: 0.10
    - dependency intensity: 0.10
    - cycle flag: 0.05
    - parse errors: 0.05
    """
    avg_complexity = _as_float(getattr(metric, "avg_complexity", None))
    max_complexity = _as_float(getattr(metric, "max_complexity", None))
    commits = _as_float(getattr(metric, "commits", None))
    lines_added = _as_float(getattr(metric, "lines_added", None))
    lines_deleted = _as_float(getattr(metric, "lines_deleted", None))
    authors = _as_float(getattr(metric, "authors", None))
    fan_in = _as_float(getattr(metric, "fan_in", None))
    fan_out = _as_float(getattr(metric, "fan_out", None))
    centrality = _as_float(getattr(metric, "centrality", None))
    instability = _as_float(getattr(metric, "instability", None))
    in_cycle = bool(getattr(metric, "in_cycle", False))
    parse_errors = bool(getattr(metric, "parse_errors", False))

    complexity_score = _normalize_log(max(avg_complexity, max_complexity), 25.0)
    churn_score = _normalize_log((commits * 2.0) + lines_added + lines_deleted, 200.0)
    contributors_score = _normalize_count(authors, 8.0)
    dependency_score = _normalize_log((fan_in + fan_out) + (instability * 10.0), 20.0)
    centrality_score = _normalize_ratio(centrality, 1.0)
    cycle_score = 1.0 if in_cycle else 0.0
    parse_score = 1.0 if parse_errors else 0.0

    risk_score = (
        0.35 * complexity_score
        + 0.25 * churn_score
        + 0.10 * contributors_score
        + 0.10 * centrality_score
        + 0.10 * dependency_score
        + 0.05 * cycle_score
        + 0.05 * parse_score
    )
    risk_score = _clamp(risk_score)

    reasons: list[str] = []
    if complexity_score >= 0.6:
        reasons.append("complexity")
    if churn_score >= 0.6:
        reasons.append("churn")
    if contributors_score >= 0.5:
        reasons.append("contributors")
    if centrality_score >= 0.5 or dependency_score >= 0.5:
        reasons.append("dependency_centrality")
    if in_cycle:
        reasons.append("cycle")
    if parse_errors:
        reasons.append("parse_errors")
    if not reasons and risk_score > 0:
        reasons.append("minor_risk")

    return {
        "risk_score": round(risk_score, 4),
        "reasons": reasons,
        "signals": {
            "complexity": round(complexity_score, 4),
            "churn": round(churn_score, 4),
            "contributors": round(contributors_score, 4),
            "dependency_centrality": round(max(centrality_score, dependency_score), 4),
            "cycle": 1.0 if in_cycle else 0.0,
            "parse_errors": 1.0 if parse_errors else 0.0,
        },
    }


def calculate_batch_risk(metrics: Iterable[Any]) -> list[dict[str, Any]]:
    return [calculate_file_risk(metric) for metric in metrics]


def recalculate_file_risk_scores(metrics: Iterable[Any]) -> list[Any]:
    updated: list[Any] = []
    for metric in metrics:
        score = calculate_file_risk(metric)
        if hasattr(metric, "risk_score"):
            metric.risk_score = score["risk_score"]
        updated.append(metric)
    return updated


def compute_health_index(metrics: Iterable[Any]) -> float:
    items = list(metrics)
    if not items:
        return 100.0
    avg_risk = sum(_as_float(getattr(item, "risk_score", None), calculate_file_risk(item)["risk_score"]) for item in items) / len(items)
    return round(_clamp(1.0 - avg_risk) * 100.0, 2)
