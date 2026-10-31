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
    explanation: str | None = None


class RuleCreate(BaseModel):
    rule_id: str = Field(..., min_length=2, max_length=100)
    rule_name: str = Field(..., min_length=2, max_length=200)
    rule_description: str | None = None
    source_layer: str = Field(..., min_length=1, max_length=100)
    target_layer: str = Field(..., min_length=1, max_length=100)
    severity: str = Field(default="medium")  # high | medium | low
    is_active: bool = True


class RuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    repo_id: int | None
    rule_id: str
    rule_name: str
    rule_description: str | None = None
    source_layer: str
    target_layer: str
    severity: str
    is_active: bool


class DriftViolation(BaseModel):
    source: str
    target: str
    rule: str
    severity: str  # low | medium | high


class DriftReport(BaseModel):
    repo_id: int
    violations: list[DriftViolation]
    rules: list[RuleOut] = Field(default_factory=list)
    compliance_score: float = 100.0


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


class AskAIRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)


class AskAIResponse(BaseModel):
    repo_id: int
    question: str
    answer: str
    provider: str


class SystemConfigOut(BaseModel):
    environment: str
    llm_configured: bool
    default_depth: int
    supported_languages: list[str]


class SystemConfigUpdate(BaseModel):
    llm_api_key: str | None = None
