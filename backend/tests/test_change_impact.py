from types import SimpleNamespace

from app.engine.change_impact import analyze_change_impact


def test_change_impact_traverses_dependents_in_reverse_direction():
    files = [
        SimpleNamespace(path="src/api/routes.py", risk_score=0.9, centrality=0.8),
        SimpleNamespace(path="src/core/service.py", risk_score=0.6, centrality=0.4),
        SimpleNamespace(path="src/utils/helpers.py", risk_score=0.2, centrality=0.1),
    ]
    edges = [
        SimpleNamespace(source="src/api/routes.py", target="src/core/service.py"),
        SimpleNamespace(source="src/core/service.py", target="src/utils/helpers.py"),
    ]

    result = analyze_change_impact(files, edges, ["src/utils/helpers.py"], depth=3, limit=10)

    assert result["changed_files"] == ["src/utils/helpers.py"]
    assert any(item["path"] == "src/core/service.py" for item in result["impacted_files"])
    assert any(item["path"] == "src/api/routes.py" for item in result["impacted_files"])
    assert all(item["depth"] >= 1 for item in result["impacted_files"])


def test_unknown_changed_files_are_ignored_and_empty_graph_is_safe():
    result = analyze_change_impact([], [], ["unknown.py"], depth=3, limit=10)
    assert result["changed_files"] == []
    assert result["ignored_files"] == ["unknown.py"]
    assert result["impacted_files"] == []
