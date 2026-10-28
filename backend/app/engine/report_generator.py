from __future__ import annotations

from datetime import datetime, timezone

from app.engine.change_impact import analyze_change_impact
from app.engine.risk_calculator import HIGH_RISK_THRESHOLD, compute_health_index, recalculate_file_risk_scores
from app.schemas.analysis import EngineeringReport, Recommendation
from app.schemas.metrics import HealthSummary


def _risk_score_of(item: object) -> float:
    value = getattr(item, "risk_score", None)
    if value is not None:
        try:
            return float(value)
        except (TypeError, ValueError):
            pass
    safe_rows = recalculate_file_risk_scores([item])
    return float(getattr(safe_rows[0], "risk_score", 0.0) or 0.0)


def _normalize_risk_rows(rows: list[object]) -> list[object]:
    normalized: list[object] = []
    for row in rows:
        if getattr(row, "risk_score", None) is None:
            value = _risk_score_of(row)
            try:
                row.risk_score = value
            except AttributeError:
                pass
        normalized.append(row)
    return normalized


def _to_health_summary(rows: list[object], analysis: object | None) -> HealthSummary:
    safe_rows = _normalize_risk_rows(rows)
    total_files = getattr(analysis, "total_files", None) if analysis else None
    total_commits = getattr(analysis, "total_commits", None) if analysis else None
    high_risk = sum(1 for row in safe_rows if _risk_score_of(row) >= HIGH_RISK_THRESHOLD)
    return HealthSummary(
        health_index=compute_health_index(safe_rows),
        total_files=int(total_files) if total_files else len(safe_rows),
        total_commits=int(total_commits) if total_commits else sum(int(getattr(row, "commits", 0) or 0) for row in safe_rows),
        high_risk_files=high_risk,
    )


def build_report(
    repo: object,
    analysis: object | None,
    file_metrics: list[object],
    dependency_edges: list[object],
    violations: list[object],
    *,
    changed_files: list[str] | None = None,
    depth: int = 3,
    limit: int = 25,
) -> EngineeringReport:
    metrics = _normalize_risk_rows(file_metrics)
    top_risk = sorted(metrics, key=lambda item: (_risk_score_of(item), getattr(item, "path", "")), reverse=True)[:5]
    summary = _to_health_summary(metrics, analysis)
    impact = analyze_change_impact(metrics, dependency_edges, changed_files or [], depth=depth, limit=limit)

    recommendations: list[Recommendation] = []
    for row in top_risk:
        if (getattr(row, "risk_score", 0.0) or 0.0) >= HIGH_RISK_THRESHOLD:
            recommendations.append(
                Recommendation(
                    title=f"Review {getattr(row, 'path', 'unknown')}",
                    suggestion="Split large responsibilities or add focused tests around the highest-risk and most central file.",
                    evidence=[f"risk={getattr(row, 'risk_score', 0.0):.2f}", f"centrality={getattr(row, 'centrality', 0.0):.2f}"],
                    severity="high" if (getattr(row, "risk_score", 0.0) or 0.0) >= 0.85 else "medium",
                )
            )
    if violations:
        recommendations.append(
            Recommendation(
                title="Correct architecture violations",
                suggestion="Resolve dependency-direction violations by moving the offending source closer to the target layer or introducing an adapter boundary.",
                evidence=[f"{getattr(v, 'source', '')} -> {getattr(v, 'target', '')} ({getattr(v, 'rule', '')})" for v in violations[:3]],
                severity="high" if any(getattr(v, 'severity', '') == 'high' for v in violations) else "medium",
            )
        )
    if not recommendations:
        recommendations.append(
            Recommendation(
                title="Keep monitoring",
                suggestion="No major risk hotspots were detected in the current persisted analysis; continue monitoring churn and dependency growth.",
                evidence=["low_risk_distribution"],
                severity="low",
            )
        )

    report = EngineeringReport(
        repo_id=getattr(repo, "id", 0),
        generated_at=datetime.now(timezone.utc),
        summary=summary,
        key_metrics={
            "total_files": summary.total_files,
            "total_commits": summary.total_commits,
            "high_risk_files": summary.high_risk_files,
            "health_index": round(summary.health_index, 2),
            "cycles": len(getattr(analysis, "cycles", []) or []),
            "edges": len(dependency_edges),
        },
        highest_risk_files=[
            {
                "path": getattr(item, "path", ""),
                "loc": int(getattr(item, "loc", 0) or 0),
                "complexity": float(getattr(item, "avg_complexity", 0.0) or 0.0),
                "churn": int((getattr(item, "commits", 0) or 0) + (getattr(item, "lines_added", 0) or 0) + (getattr(item, "lines_deleted", 0) or 0)),
                "risk_score": float(getattr(item, "risk_score", 0.0) or 0.0),
            }
            for item in top_risk
        ],
        cycles=list(getattr(analysis, "cycles", []) or []),
        architecture_violations=[
            {
                "source": getattr(v, "source", ""),
                "target": getattr(v, "target", ""),
                "rule": getattr(v, "rule", ""),
                "severity": getattr(v, "severity", "low"),
            }
            for v in violations
        ],
        impact={
            "repo_id": getattr(repo, "id", 0),
            "changed_files": impact["changed_files"],
            "ignored_files": impact["ignored_files"],
            "impacted_files": [
                {
                    "path": item["path"],
                    "depth": item["depth"],
                    "relationship": item["relationship"],
                    "risk_score": item["risk_score"],
                    "centrality": item["centrality"],
                }
                for item in impact["impacted_files"]
            ],
        },
        recommendations=recommendations,
        ai_explanation=None,
        llm_available=False,
    )
    return report
