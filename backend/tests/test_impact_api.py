import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import create_jwt
from app.core import database as database_module
from app.main import app
from app.models.schema import Analysis, DependencyEdge, FileMetric, Repository, User

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
database_module.engine = engine
database_module.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
database_module.Base.metadata.create_all(bind=engine)


def test_change_impact_endpoint_returns_reverse_graph_impact():
    session = database_module.SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[database_module.get_db] = override_get_db
    client = TestClient(app)

    try:
        user = User(username="impact-user")
        session.add(user)
        session.commit()
        session.refresh(user)

        repo = Repository(
            user_id=user.id,
            owner="octo",
            name="impact-demo",
            url="https://github.com/octo/impact-demo",
            status="completed",
        )
        session.add(repo)
        session.commit()
        session.refresh(repo)

        session.add(
            Analysis(
                repo_id=repo.id,
                total_commits=7,
                total_files=3,
                timeline=[{"date": "2024-11", "commits": 7}],
                cycles=[],
                graph_stats={"nodes": 3, "edges": 2},
            )
        )
        session.add_all(
            [
                FileMetric(
                    repo_id=repo.id,
                    path="src/core/service.py",
                    language="python",
                    loc=120,
                    avg_complexity=12.0,
                    max_complexity=20,
                    commits=4,
                    lines_added=60,
                    lines_deleted=10,
                    authors=2,
                    fan_in=1,
                    fan_out=1,
                    centrality=0.5,
                    instability=0.5,
                    in_cycle=False,
                    parse_errors=False,
                    risk_score=0.4,
                ),
                FileMetric(
                    repo_id=repo.id,
                    path="src/api/routes.py",
                    language="python",
                    loc=180,
                    avg_complexity=18.0,
                    max_complexity=30,
                    commits=5,
                    lines_added=120,
                    lines_deleted=15,
                    authors=3,
                    fan_in=2,
                    fan_out=1,
                    centrality=0.7,
                    instability=0.4,
                    in_cycle=False,
                    parse_errors=False,
                    risk_score=0.8,
                ),
            ]
        )
        session.add_all(
            [
                DependencyEdge(repo_id=repo.id, source="src/api/routes.py", target="src/core/service.py", weight=1),
            ]
        )
        session.commit()

        token = create_jwt({"sub": str(user.id)}, 60)
        response = client.post(
            f"/analysis/{repo.id}/impact",
            json={"changed_files": ["src/core/service.py"], "depth": 2, "limit": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["changed_files"] == ["src/core/service.py"]
        assert payload["impacted_files"][0]["path"] == "src/api/routes.py"
        assert payload["impacted_files"][0]["relationship"] == "direct"
    finally:
        app.dependency_overrides.clear()
        session.close()
        client.close()
