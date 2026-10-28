from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.metrics import FileMetric, HealthSummary


class GraphNode(BaseModel):
    id: str  # file path
    label: str  # file name
    language: str = ""
    loc: int = 0
    fan_in: int = 0
    fan_out: int = 0
    centrality: float = 0
    instability: float = 0
    in_cycle: bool = False


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: int = 1


class DependencyGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    cycles: list[list[str]] = []
    stats: dict = {}


class AnalysisOut(BaseModel):
    repo_id: int
    summary: HealthSummary
    risky_files: list[FileMetric]
    explanation: str | None = None  # LLM-generated text (Phase 4)


class DriftViolation(BaseModel):
    source: str
    target: str
    rule: str
    severity: str  # low | medium | high


class DriftReport(BaseModel):
    repo_id: int
    violations: list[DriftViolation]


class ImpactRequest(BaseModel):
    changed_files: list[str] = Field(default_factory=list, min_length=1, max_length=50)
    depth: int = Field(default=3, ge=1, le=5)
    limit: int = Field(default=25, ge=1, le=100)


class ImpactItem(BaseModel):
    path: str
    depth: int
    relationship: str
    risk_score: float = 0.0
    centrality: float = 0.0


class ImpactReport(BaseModel):
    repo_id: int
    changed_files: list[str] = Field(default_factory=list)
    ignored_files: list[str] = Field(default_factory=list)
    impacted_files: list[ImpactItem] = Field(default_factory=list)


class Recommendation(BaseModel):
    title: str
    suggestion: str
    evidence: list[str] = Field(default_factory=list)
    severity: str = "medium"


class EngineeringReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    repo_id: int
    generated_at: datetime
    summary: HealthSummary
    key_metrics: dict[str, int | float | str]
    highest_risk_files: list[FileMetric] = Field(default_factory=list)
    cycles: list[list[str]] = Field(default_factory=list)
    architecture_violations: list[DriftViolation] = Field(default_factory=list)
    impact: ImpactReport | None = None
    recommendations: list[Recommendation] = Field(default_factory=list)
    ai_explanation: str | None = None
    llm_available: bool = False