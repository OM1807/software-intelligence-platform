import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import create_jwt
from app.core import database as database_module
from app.engine.dependency_graph import build_dependency_graph
from app.engine.parser import parse_source
from app.main import app
from app.models.schema import Analysis, ArchitectureRule, DependencyEdge, FileMetric, Repository, User


def test_multilanguage_parser_python_js_java():
    # Python
    py_code = b"def calculate(x):\n    if x > 0:\n        return x * 2\n    return 0\n"
    py_res = parse_source(py_code, ".py", "test.py")
    assert py_res is not None
    assert py_res["language"] == "python"
    assert len(py_res["functions"]) == 1
    assert py_res["functions"][0]["complexity"] == 2

    # TypeScript / JavaScript
    ts_code = b"import { api } from './api';\nexport function compute(val) {\n  if (val) { return 1; }\n  return 0;\n}\n"
    ts_res = parse_source(ts_code, ".ts", "src/compute.ts")
    assert ts_res is not None
    assert ts_res["language"] == "typescript"
    assert len(ts_res["functions"]) >= 1
    assert len(ts_res["imports"]) == 1

    # Java
    java_code = b"package com.demo;\nimport java.util.List;\npublic class Worker {\n  public void doWork() {\n    if (true) { System.out.println(1); }\n  }\n}\n"
    java_res = parse_source(java_code, ".java", "src/Worker.java")
    assert java_res is not None
    assert java_res["language"] == "java"
    assert len(java_res["classes"]) == 1


def test_multilanguage_dependency_resolution():
    files = [
        {
            "path": "src/pages/Dashboard.tsx",
            "language": "typescript",
            "loc": 50,
            "functions": [],
            "classes": [],
            "imports": [{"module": "@/api", "names": [], "level": 0}],
        },
        {
            "path": "src/api.ts",
            "language": "typescript",
            "loc": 80,
            "functions": [],
            "classes": [],
            "imports": [],
        },
    ]
    graph = build_dependency_graph(files)
    assert len(graph["edges"]) == 1
    assert graph["edges"][0][0] == "src/pages/Dashboard.tsx"
    assert graph["edges"][0][1] == "src/api.ts"


def test_authenticated_role_update():
    session = database_module.SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[database_module.get_db] = override_get_db
    client = TestClient(app)

    try:
        user = User(username="Alice Architect", role="architect")
        session.add(user)
        session.commit()
        session.refresh(user)
        token = create_jwt({"sub": str(user.id)}, 60)

        # Role update
        resp2 = client.post("/auth/role", json={"role": "administrator"}, headers={"Authorization": f"Bearer {token}"})
        assert resp2.status_code == 200
        assert resp2.json()["role"] == "administrator"
    finally:
        app.dependency_overrides.clear()
        session.close()
        client.close()


def test_architecture_rules_management_and_ai_ask():
    session = database_module.SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[database_module.get_db] = override_get_db
    client = TestClient(app)

    try:
        user = User(username="architect-user", role="architect")
        session.add(user)
        session.commit()
        session.refresh(user)

        repo = Repository(user_id=user.id, owner="octo", name="arch-repo", url="https://github.com/octo/arch-repo", status="completed")
        session.add(repo)
        session.commit()
        session.refresh(repo)

        session.add(Analysis(repo_id=repo.id, total_commits=10, total_files=2))
        session.add(FileMetric(repo_id=repo.id, path="src/api.py", language="python", loc=100, risk_score=0.4))
        session.add(DependencyEdge(repo_id=repo.id, source="src/api.py", target="src/engine.py", weight=1))
        session.commit()

        token = create_jwt({"sub": str(user.id)}, 60)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Get default rules
        rules_res = client.get(f"/analysis/{repo.id}/rules", headers=headers)
        assert rules_res.status_code == 200
        assert len(rules_res.json()) >= 3

        # 2. Create custom rule
        new_rule = {
            "rule_id": "custom-rule-1",
            "rule_name": "No direct DB access",
            "rule_description": "API cannot access DB directly",
            "source_layer": "api",
            "target_layer": "db",
            "severity": "high",
            "is_active": True,
        }
        create_res = client.post(f"/analysis/{repo.id}/rules", json=new_rule, headers=headers)
        assert create_res.status_code == 200
        rule_pk = create_res.json()["id"]

        # 3. Toggle rule
        toggle_res = client.patch(f"/analysis/{repo.id}/rules/{rule_pk}/toggle", headers=headers)
        assert toggle_res.status_code == 200
        assert toggle_res.json()["is_active"] is False

        # 4. Ask AI Assistant
        ask_res = client.post(f"/analysis/{repo.id}/ai-ask", json={"question": "What is the health and risk of this repo?"}, headers=headers)
        assert ask_res.status_code == 200
        assert "answer" in ask_res.json()
        assert len(ask_res.json()["answer"]) > 20
    finally:
        app.dependency_overrides.clear()
        session.close()
        client.close()
