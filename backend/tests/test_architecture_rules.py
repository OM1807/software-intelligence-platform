from app.api.endpoints.analysis import evaluate_drift_rules
from app.models.schema import DependencyEdge


def test_compliant_edges_return_no_violations():
    edges = [
        DependencyEdge(repo_id=1, source="src/core/math.py", target="src/core/helpers.py", weight=1),
        DependencyEdge(repo_id=1, source="src/core/config.py", target="src/core/paths.py", weight=1),
    ]
    assert evaluate_drift_rules(edges) == []


def test_violating_edges_trigger_rule_violation():
    edges = [
        DependencyEdge(repo_id=1, source="src/api/routes.py", target="src/engine/pipeline.py", weight=1),
    ]
    violations = evaluate_drift_rules(edges)
    assert len(violations) == 1
    assert violations[0].rule == "api-cannot-import-engine"
    assert violations[0].severity == "high"


def test_empty_graph_has_no_violations():
    assert evaluate_drift_rules([]) == []


def test_unknown_paths_are_ignored():
    edges = [
        DependencyEdge(repo_id=1, source="docs/guide.md", target="README.md", weight=1),
    ]
    assert evaluate_drift_rules(edges) == []
