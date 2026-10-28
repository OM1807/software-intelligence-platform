from types import SimpleNamespace

from app.engine.risk_calculator import calculate_file_risk, compute_health_index


def test_calculate_file_risk_is_bounded_and_reasonable():
    metric = SimpleNamespace(
        avg_complexity=24.0,
        max_complexity=38,
        commits=12,
        lines_added=230,
        lines_deleted=80,
        authors=4,
        fan_in=6,
        fan_out=8,
        centrality=0.8,
        instability=0.7,
        in_cycle=True,
        parse_errors=True,
    )
    result = calculate_file_risk(metric)
    assert 0.0 <= result["risk_score"] <= 1.0
    assert result["risk_score"] > 0.5
    assert "complexity" in result["reasons"]
    assert "cycle" in result["reasons"]


def test_relative_ordering_prefers_high_risk_files():
    high_risk = SimpleNamespace(
        avg_complexity=18.0,
        max_complexity=30,
        commits=15,
        lines_added=200,
        lines_deleted=100,
        authors=6,
        fan_in=8,
        fan_out=10,
        centrality=0.8,
        instability=0.7,
        in_cycle=False,
        parse_errors=False,
    )
    low_risk = SimpleNamespace(
        avg_complexity=2.0,
        max_complexity=4,
        commits=1,
        lines_added=10,
        lines_deleted=5,
        authors=1,
        fan_in=0,
        fan_out=1,
        centrality=0.1,
        instability=0.1,
        in_cycle=False,
        parse_errors=False,
    )

    assert calculate_file_risk(high_risk)["risk_score"] > calculate_file_risk(low_risk)["risk_score"]


def test_empty_and_zero_values_do_not_raise_and_stay_safe():
    empty = SimpleNamespace(avg_complexity=0, max_complexity=0, commits=0, lines_added=0, lines_deleted=0, authors=0, fan_in=0, fan_out=0, centrality=0.0, instability=0.0, in_cycle=False, parse_errors=False)
    result = calculate_file_risk(empty)
    assert 0.0 <= result["risk_score"] <= 1.0
    assert compute_health_index([empty]) == 100.0
