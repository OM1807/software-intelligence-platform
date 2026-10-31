from datetime import datetime, timezone
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="developer")  # developer | architect | administrator
    github_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    repositories: Mapped[list["Repository"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    owner: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(500))
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    # pending | processing | completed | failed
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_analyzed: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    local_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    owner_user: Mapped["User"] = relationship(back_populates="repositories")


class Analysis(Base):
    """Repo-level results of the latest analysis run (one row per repo)."""
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), unique=True)
    total_commits: Mapped[int] = mapped_column(Integer, default=0)
    contributors: Mapped[int] = mapped_column(Integer, default=0)
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    timeline: Mapped[list] = mapped_column(JSON, default=list)  # [{"date": "2026-07", "commits": 12}]
    cycles: Mapped[list] = mapped_column(JSON, default=list)  # [[path, path, ...], ...] circular dependency groups
    graph_stats: Mapped[dict] = mapped_column(JSON, default=dict)  # {"nodes", "edges", "cycles", ...}
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class FileMetric(Base):
    """Per-file metrics: parser output + git churn. Risk engine fills risk_score."""
    __tablename__ = "file_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(1000))
    language: Mapped[str] = mapped_column(String(30))
    loc: Mapped[int] = mapped_column(Integer, default=0)
    num_functions: Mapped[int] = mapped_column(Integer, default=0)
    num_classes: Mapped[int] = mapped_column(Integer, default=0)
    avg_complexity: Mapped[float] = mapped_column(Float, default=0.0)
    max_complexity: Mapped[int] = mapped_column(Integer, default=0)
    commits: Mapped[int] = mapped_column(Integer, default=0)
    lines_added: Mapped[int] = mapped_column(Integer, default=0)
    lines_deleted: Mapped[int] = mapped_column(Integer, default=0)
    authors: Mapped[int] = mapped_column(Integer, default=0)
    last_modified: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    parse_errors: Mapped[bool] = mapped_column(Boolean, default=False)
    # dependency-graph metrics
    fan_in: Mapped[int] = mapped_column(Integer, default=0)  # files that import this file
    fan_out: Mapped[int] = mapped_column(Integer, default=0)  # files this file imports
    centrality: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1 PageRank, 1 = most central
    instability: Mapped[float] = mapped_column(Float, default=0.0)  # fan_out / (fan_in + fan_out)
    in_cycle: Mapped[bool] = mapped_column(Boolean, default=False)
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    structure: Mapped[dict] = mapped_column(JSON, default=dict)


class DependencyEdge(Base):
    """One 'source imports target' relation between two files of a repo."""
    __tablename__ = "dependency_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(1000))
    target: Mapped[str] = mapped_column(String(1000))
    weight: Mapped[int] = mapped_column(Integer, default=1)  # number of import statements


class ArchitectureRule(Base):
    """Configurable layer dependency constraints for architecture validation."""
    __tablename__ = "architecture_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    repo_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True)
    rule_id: Mapped[str] = mapped_column(String(100), index=True)
    rule_name: Mapped[str] = mapped_column(String(200))
    rule_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_layer: Mapped[str] = mapped_column(String(200))  # e.g. "api", "controllers", "ui"
    target_layer: Mapped[str] = mapped_column(String(200))  # e.g. "engine", "models", "db"
    severity: Mapped[str] = mapped_column(String(20), default="medium")  # high | medium | low
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
