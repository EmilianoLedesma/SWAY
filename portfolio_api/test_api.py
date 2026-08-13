# portfolio_api/test_api.py
import os
import tempfile

os.environ["PORTFOLIO_DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["PORTFOLIO_JWT_SECRET"] = "test-secret-key-for-tests-only"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import app, limiter  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    limiter.reset()
    yield


def _register_and_login(username="alice", password="alice-password-123"):
    reg = client.post(
        "/portfolio-api/register", json={"username": username, "password": password}
    )
    assert reg.status_code == 201
    res = client.post(
        "/portfolio-api/login", json={"username": username, "password": password}
    )
    return res.json()["access_token"]


def test_register_success():
    res = client.post(
        "/portfolio-api/register",
        json={"username": "newuser1", "password": "somepassword"},
    )
    assert res.status_code == 201


def test_register_duplicate_username_returns_409():
    client.post(
        "/portfolio-api/register",
        json={"username": "dupuser", "password": "somepassword"},
    )
    res = client.post(
        "/portfolio-api/register",
        json={"username": "dupuser", "password": "differentpassword"},
    )
    assert res.status_code == 409


def test_login_success():
    token = _register_and_login("bob", "bob-password-123")
    assert token


def test_login_wrong_password_returns_401():
    client.post(
        "/portfolio-api/register", json={"username": "carol", "password": "realpass"}
    )
    res = client.post(
        "/portfolio-api/login", json={"username": "carol", "password": "wrong"}
    )
    assert res.status_code == 401


def test_login_unknown_user_returns_401():
    res = client.post(
        "/portfolio-api/login", json={"username": "nobody", "password": "x"}
    )
    assert res.status_code == 401


def test_postulations_requires_auth():
    res = client.get("/portfolio-api/postulations")
    assert res.status_code == 401


def test_postulations_crud_roundtrip():
    token = _register_and_login("dave", "dave-password-123")
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post(
        "/portfolio-api/postulations",
        headers=headers,
        json={
            "id": "test-co",
            "company": "Test Co",
            "role": "QA Intern",
            "location": "Remote",
            "salary": "$1000/mes",
            "schedule": "",
            "date_applied": "2026-08-13",
            "source": "Test",
            "requirements": "curiosity",
            "notes": "",
            "status": "postulado",
        },
    )
    assert create_res.status_code == 201

    list_res = client.get("/portfolio-api/postulations", headers=headers)
    assert any(p["id"] == "test-co" for p in list_res.json())

    update_res = client.put(
        "/portfolio-api/postulations/test-co",
        headers=headers,
        json={"status": "entrevista"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "entrevista"

    delete_res = client.delete("/portfolio-api/postulations/test-co", headers=headers)
    assert delete_res.status_code == 204

    list_after = client.get("/portfolio-api/postulations", headers=headers)
    assert not any(p["id"] == "test-co" for p in list_after.json())


def test_update_unknown_postulation_returns_404():
    token = _register_and_login("erin", "erin-password-123")
    headers = {"Authorization": f"Bearer {token}"}
    res = client.put(
        "/portfolio-api/postulations/does-not-exist",
        headers=headers,
        json={"status": "oferta"},
    )
    assert res.status_code == 404


def test_cross_user_isolation():
    token_a = _register_and_login("frank", "frank-password-123")
    token_b = _register_and_login("grace", "grace-password-123")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    client.post(
        "/portfolio-api/postulations",
        headers=headers_a,
        json={
            "id": "frank-only",
            "company": "Frank Co",
            "role": "Dev",
            "location": "",
            "salary": "",
            "schedule": "",
            "date_applied": "2026-08-13",
            "source": "",
            "requirements": "",
            "notes": "",
            "status": "postulado",
        },
    )

    # B's list doesn't include A's postulation
    list_b = client.get("/portfolio-api/postulations", headers=headers_b)
    assert not any(p["id"] == "frank-only" for p in list_b.json())

    # B can't update A's postulation — 404, not 403
    update_res = client.put(
        "/portfolio-api/postulations/frank-only",
        headers=headers_b,
        json={"status": "oferta"},
    )
    assert update_res.status_code == 404

    # B can't delete A's postulation either
    delete_res = client.delete(
        "/portfolio-api/postulations/frank-only", headers=headers_b
    )
    assert delete_res.status_code == 404

    # A still sees it, untouched
    list_a = client.get("/portfolio-api/postulations", headers=headers_a)
    match = next(p for p in list_a.json() if p["id"] == "frank-only")
    assert match["status"] == "postulado"
