from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.data.database import get_db
from app.data.models import Estado, Municipio, Colonia, Calle
from app.services.errors import safe_500

router = APIRouter(prefix="/api/direcciones", tags=["direcciones"])


@router.get("/estados")
async def get_estados(db: Session = Depends(get_db)):
    try:
        estados = db.query(Estado).order_by(Estado.nombre).distinct().all()
        return {"estados": [{"id": e.id, "nombre": e.nombre} for e in estados]}
    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_estados")


@router.get("/municipios/{estado_id}")
async def get_municipios(estado_id: int, db: Session = Depends(get_db)):
    try:
        municipios = (
            db.query(Municipio)
            .filter(Municipio.id_estado == estado_id)
            .order_by(Municipio.nombre)
            .all()
        )
        return {"municipios": [{"id": m.id, "nombre": m.nombre} for m in municipios]}
    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_municipios")


@router.get("/colonias/{municipio_id}")
async def get_colonias(municipio_id: int, db: Session = Depends(get_db)):
    try:
        colonias = (
            db.query(Colonia)
            .filter(Colonia.id_municipio == municipio_id)
            .order_by(Colonia.nombre)
            .all()
        )
        return {"colonias": [{"id": c.id, "nombre": c.nombre, "cp": c.cp} for c in colonias]}
    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_colonias")


@router.get("/calles/{colonia_id}")
async def get_calles(colonia_id: int, db: Session = Depends(get_db)):
    try:
        calles = (
            db.query(Calle)
            .filter(Calle.id_colonia == colonia_id)
            .order_by(Calle.nombre)
            .all()
        )
        return {"calles": [{"id": c.id, "nombre": c.nombre} for c in calles]}
    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_calles")
