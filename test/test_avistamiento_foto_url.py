from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.data.database import get_db, Base
from app.security.api_key import require_api_key
from app.data.models import EstadoConservacion, Especie

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_api_key] = lambda: True

client = TestClient(app)


def _seed_especie():
    db = TestSession()
    estado = EstadoConservacion(nombre="En Peligro")
    db.add(estado)
    db.commit()
    especie = Especie(nombre_comun="Tortuga", nombre_cientifico="Chelonia mydas",
                       id_estado_conservacion=estado.id)
    db.add(especie)
    db.commit()
    especie_id = especie.id
    db.close()
    return especie_id


def test_reportar_avistamiento_returns_id_and_foto_url_starts_null():
    especie_id = _seed_especie()
    payload = {
        "id_especie": especie_id,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 10.5,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "foto.test@demo-sway.com",
        "notas": "prueba",
    }
    resp = client.post("/api/reportar-avistamiento", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["id"], int)

    listado = client.get("/api/avistamientos")
    assert listado.status_code == 200
    items = listado.json()["avistamientos"]
    creado = next(i for i in items if i["id"] == body["id"])
    assert creado["foto_url"] is None
