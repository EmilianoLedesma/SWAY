import os
import tempfile

os.environ["PORTFOLIO_DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["PORTFOLIO_JWT_SECRET"] = "test-secret-key-for-tests-only"
os.environ["PORTFOLIO_USER"] = "emiliano"

from auth import hash_password  # noqa: E402

os.environ["PORTFOLIO_PASSWORD_HASH"] = hash_password("test-password-123")

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def _login_token():
    res = client.post(
        "/portfolio-api/login",
        json={"username": "emiliano", "password": "test-password-123"},
    )
    return res.json()["access_token"]


def test_login_success():
    res = client.post(
        "/portfolio-api/login",
        json={"username": "emiliano", "password": "test-password-123"},
    )
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_login_wrong_password_returns_401():
    res = client.post(
        "/portfolio-api/login",
        json={"username": "emiliano", "password": "wrong"},
    )
    assert res.status_code == 401


def test_postulations_requires_auth():
    res = client.get("/portfolio-api/postulations")
    assert res.status_code == 401


def test_postulations_crud_roundtrip():
    token = _login_token()
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
    token = _login_token()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.put(
        "/portfolio-api/postulations/does-not-exist",
        headers=headers,
        json={"status": "oferta"},
    )
    assert res.status_code == 404


def test_contact_endpoint_accepts_valid_payload():
    res = client.post(
        "/portfolio-api/contact",
        json={"name": "Ada", "email": "ada@example.com", "message": "Hola!"},
    )
    assert res.status_code == 201
