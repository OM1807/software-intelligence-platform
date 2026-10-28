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


def test_analysis_endpoint_uses_persisted_metrics_and_status_checks():
    session = database_module.SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[database_module.get_db] = override_get_db
    client = TestClient(app)

    try:
        user = User(username="analysis-user-1")
        session.add(user)
        session.commit()
        session.refresh(user)

        repo = Repository(
            user_id=user.id,
            owner="octo",
            name="demo-repo",
            url="https://github.com/octo/demo-repo",
            status="completed",
        )
        session.add(repo)
        session.commit()
        session.refresh(repo)

        session.add(
            Analysis(
                repo_id=repo.id,
                total_commits=18,
                total_files=2,
                timeline=[{"date": "2024-10", "commits": 18}],
                cycles=[],
                graph_stats={"nodes": 2, "edges": 1},
            )
        )
        session.add_all(
            [
                FileMetric(
                    repo_id=repo.id,
                    path="src/api/routes.py",
                    language="python",
                    loc=220,
                    avg_complexity=20.0,
                    max_complexity=34,
                    commits=9,
                    lines_added=200,
                    lines_deleted=60,
                    authors=3,
                    fan_in=4,
                    fan_out=3,
                    centrality=0.75,
                    instability=0.4,
                    in_cycle=False,
                    parse_errors=False,
                    risk_score=0.8,
                ),
                FileMetric(
                    repo_id=repo.id,
                    path="src/utils/helpers.py",
                    language="python",
                    loc=80,
                    avg_complexity=2.5,
                    max_complexity=4,
                    commits=3,
                    lines_added=25,
                    lines_deleted=8,
                    authors=1,
                    fan_in=1,
                    fan_out=1,
                    centrality=0.12,
                    instability=0.2,
                    in_cycle=False,
                    parse_errors=False,
                    risk_score=0.1,
                ),
            ]
        )
        session.commit()

        token = create_jwt({"sub": str(user.id)}, 60)
        response = client.get(f"/analysis/{repo.id}", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["summary"]["total_files"] == 2
        assert payload["summary"]["high_risk_files"] >= 1
        assert payload["risky_files"][0]["path"] == "src/api/routes.py"

        repo.status = "processing"
        session.commit()
        blocked = client.get(f"/analysis/{repo.id}", headers={"Authorization": f"Bearer {token}"})
        assert blocked.status_code == 409
    finally:
        app.dependency_overrides.clear()
        session.close()
        client.close()
