from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://sway_app:sway123@localhost:5433/sway"
)

engine = create_engine(DATABASE_URL)
sessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = sessionLocal()
    try:
        yield db
    finally:
        db.close()


def construir_nombre_completo(nombre, apellido_paterno, apellido_materno, prefijo=""):
    if not nombre:
        return "Usuario"
    if apellido_paterno and apellido_paterno in nombre:
        return f"{prefijo}{nombre}".strip()
    else:
        apellidos = []
        if apellido_paterno:
            apellidos.append(apellido_paterno)
        if apellido_materno:
            apellidos.append(apellido_materno)
        if apellidos:
            return f"{prefijo}{nombre} {' '.join(apellidos)}".strip()
        else:
            return f"{prefijo}{nombre}".strip()


def build_especie_filters(query, estado=None, habitat=None):
    from app.data.models import Especie, EstadoConservacion, EspecieHabitat, Habitat

    if estado:
        query = (
            query.join(EstadoConservacion, Especie.id_estado_conservacion == EstadoConservacion.id)
            .filter(EstadoConservacion.nombre == estado)
        )
    if habitat:
        query = (
            query.join(EspecieHabitat, Especie.id == EspecieHabitat.id_especie)
            .join(Habitat, EspecieHabitat.id_habitat == Habitat.id)
            .filter(Habitat.nombre == habitat)
        )
    return query


def build_avistamiento_filters(query, fecha_desde=None, fecha_hasta=None, especie_id=None):
    from app.data.models import Avistamiento

    if fecha_desde:
        query = query.filter(Avistamiento.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Avistamiento.fecha <= fecha_hasta)
    if especie_id:
        query = query.filter(Avistamiento.id_especie == especie_id)
    return query
