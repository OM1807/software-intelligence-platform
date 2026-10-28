from types import SimpleNamespace

from app.engine.report_generator import build_report


def test_report_uses_persisted_metrics_and_detects_violations():
    repo = SimpleNamespace(id=44)
    analysis = SimpleNamespace(
        total_commits=12,
        total_files=2,
        cycles=[["src/a.py", "src/b.py"]],
    )
    files = [
        SimpleNamespace(
            path="src/a.py",
            loc=150,
            avg_complexity=15.0,
            risk_score=0.82,
            centrality=0.8,
            commits=8,
            lines_added=70,
            lines_deleted=20,
        ),
        SimpleNamespace(
            path="src/b.py",
            loc=80,
            avg_complexity=4.0,
            risk_score=0.26,
            centrality=0.2,
            commits=3,
            lines_added=20,
            lines_deleted=5,
        ),
    ]
    edges = [SimpleNamespace(source="src/a.py", target="src/b.py")]
    violations = [SimpleNamespace(source="src/api/routes.py", target="src/engine/pipeline.py", rule="api-cannot-import-engine", severity="high")]

    report = build_report(repo, analysis, files, edges, violations, changed_files=["src/a.py"], depth=2, limit=10)

    assert report.repo_id == 44
    assert report.summary.total_files == 2
    assert report.summary.high_risk_files >= 1
    assert report.impact is not None
    assert report.impact.changed_files == ["src/a.py"]
    assert report.architecture_violations[0].rule == "api-cannot-import-engine"
