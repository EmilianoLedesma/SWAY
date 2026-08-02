from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.data.database import get_db
from app.data.models import (
    Evento, TipoEvento, Modalidad, Organizador, Usuario,
    Estatus, Direccion, Calle, Colonia, Municipio, Estado, RegistroEvento
)
from app.security.auth import get_optional_organizador_user
from app.models.eventos import EventoCreate

router = APIRouter(prefix="/api", tags=["eventos"])


def _base_eventos_query(db: Session):
    return (
        db.query(Evento, TipoEvento, Modalidad, Usuario, Estatus, Calle, Colonia, Municipio, Estado)
        .outerjoin(TipoEvento, Evento.id_tipo_evento == TipoEvento.id)
        .outerjoin(Modalidad, Evento.id_modalidad == Modalidad.id)
        .outerjoin(Organizador, Evento.id_organizador == Organizador.id)
        .outerjoin(Usuario, Organizador.id_usuario == Usuario.id)
        .outerjoin(Estatus, Evento.id_estatus == Estatus.id)
        .outerjoin(Direccion, Evento.id_direccion == Direccion.id)
        .outerjoin(Calle, Direccion.id_calle == Calle.id)
        .outerjoin(Colonia, Calle.id_colonia == Colonia.id)
        .outerjoin(Municipio, Colonia.id_municipio == Municipio.id)
        .outerjoin(Estado, Municipio.id_estado == Estado.id)
    )


def _serializar_eventos(db: Session, filas):
    conteos_registro = dict(
        db.query(RegistroEvento.id_evento, func.count(RegistroEvento.id))
        .group_by(RegistroEvento.id_evento)
        .all()
    )

    eventos = []
    for evento, tipo_ev, modal, usr, est, calle, colonia, municipio, estado_geo in filas:
        partes_dir = []
        if calle:
            partes_dir.append(calle.nombre)
            if calle.n_exterior:
                partes_dir.append(str(calle.n_exterior))
        if colonia:
            partes_dir.append(colonia.nombre)
        if municipio:
            partes_dir.append(municipio.nombre)
        if estado_geo:
            partes_dir.append(estado_geo.nombre)
        direccion_completa = ", ".join(p for p in partes_dir if p)

        nombre_organizador = None
        if usr:
            partes_nombre = [usr.nombre, usr.apellido_paterno, usr.apellido_materno]
            nombre_organizador = " ".join(p for p in partes_nombre if p)

        costo = float(evento.costo) if evento.costo else 0.0

        eventos.append({
            "id": evento.id,
            "title": evento.titulo,
            "titulo": evento.titulo,
            "descripcion": evento.descripcion,
            "start": evento.fecha_evento.isoformat() if evento.fecha_evento else None,
            "fecha_evento": evento.fecha_evento.isoformat() if evento.fecha_evento else None,
            "hora_inicio": str(evento.hora_inicio) if evento.hora_inicio else None,
            "hora_fin": str(evento.hora_fin) if evento.hora_fin else None,
            "url_evento": evento.url_evento,
            "capacidad_maxima": evento.capacidad_maxima,
            "costo": costo,
            "tipo_evento": tipo_ev.nombre if tipo_ev else None,
            "modalidad": modal.nombre if modal else None,
            "organizador": nombre_organizador,
            "estatus": est.nombre if est else None,
            "direccion": direccion_completa,
            "es_gratuito": costo == 0.0,
            "registrados": conteos_registro.get(evento.id, 0),
        })
    return eventos


