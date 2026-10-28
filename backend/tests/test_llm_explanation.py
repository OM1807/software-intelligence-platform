from unittest.mock import patch

from app.engine.llm_service import generate_structured_repo_explanation


def test_structured_explanation_requires_key_and_uses_summary_only():
    with patch("app.engine.llm_service.settings.LLM_API_KEY", "test-key"):
        with patch("app.engine.llm_service.generate_ai_response", return_value="advisory summary") as mock_response:
            result = generate_structured_repo_explanation(
                {
                    "health_index": 72.5,
                    "total_files": 12,
                    "total_commits": 120,
                    "high_risk_files": 2,
                    "top_risky_files": [{"path": "src/service.py", "risk_score": 0.82}],
                    "architecture_violations": ["src/api -> src/engine"],
                    "impact": ["src/service.py (depth=1)"],
                }
            )
            assert result == "advisory summary"
            assert mock_response.called
