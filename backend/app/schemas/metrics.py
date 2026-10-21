from pydantic import BaseModel


class FileMetric(BaseModel):
    path: str
    loc: int = 0
    complexity: float = 0
    churn: int = 0
    risk_score: float = 0


class HealthSummary(BaseModel):
    health_index: float
    total_files: int
    total_commits: int
    high_risk_files: int