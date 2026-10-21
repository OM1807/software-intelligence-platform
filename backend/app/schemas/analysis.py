from pydantic import BaseModel

from app.schemas.metrics import FileMetric, HealthSummary


class GraphNode(BaseModel):
    id: str
    label: str


class GraphEdge(BaseModel):
    source: str
    target: str


class DependencyGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class AnalysisOut(BaseModel):
    repo_id: int
    summary: HealthSummary
    risky_files: list[FileMetric]
    explanation: str | None = None  # LLM-generated text (Phase 4)