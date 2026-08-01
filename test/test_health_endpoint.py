from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_returns_200_without_api_key():
    """El healthcheck de HAProxy no debe requerir x-api-key."""
    resp = client.get("/health")
    assert resp.status_code == 200

def test_health_body_is_status_ok():
    resp = client.get("/health")
    assert resp.json() == {"status": "ok"}
