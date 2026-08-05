from fastapi.testclient import TestClient

from app.main import app
from app.security.auth import get_current_colaborador

client = TestClient(app)


def test_newsletter_rejects_malformed_email():
    resp = client.post("/api/newsletter", json={"email": "not-an-email"})
    assert resp.status_code == 422


def test_contacto_rejects_malformed_email():
    resp = client.post("/api/contacto", json={
        "name": "Juan Perez",
        "email": "not-an-email",
        "subject": "Consulta de prueba",
        "message": "Este es un mensaje de prueba con longitud suficiente.",
    })
    assert resp.status_code == 422


def test_donacion_rejects_malformed_email():
    resp = client.post("/api/procesar-donacion", json={
        "amount": 100.0,
        "contact_name": "Maria Garcia",
        "contact_email": "not-an-email",
        "payment_method": "credit_card",
    })
    assert resp.status_code == 422


def test_reportar_avistamiento_rejects_malformed_email():
    resp = client.post("/api/reportar-avistamiento", json={
        "id_especie": 1,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 10.5,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "not-an-email",
    })
    assert resp.status_code == 422


def test_colaborador_register_rejects_non_digit_años_experiencia():
    resp = client.post("/api/colaboradores/register", json={
        "nombre": "Ana",
        "email": "ana.validation@demo-sway.com",
        "password": "password123",
        "especialidad": "Biologia Marina",
        "grado_academico": "Maestria",
        "institucion": "UPQ",
        "años_experiencia": "abc",
        "motivacion": "Motivacion de prueba con longitud suficiente.",
    })
    assert resp.status_code == 422


def test_colaborador_register_accepts_digit_años_experiencia():
    resp = client.post("/api/colaboradores/register", json={
        "nombre": "Ana",
        "email": "ana.validation2@demo-sway.com",
        "password": "password123",
        "especialidad": "Biologia Marina",
        "grado_academico": "Maestria",
        "institucion": "UPQ",
        "años_experiencia": "5",
        "motivacion": "Motivacion de prueba con longitud suficiente.",
    })
    assert resp.status_code == 200


def test_evento_crear_rejects_malformed_fecha():
    resp = client.post("/api/eventos/crear", json={
        "titulo": "Evento de prueba de validacion",
        "descripcion": "Descripcion de prueba con longitud suficiente.",
        "fecha_evento": "9999-99-99",
        "hora_inicio": "09:00",
        "id_tipo_evento": 1,
        "id_modalidad": 1,
        "contacto": "evento.validation@demo-sway.com",
    })
    assert resp.status_code == 422


def test_evento_crear_rejects_malformed_hora():
    resp = client.post("/api/eventos/crear", json={
        "titulo": "Evento de prueba de validacion",
        "descripcion": "Descripcion de prueba con longitud suficiente.",
        "fecha_evento": "2026-12-01",
        "hora_inicio": "25:99",
        "id_tipo_evento": 1,
        "id_modalidad": 1,
        "contacto": "evento.validation@demo-sway.com",
    })
    assert resp.status_code == 422


def test_reportar_avistamiento_rejects_out_of_range_latitud():
    resp = client.post("/api/reportar-avistamiento", json={
        "id_especie": 1,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 95.0,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "avistamiento.lat@demo-sway.com",
    })
    assert resp.status_code == 422


def test_reportar_avistamiento_rejects_out_of_range_longitud():
    resp = client.post("/api/reportar-avistamiento", json={
        "id_especie": 1,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 10.5,
        "longitud": -200.0,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "avistamiento.lon@demo-sway.com",
    })
    assert resp.status_code == 422


def test_reportar_avistamiento_rejects_malformed_fecha():
    resp = client.post("/api/reportar-avistamiento", json={
        "id_especie": 1,
        "fecha_avistamiento": "no-es-una-fecha",
        "latitud": 10.5,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "avistamiento.fecha@demo-sway.com",
    })
    assert resp.status_code == 422


def test_evento_crear_rejects_missing_terminos_aceptados():
    resp = client.post("/api/eventos/crear", json={
        "titulo": "Evento de prueba de validacion",
        "descripcion": "Descripcion de prueba con longitud suficiente.",
        "fecha_evento": "2026-12-01",
        "hora_inicio": "09:00",
        "id_tipo_evento": 1,
        "id_modalidad": 1,
        "contacto": "evento.terminos@demo-sway.com",
    })
    assert resp.status_code == 422


def test_evento_crear_rejects_terminos_not_accepted():
    resp = client.post("/api/eventos/crear", json={
        "titulo": "Evento de prueba de validacion",
        "descripcion": "Descripcion de prueba con longitud suficiente.",
        "fecha_evento": "2026-12-01",
        "hora_inicio": "09:00",
        "id_tipo_evento": 1,
        "id_modalidad": 1,
        "contacto": "evento.terminos2@demo-sway.com",
        "terminos_aceptados": False,
    })
    assert resp.status_code == 400


def test_evento_crear_rejects_invalid_tipo_evento():
    resp = client.post("/api/eventos/crear", json={
        "titulo": "Evento de prueba de validacion",
        "descripcion": "Descripcion de prueba con longitud suficiente.",
        "fecha_evento": "2026-12-01",
        "hora_inicio": "09:00",
        "id_tipo_evento": 999999,
        "id_modalidad": 1,
        "contacto": "evento.tipo@demo-sway.com",
        "terminos_aceptados": True,
    })
    assert resp.status_code == 400


def test_login_rejects_malformed_email():
    resp = client.post("/api/user/login", json={
        "email": "not-an-email",
        "password": "password123",
    })
    assert resp.status_code == 422


def test_colaborador_login_rejects_malformed_email():
    resp = client.post("/api/colaboradores/login", json={
        "email": "not-an-email",
        "password": "password123",
    })
    assert resp.status_code == 422


def test_colaborador_perfil_rejects_out_of_range_años_experiencia():
    app.dependency_overrides[get_current_colaborador] = lambda: {"email": "perfil.validation@demo-sway.com", "token_type": "colaborador"}
    try:
        resp = client.put("/api/colaboradores/perfil", json={"años_experiencia": "150"})
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_colaborador_perfil_rejects_malformed_cedula():
    app.dependency_overrides[get_current_colaborador] = lambda: {"email": "perfil.validation@demo-sway.com", "token_type": "colaborador"}
    try:
        resp = client.put("/api/colaboradores/perfil", json={"numero_cedula": "123"})
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_colaborador_perfil_rejects_malformed_orcid():
    app.dependency_overrides[get_current_colaborador] = lambda: {"email": "perfil.validation@demo-sway.com", "token_type": "colaborador"}
    try:
        resp = client.put("/api/colaboradores/perfil", json={"orcid": "not-an-orcid"})
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_especie_crear_rejects_poblacion_estimada_overflowing_postgres_integer():
    # Reported bug: 8568668866666666 overflows Postgres INTEGER (max 2147483647).
    # SQLite (used in this test suite) has no such limit and would silently accept
    # it, so this must be rejected by Pydantic before it ever reaches the DB.
    app.dependency_overrides[get_current_colaborador] = lambda: {"email": "especie.validation@demo-sway.com", "colaborador_id": 1, "token_type": "colaborador"}
    try:
        resp = client.post("/api/especies", json={
            "nombre_comun": "Gf tx8yd",
            "nombre_cientifico": "Y6",
            "descripcion": "Hfjchvjgfhvdh",
            "esperanza_vida": 500,
            "poblacion_estimada": 8568668866666666,
            "id_estado_conservacion": 6,
        })
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)