@router.get("/eventos")
async def get_eventos(
    tipo: str = Query(""),
    modalidad: str = Query(""),
    fecha_inicio: str = Query(""),
    fecha_fin: str = Query(""),
    mine: bool = Query(False),
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if mine and not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación para filtrar tus eventos")
        q = _base_eventos_query(db).filter(Estatus.nombre == "Activo")

        if tipo:
            q = q.filter(TipoEvento.nombre == tipo)
        if modalidad:
            q = q.filter(Modalidad.nombre == modalidad)
        if fecha_inicio:
            q = q.filter(Evento.fecha_evento >= fecha_inicio)
        if fecha_fin:
            q = q.filter(Evento.fecha_evento <= fecha_fin)
        if mine:
            q = q.filter(Organizador.id_usuario == int(current_user["sub"]))

        q = q.order_by(Evento.fecha_evento.asc(), Evento.hora_inicio.asc())
        filas = q.all()
        eventos = _serializar_eventos(db, filas)

        return {"success": True, "eventos": eventos}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en get_eventos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/eventos/crear")
async def crear_evento(
    data: EventoCreate,
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if current_user:
            user_id = int(current_user["sub"])
        else:
            usuario_existente = db.query(Usuario).filter(Usuario.email == data.contacto).first() if data.contacto else None
            if usuario_existente:
                user_id = usuario_existente.id
            else:
                nombre_completo = data.nombre_organizador or "Organizador Sin Apellido"
                partes = nombre_completo.split()
                primer_nombre = partes[0] if partes else "Organizador"
                apellido_paterno = partes[1] if len(partes) > 1 else "Sin Apellido"
                apellido_materno = partes[2] if len(partes) > 2 else None

                nuevo_usuario = Usuario(
                    nombre=primer_nombre,
                    apellido_paterno=apellido_paterno,
                    apellido_materno=apellido_materno,
                    email=data.contacto,
                    suscrito_newsletter=False,
                    activo=True
                )
                db.add(nuevo_usuario)
                db.commit()
                db.refresh(nuevo_usuario)
                user_id = nuevo_usuario.id

        organizador = db.query(Organizador).filter(Organizador.id_usuario == user_id).first()
        if not organizador:
            organizador = Organizador(
                id_usuario=user_id,
                experiencia_eventos=0,
                certificado=False
            )
            db.add(organizador)
            db.commit()
            db.refresh(organizador)

        nuevo_evento = Evento(
            titulo=data.titulo,
            descripcion=data.descripcion,
            fecha_evento=data.fecha_evento,
            hora_inicio=data.hora_inicio,
            hora_fin=data.hora_fin,
            id_tipo_evento=data.id_tipo_evento,
            id_modalidad=data.id_modalidad,
            url_evento=data.url_evento if data.url_evento else None,
            capacidad_maxima=data.capacidad_maxima,
            costo=data.costo,
            id_organizador=organizador.id,
            id_estatus=1
        )
        db.add(nuevo_evento)
        db.commit()
        db.refresh(nuevo_evento)

        return {
            "success": True,
            "evento_id": nuevo_evento.id,
            "message": "Evento creado exitosamente. Será revisado y publicado pronto."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en crear_evento: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.delete("/eventos/{evento_id}")
async def eliminar_evento(
    evento_id: int,
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    # Sin chequeo de dueño: cualquier organizador/colaborador autenticado puede
    # eliminar cualquier evento, mismo patrón que DELETE /api/avistamientos/{id}.
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")

        evento = db.query(Evento).filter(Evento.id == evento_id).first()
        if not evento:
            raise HTTPException(status_code=404, detail="Evento no encontrado")

        estatus_cancelado = db.query(Estatus).filter(Estatus.nombre == "Cancelado").first()
        if not estatus_cancelado:
            raise HTTPException(status_code=500, detail="Estatus 'Cancelado' no configurado")

        evento.id_estatus = estatus_cancelado.id
        db.commit()

        return {"success": True, "message": "Evento eliminado exitosamente"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en eliminar_evento: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/eventos/{evento_id}/registrar")
async def registrar_asistencia(
    evento_id: int,
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")
        user_id = int(current_user["sub"])

        evento = db.query(Evento).filter(Evento.id == evento_id).first()
        if not evento:
            raise HTTPException(status_code=404, detail="Evento no encontrado")

        ya_registrado = (
            db.query(RegistroEvento)
            .filter(RegistroEvento.id_evento == evento_id, RegistroEvento.id_usuario == user_id)
            .first()
        )
        if ya_registrado:
            raise HTTPException(status_code=400, detail="Ya confirmaste tu asistencia a este evento")

        if evento.capacidad_maxima is not None:
            registrados = (
                db.query(func.count(RegistroEvento.id))
                .filter(RegistroEvento.id_evento == evento_id)
                .scalar()
            )
            if registrados >= evento.capacidad_maxima:
                raise HTTPException(status_code=400, detail="Cupo lleno")

        nuevo_registro = RegistroEvento(
            id_evento=evento_id,
            id_usuario=user_id,
            fecha_registro=datetime.utcnow(),
            asistio=None
        )
        db.add(nuevo_registro)
        db.commit()

        return {"success": True, "message": "Asistencia confirmada"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en registrar_asistencia: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/eventos/{evento_id}/registrar")
async def cancelar_asistencia(
    evento_id: int,
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")
        user_id = int(current_user["sub"])

        registro = (
            db.query(RegistroEvento)
            .filter(RegistroEvento.id_evento == evento_id, RegistroEvento.id_usuario == user_id)
            .first()
        )
        if not registro:
            raise HTTPException(status_code=404, detail="No estás registrado en este evento")

        db.delete(registro)
        db.commit()

        return {"success": True, "message": "Asistencia cancelada"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en cancelar_asistencia: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/eventos/mis-registros")
async def get_mis_registros(
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")
        user_id = int(current_user["sub"])

        q = (
            _base_eventos_query(db)
            .join(RegistroEvento, RegistroEvento.id_evento == Evento.id)
            .filter(RegistroEvento.id_usuario == user_id)
            .order_by(Evento.fecha_evento.asc(), Evento.hora_inicio.asc())
        )
        filas = q.all()
        eventos = _serializar_eventos(db, filas)

        return {"success": True, "eventos": eventos}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en get_mis_registros: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tipos-evento")
async def get_tipos_evento(db: Session = Depends(get_db)):
    try:
        tipos = db.query(TipoEvento).order_by(TipoEvento.nombre).all()
        return {"success": True, "tipos": [
            {"id": t.id, "nombre": t.nombre, "descripcion": t.descripcion} for t in tipos
        ]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/modalidades")
async def get_modalidades(db: Session = Depends(get_db)):
    try:
        modalidades = db.query(Modalidad).order_by(Modalidad.nombre).all()
        return {"success": True, "modalidades": [
            {"id": m.id, "nombre": m.nombre} for m in modalidades
        ]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
