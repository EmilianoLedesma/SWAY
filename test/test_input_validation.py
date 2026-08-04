from fastapi.testclient import TestClient

from app.main import app

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
