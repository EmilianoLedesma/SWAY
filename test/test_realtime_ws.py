from fastapi.testclient import TestClient

from app.main import app
from app.data.models import Usuario
from app.security.auth import create_token
from conftest import TestSession
from app.realtime.manager import manager

client = TestClient(app)


def _seed_usuario_and_token(token_type="colaborador"):
    db = TestSession()
    usuario = Usuario(nombre="WS", apellido_paterno="Test", email=f"ws.test.{token_type}@demo-sway.com", activo=True)
    db.add(usuario)
    db.commit()
    usuario_id = usuario.id
    db.close()
    token = create_token({"sub": str(usuario_id), "token_type": token_type})
    return token


def test_ws_closes_without_auth_message():
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "not_auth"})
        try:
            ws.receive_text()
            assert False, "expected connection to close"
        except Exception:
            pass
    assert len(manager.active) == 0


def test_ws_closes_with_invalid_token():
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": "not-a-real-token"})
        try:
            ws.receive_text()
            assert False, "expected connection to close"
        except Exception:
            pass
    assert len(manager.active) == 0


def test_ws_closes_with_wrong_token_type():
    token = _seed_usuario_and_token(token_type="tienda")
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        try:
            ws.receive_text()
            assert False, "expected connection to close"
        except Exception:
            pass
    assert len(manager.active) == 0


def test_ws_accepts_valid_colaborador_token_and_registers_connection():
    import time
    token = _seed_usuario_and_token(token_type="colaborador")
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        # send_json only enqueues the message — poll instead of a fixed sleep, since
        # nothing guarantees the server coroutine has processed it within any fixed window.
        for _ in range(40):
            if manager.active:
                break
            time.sleep(0.05)
        assert len(manager.active) == 1
    assert len(manager.active) == 0  # cleaned up after the context manager closes the socket
