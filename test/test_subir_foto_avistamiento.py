import io
import os
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.security.auth import get_current_colaborador
from app.data.models import EstadoConservacion, Especie, Avistamiento, Usuario
from conftest import TestSession

app.dependency_overrides[get_current_colaborador] = lambda: {"email": "foto.test@demo-sway.com", "token_type": "colaborador"}

client = TestClient(app)


def _seed_avistamiento():
    db = TestSession()
    estado = EstadoConservacion(nombre="En Peligro")
    db.add(estado)
    db.commit()
    especie = Especie(nombre_comun="Tortuga", nombre_cientifico="Chelonia mydas",
                       id_estado_conservacion=estado.id)
    db.add(especie)
    usuario = db.query(Usuario).filter(Usuario.email == "foto.test@demo-sway.com").first()
    if not usuario:
        usuario = Usuario(nombre="Test", apellido_paterno="Usuario", email="foto.test@demo-sway.com", activo=True)
        db.add(usuario)
    db.commit()
    avistamiento = Avistamiento(id_especie=especie.id, id_usuario=usuario.id, notas="prueba")
    db.add(avistamiento)
    db.commit()
    avistamiento_id = avistamiento.id
    db.close()
    return avistamiento_id


@pytest.fixture(autouse=True)
def _clean_uploads():
    from app.config import UPLOAD_DIR
    yield
    if os.path.isdir(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR)


def test_upload_requires_auth():
    app.dependency_overrides.pop(get_current_colaborador, None)
    try:
        avistamiento_id = _seed_avistamiento()
        resp = client.post(
            f"/api/avistamientos/{avistamiento_id}/foto",
            files={"foto": ("photo.jpg", b"fake-bytes", "image/jpeg")},
        )
        assert resp.status_code == 401
    finally:
        app.dependency_overrides[get_current_colaborador] = lambda: {"email": "foto.test@demo-sway.com", "token_type": "colaborador"}


def test_upload_rejects_bad_content_type():
    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.txt", b"not-an-image", "text/plain")},
    )
    assert resp.status_code == 400


def test_upload_accepts_valid_jpeg_and_sets_foto_url():
    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["foto_url"].startswith("/api/uploads/avistamientos/")
    assert body["foto_url"].endswith(".jpg")

    db = TestSession()
    avistamiento = db.query(Avistamiento).filter(Avistamiento.id == avistamiento_id).first()
    assert avistamiento.foto_url == body["foto_url"]
    db.close()


def test_upload_publishes_avistamiento_updated_event(monkeypatch):
    published = []
    monkeypatch.setattr(
        "app.routers.estadisticas.publish_event",
        lambda event_type, payload: published.append((event_type, payload)),
    )

    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")},
    )
    assert resp.status_code == 200
    foto_url = resp.json()["foto_url"]

    assert len(published) == 1
    event_type, payload = published[0]
    assert event_type == "avistamiento_updated"
    assert payload == {"id": avistamiento_id, "foto_url": foto_url}
