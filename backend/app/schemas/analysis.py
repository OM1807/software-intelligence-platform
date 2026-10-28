from pydantic import BaseModel

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