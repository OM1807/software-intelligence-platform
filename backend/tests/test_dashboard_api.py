import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import create_jwt
from app.core import database as database_module
from app.main import app
from app.models.schema import Analysis, FileMetric, Repository, User

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
database_module.engine = engine
database_module.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
database_module.Base.metadata.create_all(bind=engine)


def test_dashboard_uses_analysis_and_metric_rows():
    session = database_module.SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[database_module.get_db] = override_get_db
    client = TestClient(app)

    try:
        user = User(username="dashboard-user-4")
        session.add(user)
        session.commit()
        session.refresh(user)

        repo = Repository(
            user_id=user.id,
            owner="octo",
            name="dashboard-demo",
            url="https://github.com/octo/dashboard-demo",
            status="completed",
        )
        session.add(repo)
        session.commit()
        session.refresh(repo)

        session.add(
            Analysis(
                repo_id=repo.id,
                total_commits=24,
                total_files=2,
                timeline=[{"date": "2024-10", "commits": 10}, {"date": "2024-11", "commits": 14}],
                cycles=[],
                graph_stats={"nodes": 2, "edges": 1},
            )
        )
        session.add_all(
            [
                FileMetric(
                    repo_id=repo.id,
                    path="src/services/service.py",
                    language="python",
                    loc=180,
                    avg_complexity=18.0,
                    max_complexity=26,
                    commits=12,
                    lines_added=200,
                    lines_deleted=30,
                    authors=4,
                    fan_in=5,
                    fan_out=4,
                    centrality=0.75,
                    instability=0.45,
                    in_cycle=False,
                    parse_errors=False,
                    risk_score=0.72,
                ),
                FileMetric(
                    repo_id=repo.id,
                    path="src/core/util.py",
                    language="python",
                    loc=40,
                    avg_complexity=2.0,
                    max_complexity=5,
                    commits=1,
                    lines_added=20,
                    lines_deleted=5,
                    authors=1,
                    fan_in=1,
                    fan_out=0,
                    centrality=0.1,
                    instability=0.0,
                    in_cycle=False,
                    parse_errors=False,
                    risk_score=0.15,
                ),
            ]
        )
        session.commit()

        token = create_jwt({"sub": str(user.id)}, 60)
        response = client.get(f"/dashboard/{repo.id}", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["summary"]["total_commits"] == 24
        assert payload["summary"]["total_files"] == 2
        assert len(payload["timeline"]) == 2
        assert 0.0 <= payload["summary"]["health_index"] <= 100.0
    finally:
        app.dependency_overrides.clear()
        session.close()
        client.close()
