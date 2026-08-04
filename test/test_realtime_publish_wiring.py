from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.data.models import EstadoConservacion, Especie
from conftest import TestSession

client = TestClient(app)


def _seed_especie():
    db = TestSession()
    estado = EstadoConservacion(nombre="En Peligro")
    db.add(estado)
    db.commit()
    especie = Especie(nombre_comun="Delfin", nombre_cientifico="Delphinus delphis",
                       id_estado_conservacion=estado.id)
    db.add(especie)
    db.commit()
    especie_id = especie.id
    db.close()
    return especie_id


def test_reportar_avistamiento_publishes_event():
    especie_id = _seed_especie()
    payload = {
        "id_especie": especie_id,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 10.5,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "realtime.wiring@demo-sway.com",
        "notas": "prueba realtime",
    }
    with patch("app.routers.estadisticas.publish_event") as mock_publish:
        resp = client.post("/api/reportar-avistamiento", json=payload)
    assert resp.status_code == 200
    mock_publish.assert_called_once()
    event_type, event_payload = mock_publish.call_args[0]
    assert event_type == "avistamiento_created"
    assert event_payload["id"] == resp.json()["id"]


def test_reportar_avistamiento_does_not_publish_on_validation_error():
    with patch("app.routers.estadisticas.publish_event") as mock_publish:
        resp = client.post("/api/reportar-avistamiento", json={
            "id_especie": 999999,
            "fecha_avistamiento": "2026-08-01T10:00:00",
            "latitud": 10.5,
            "longitud": -20.5,
            "nombre_usuario": "Test",
            "email_usuario": "realtime.fail@demo-sway.com",
        })
    assert resp.status_code == 400
    mock_publish.assert_not_called()


def test_eliminar_avistamiento_publishes_avistamiento_deleted():
    from app.security.auth import get_current_colaborador
    especie_id = _seed_especie()
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    try:
        create_resp = client.post("/api/reportar-avistamiento", json={
            "id_especie": especie_id,
            "fecha_avistamiento": "2026-08-01T10:00:00",
            "latitud": 10.5,
            "longitud": -20.5,
            "nombre_usuario": "Test Usuario",
            "email_usuario": "realtime.delete@demo-sway.com",
        })
        avistamiento_id = create_resp.json()["id"]

        with patch("app.routers.estadisticas.publish_event") as mock_publish:
            resp = client.delete(f"/api/avistamientos/{avistamiento_id}")
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("avistamiento_deleted", {"id": avistamiento_id})
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_delete_especie_publishes_especie_deleted():
    from app.security.auth import get_current_colaborador
    especie_id = _seed_especie()
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    try:
        with patch("app.routers.especies.publish_event") as mock_publish:
            resp = client.delete(f"/api/especies/{especie_id}")
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("especie_deleted", {"id": especie_id})
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_create_especie_publishes_especie_created():
    from app.security.auth import get_current_colaborador
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    db = TestSession()
    estado = EstadoConservacion(nombre="Vulnerable")
    db.add(estado)
    db.commit()
    estado_id = estado.id
    db.close()
    try:
        with patch("app.routers.especies.publish_event") as mock_publish:
            resp = client.post("/api/especies", json={
                "nombre_comun": "Ballena Jorobada",
                "nombre_cientifico": "Megaptera novaeangliae",
                "id_estado_conservacion": estado_id,
            })
        assert resp.status_code == 200
        mock_publish.assert_called_once()
        event_type, event_payload = mock_publish.call_args[0]
        assert event_type == "especie_created"
        assert event_payload["id"] == resp.json()["especie_id"]
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_update_especie_publishes_especie_updated():
    from app.security.auth import get_current_colaborador
    especie_id = _seed_especie()
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    try:
        with patch("app.routers.especies.publish_event") as mock_publish:
            resp = client.put(f"/api/especies/{especie_id}", json={
                "nombre_comun": "Delfin Actualizado",
                "nombre_cientifico": "Delphinus delphis",
                "id_estado_conservacion": None,
            })
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("especie_updated", {"id": especie_id, "nombre_comun": "Delfin Actualizado"})
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_crear_evento_publishes_evento_created():
    from app.data.models import TipoEvento, Modalidad

    db = TestSession()
    tipo = TipoEvento(nombre="Taller")
    modalidad = Modalidad(nombre="Presencial")
    db.add_all([tipo, modalidad])
    db.commit()
    tipo_id, modalidad_id = tipo.id, modalidad.id
    db.close()

    with patch("app.routers.eventos.publish_event") as mock_publish:
        resp = client.post("/api/eventos/crear", json={
            "titulo": "Limpieza de playa de prueba",
            "descripcion": "Evento de prueba para wiring de realtime",
            "fecha_evento": "2026-12-01",
            "hora_inicio": "09:00",
            "id_tipo_evento": tipo_id,
            "id_modalidad": modalidad_id,
            "contacto": "evento.wiring@demo-sway.com",
        })
    assert resp.status_code == 200
    mock_publish.assert_called_once()
    event_type, event_payload = mock_publish.call_args[0]
    assert event_type == "evento_created"
    assert event_payload["id"] == resp.json()["evento_id"]


def test_eliminar_evento_publishes_evento_deleted():
    from datetime import date, time
    from app.data.models import TipoEvento, Modalidad, Estatus, Evento

    db = TestSession()
    tipo = TipoEvento(nombre="Conferencia")
    modalidad = Modalidad(nombre="Virtual")
    estatus = Estatus(nombre="Activo")
    db.add_all([tipo, modalidad, estatus])
    db.commit()
    evento = Evento(
        titulo="Evento a eliminar", descripcion="Prueba de wiring",
        fecha_evento=date(2026, 12, 1), hora_inicio=time(10, 0),
        id_tipo_evento=tipo.id, id_modalidad=modalidad.id,
        capacidad_maxima=10, costo=0, id_estatus=estatus.id,
    )
    db.add(evento)
    db.commit()
    evento_id = evento.id
    db.close()

    from app.security.auth import get_optional_organizador_user
    app.dependency_overrides[get_optional_organizador_user] = lambda: {"sub": "1", "token_type": "colaborador"}
    try:
        with patch("app.routers.eventos.publish_event") as mock_publish:
            resp = client.delete(f"/api/eventos/{evento_id}")
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("evento_deleted", {"id": evento_id})
    finally:
        app.dependency_overrides.pop(get_optional_organizador_user, None)
