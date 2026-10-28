import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import create_jwt, decode_jwt
from app.core import database as database_module
from app.main import app
from app.models.schema import Repository, User

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
database_module.engine = engine
database_module.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
database_module.Base.metadata.create_all(bind=engine)


def test_health_and_openapi_are_available():
    client = TestClient(app)
    try:
        assert client.get("/health").status_code == 200
        openapi = client.get("/openapi.json")
        assert openapi.status_code == 200
        assert "paths" in openapi.json()
    finally:
        client.close()


def test_invalid_jwt_and_missing_auth_are_rejected():
    client = TestClient(app)
    try:
        response = client.get("/repositories", headers={"Authorization": "Bearer bad-token"})
        assert response.status_code == 401
        unauth = client.get("/repositories")
        assert unauth.status_code == 401
    finally:
        client.close()


def test_repository_url_validation_and_owner_isolation():
    session = database_module.SessionLocal()
    def override_get_db():
        try:
            yield session
        finally:
            pass
    app.dependency_overrides[database_module.get_db] = override_get_db
    client = TestClient(app)
    try:
        user = User(username="repo-user")
        other = User(username="other-user")
        session.add_all([user, other])
        session.commit()
        session.refresh(user)
        session.refresh(other)

        repo = Repository(user_id=user.id, owner="octo", name="demo", url="https://github.com/octo/demo", status="completed")
        session.add(repo)
        session.commit()

        token = create_jwt({"sub": str(user.id)}, 60)
        bad = client.post("/repositories/import", json={"url": "https://github.com/octo/invalid"}, headers={"Authorization": f"Bearer {token}"})
        assert bad.status_code == 200

        invalid = client.post("/repositories/import", json={"url": "https://example.com/octo/demo"}, headers={"Authorization": f"Bearer {token}"})
        assert invalid.status_code == 400

        other_token = create_jwt({"sub": str(other.id)}, 60)
        other_call = client.get(f"/repositories/{repo.id}", headers={"Authorization": f"Bearer {other_token}"})
        assert other_call.status_code == 404
    finally:
        app.dependency_overrides.clear()
        session.close()
        client.close()


def test_oauth_state_and_jwt_round_trip_are_valid():
    state = create_jwt({"purpose": "oauth_state"}, 10)
    payload = decode_jwt(state)
    assert payload["purpose"] == "oauth_state"
    assert payload["exp"] > 0
