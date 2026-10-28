"""Initial schema for SIP backend

Revision ID: 20261028_initial
Revises:
Create Date: 2026-10-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261028_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("github_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("github_token", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("github_id"),
    )
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "repositories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("owner", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("last_analyzed", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_repositories_user_id"), "repositories", ["user_id"], unique=False)

    op.create_table(
        "analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repo_id", sa.Integer(), nullable=False),
        sa.Column("total_commits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("contributors", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_files", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timeline", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("cycles", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("graph_stats", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["repo_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repo_id"),
    )

    op.create_table(
        "file_metrics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repo_id", sa.Integer(), nullable=False),
        sa.Column("path", sa.String(length=1000), nullable=False),
        sa.Column("language", sa.String(length=30), nullable=False),
        sa.Column("loc", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("num_functions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("num_classes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_complexity", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_complexity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("commits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lines_added", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lines_deleted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("authors", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_modified", sa.DateTime(), nullable=True),
        sa.Column("parse_errors", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fan_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fan_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("centrality", sa.Float(), nullable=False, server_default="0"),
        sa.Column("instability", sa.Float(), nullable=False, server_default="0"),
        sa.Column("in_cycle", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("structure", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.ForeignKeyConstraint(["repo_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_file_metrics_repo_id"), "file_metrics", ["repo_id"], unique=False)

    op.create_table(
        "dependency_edges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repo_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=1000), nullable=False),
        sa.Column("target", sa.String(length=1000), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["repo_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dependency_edges_repo_id"), "dependency_edges", ["repo_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_dependency_edges_repo_id"), table_name="dependency_edges")
    op.drop_table("dependency_edges")
    op.drop_index(op.f("ix_file_metrics_repo_id"), table_name="file_metrics")
    op.drop_table("file_metrics")
    op.drop_table("analyses")
    op.drop_index(op.f("ix_repositories_user_id"), table_name="repositories")
    op.drop_table("repositories")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
