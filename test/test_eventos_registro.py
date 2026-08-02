from datetime import date, time
from fastapi.testclient import TestClient

from app.main import app
from app.data.models import TipoEvento, Modalidad, Estatus, Usuario, Organizador, Evento
from app.security.auth import get_optional_organizador_user
from conftest import TestSession

client = TestClient(app)
_seed_counter = 0


def _seed_evento(capacidad_maxima=2):
    global _seed_counter
    _seed_counter += 1
    db = TestSession()
    tipo = TipoEvento(nombre="Conferencia")
    modalidad = Modalidad(nombre="Presencial")
    estatus_activo = Estatus(nombre="Activo")
    usuario_organizador = Usuario(nombre="Org", apellido_paterno="Test", email=f"org.registro+{_seed_counter}@demo-sway.com", activo=True)
    db.add_all([tipo, modalidad, estatus_activo, usuario_organizador])
    db.commit()
    organizador = Organizador(id_usuario=usuario_organizador.id, experiencia_eventos=0, certificado=False)
    db.add(organizador)
    db.commit()
    evento = Evento(
        titulo="Evento de prueba",
        descripcion="Prueba de registro de asistencia",
        fecha_evento=date(2026, 12, 1),
        hora_inicio=time(10, 0),
        hora_fin=time(12, 0),
        id_tipo_evento=tipo.id,
        id_modalidad=modalidad.id,
        capacidad_maxima=capacidad_maxima,
        costo=0,
        id_organizador=organizador.id,
        id_estatus=estatus_activo.id,
    )
    db.add(evento)
    db.commit()
    evento_id = evento.id
    db.close()
    return evento_id


def _override_user(user_id):
    app.dependency_overrides[get_optional_organizador_user] = lambda: {"sub": str(user_id), "token_type": "colaborador"}


def test_registrar_requires_auth():
    evento_id = _seed_evento()
    app.dependency_overrides.pop(get_optional_organizador_user, None)
    try:
        resp = client.post(f"/api/eventos/{evento_id}/registrar")
        assert resp.status_code == 401
    finally:
        _override_user(999)


def test_registrar_evento_inexistente_404():
    _override_user(1)
    resp = client.post("/api/eventos/999999/registrar")
    assert resp.status_code == 404


def test_registrar_y_aparece_en_mis_registros():
    evento_id = _seed_evento()
    _override_user(101)
    resp = client.post(f"/api/eventos/{evento_id}/registrar")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    mis = client.get("/api/eventos/mis-registros")
    assert mis.status_code == 200
    ids = [e["id"] for e in mis.json()["eventos"]]
    assert evento_id in ids


def test_registrar_duplicado_rechazado():
    evento_id = _seed_evento()
    _override_user(102)
    primero = client.post(f"/api/eventos/{evento_id}/registrar")
    assert primero.status_code == 200
    segundo = client.post(f"/api/eventos/{evento_id}/registrar")
    assert segundo.status_code == 400


def test_capacidad_llena_rechaza_registro():
    evento_id = _seed_evento(capacidad_maxima=1)
    _override_user(103)
    primero = client.post(f"/api/eventos/{evento_id}/registrar")
    assert primero.status_code == 200

    _override_user(104)
    segundo = client.post(f"/api/eventos/{evento_id}/registrar")
    assert segundo.status_code == 400


def test_cancelar_asistencia():
    evento_id = _seed_evento()
    _override_user(105)
    client.post(f"/api/eventos/{evento_id}/registrar")

    cancelar = client.delete(f"/api/eventos/{evento_id}/registrar")
    assert cancelar.status_code == 200

    mis = client.get("/api/eventos/mis-registros")
    ids = [e["id"] for e in mis.json()["eventos"]]
    assert evento_id not in ids


def test_cancelar_sin_registro_404():
    evento_id = _seed_evento()
    _override_user(106)
    resp = client.delete(f"/api/eventos/{evento_id}/registrar")
    assert resp.status_code == 404


def test_get_eventos_incluye_conteo_registrados():
    evento_id = _seed_evento()
    _override_user(107)
    client.post(f"/api/eventos/{evento_id}/registrar")

    listado = client.get("/api/eventos")
    evento = next(e for e in listado.json()["eventos"] if e["id"] == evento_id)
    assert evento["registrados"] >= 1


def test_registrar_evento_cancelado_404():
    db = TestSession()
    tipo = TipoEvento(nombre="Conferencia")
    modalidad = Modalidad(nombre="Presencial")
    estatus_cancelado = Estatus(nombre="Cancelado")
    usuario_organizador = Usuario(nombre="Org", apellido_paterno="Test", email="org.registro.cancelado@demo-sway.com", activo=True)
    db.add_all([tipo, modalidad, estatus_cancelado, usuario_organizador])
    db.commit()
    organizador = Organizador(id_usuario=usuario_organizador.id, experiencia_eventos=0, certificado=False)
    db.add(organizador)
    db.commit()
    evento = Evento(
        titulo="Evento cancelado",
        descripcion="Prueba de evento cancelado",
        fecha_evento=date(2026, 12, 1),
        hora_inicio=time(10, 0),
        hora_fin=time(12, 0),
        id_tipo_evento=tipo.id,
        id_modalidad=modalidad.id,
        capacidad_maxima=2,
        costo=0,
        id_organizador=organizador.id,
        id_estatus=estatus_cancelado.id,
    )
    db.add(evento)
    db.commit()
    evento_id = evento.id
    db.close()

    _override_user(108)
    resp = client.post(f"/api/eventos/{evento_id}/registrar")
    assert resp.status_code == 404
