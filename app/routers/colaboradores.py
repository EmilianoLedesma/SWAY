from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash, check_password_hash
from app.data.database import get_db, construir_nombre_completo
from app.data.models import Usuario, Colaborador, Avistamiento, Especie
from app.security.auth import create_token, get_current_colaborador
from app.security.rate_limit import limiter
from app.models.colaboradores import (
    ColaboradorLogin, ColaboradorRegister, CheckEmail,
    CheckOrcid, CheckCedula, ColaboradorPerfilUpdate, ColaboradorPasswordChange
)
from app.services.email_service import send_welcome_email
from app.services.errors import safe_500

router = APIRouter(prefix="/api/colaboradores", tags=["colaboradores"])


@router.post("/login")
@limiter.limit("5/minute")
async def colaborador_login(request: Request, data: ColaboradorLogin, db: Session = Depends(get_db)):
    try:
        email = data.email.strip().lower()

        resultado = (
            db.query(Usuario, Colaborador)
            .join(Colaborador, Usuario.id == Colaborador.id_usuario)
            .filter(
                Usuario.email.ilike(email),
                Colaborador.estado_solicitud == "aprobada",
                Colaborador.activo == True
            )
            .first()
        )

        if not resultado:
            raise HTTPException(status_code=401, detail="Usuario no encontrado o no es un colaborador activo")

        user, colaborador = resultado

        if not check_password_hash(user.password_hash, data.password):
            raise HTTPException(status_code=401, detail="Contraseña incorrecta")

        nombre_completo = construir_nombre_completo(
            user.nombre, user.apellido_paterno, user.apellido_materno
        )

        token = create_token({
            "sub": str(user.id),
            "colaborador_id": colaborador.id,
            "email": user.email,
            "user_type": "colaborador",
            "token_type": "colaborador"
        })

        return {
            "success": True,
            "message": "Login exitoso",
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "nombre": user.nombre,
                "apellido_paterno": user.apellido_paterno,
                "apellido_materno": user.apellido_materno,
                "nombre_completo": nombre_completo,
                "email": user.email,
                "colaborador_id": colaborador.id,
                "especialidad": colaborador.especialidad,
                "institucion": colaborador.institucion,
                "años_experiencia": colaborador.años_experiencia,
                "grado_academico": colaborador.grado_academico
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "colaborador_login")


@router.post("/register")
@limiter.limit("10/minute")
async def colaborador_register(
    request: Request,
    data: ColaboradorRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    try:
        user_existente = db.query(Usuario).filter(
            Usuario.email == data.email.lower()
        ).first()

        if user_existente:
            colab_existente = db.query(Colaborador).filter(
                Colaborador.id_usuario == user_existente.id,
                Colaborador.estado_solicitud.in_(["pendiente", "aprobada"])
            ).first()
            if colab_existente:
                if colab_existente.estado_solicitud == "pendiente":
                    raise HTTPException(status_code=400, detail="Ya tienes una solicitud de colaboración pendiente")
                elif colab_existente.estado_solicitud == "aprobada":
                    raise HTTPException(status_code=400, detail="Ya eres un colaborador activo")
            # Reactivar usuario si fue desactivado previamente
            user_existente.activo = True
            db.commit()
            user_id = user_existente.id
        else:
            if data.apellidoPaterno:
                primer_nombre = data.nombre
                apellido_paterno = data.apellidoPaterno
                apellido_materno = data.apellidoMaterno
            else:
                partes = data.nombre.split()
                primer_nombre = partes[0] if partes else "Usuario"
                apellido_paterno = partes[1] if len(partes) > 1 else "Sin Apellido"
                apellido_materno = partes[2] if len(partes) > 2 else None

            nuevo_usuario = Usuario(
                nombre=primer_nombre,
                apellido_paterno=apellido_paterno,
                apellido_materno=apellido_materno,
                email=data.email.lower(),
                password_hash=generate_password_hash(data.password),
                suscrito_newsletter=False,
                activo=True
            )
            db.add(nuevo_usuario)
            db.commit()
            db.refresh(nuevo_usuario)
            user_id = nuevo_usuario.id

        from datetime import datetime
        nuevo_colaborador = Colaborador(
            id_usuario=user_id,
            especialidad=data.especialidad,
            grado_academico=data.grado_academico,
            institucion=data.institucion,
            años_experiencia=data.años_experiencia,
            numero_cedula=data.numero_cedula,
            orcid=data.orcid,
            motivacion=data.motivacion,
            estado_solicitud="aprobada",
            fecha_aprobacion=datetime.utcnow(),
            aprobado_por=None,
            activo=True
        )
        db.add(nuevo_colaborador)
        db.commit()
        db.refresh(nuevo_colaborador)

        nombre_completo = construir_nombre_completo(
            data.nombre,
            data.apellidoPaterno or "",
            data.apellidoMaterno or ""
        )
        background_tasks.add_task(
            send_welcome_email,
            nombre=nombre_completo,
            email=data.email,
            institucion=data.institucion or "SWAY Conservación Marina"
        )

        return {
            "success": True,
            "message": "Registro exitoso. Has sido aprobado como colaborador científico.",
            "colaborador_id": nuevo_colaborador.id,
            "user_id": user_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "colaborador_register")


@router.post("/logout")
async def logout_colaborador():
    return {"success": True, "message": "Sesión de colaborador cerrada exitosamente"}


@router.get("/profile")
async def get_colaborador_profile(
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db)
):
    try:
        colaborador_email = current_user.get("email")

        resultado = (
            db.query(Colaborador, Usuario)
            .join(Usuario, Colaborador.id_usuario == Usuario.id)
            .filter(Usuario.email == colaborador_email)
            .first()
        )

        if not resultado:
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")

        colaborador, user = resultado

        nombre_completo = construir_nombre_completo(
            user.nombre, user.apellido_paterno, user.apellido_materno, "Dr. "
        )

        experiencia_raw = colaborador.años_experiencia
        if experiencia_raw is None:
            experiencia_procesada = "0"
        else:
            experiencia_procesada = str(experiencia_raw).replace(" años", "").replace(" año", "").strip()
            if not experiencia_procesada:
                experiencia_procesada = "0"

        return {
            "success": True,
            "colaborador": {
                "id": colaborador.id,
                "usuario_id": user.id,
                "especialidad": colaborador.especialidad,
                "grado_academico": colaborador.grado_academico,
                "institucion": colaborador.institucion,
                "años_experiencia": experiencia_procesada,
                "numero_cedula": colaborador.numero_cedula,
                "orcid": colaborador.orcid,
                "estado_solicitud": colaborador.estado_solicitud,
                "nombre": user.nombre,
                "apellido_paterno": user.apellido_paterno,
                "apellido_materno": user.apellido_materno or "",
                "nombre_completo": nombre_completo,
                "email": user.email,
                "telefono": user.telefono or "",
                "fecha_nacimiento": user.fecha_nacimiento.isoformat() if user.fecha_nacimiento else "",
                "motivacion": colaborador.motivacion or ""
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_colaborador_profile")


@router.get("/status")
async def colaborador_status(current_user: dict = Depends(get_current_colaborador)):
    return {
        "success": True,
        "user": {
            "id": current_user.get("sub"),
            "name": current_user.get("name", "Usuario"),
            "email": current_user.get("email", ""),
            "colaborador_id": current_user.get("colaborador_id", ""),
            "user_type": "colaborador"
        }
    }


@router.post("/check-email")
@limiter.limit("20/minute")
async def check_collaborator_email(request: Request, data: CheckEmail, db: Session = Depends(get_db)):
    try:
        email = data.email.strip().lower()

        user = db.query(Usuario).filter(Usuario.email.ilike(email)).first()

        if not user:
            return {"exists": False, "can_register": True}

        colab = db.query(Colaborador).filter(
            Colaborador.id_usuario == user.id
        ).first()

        if not colab:
            return {"exists": True, "can_register": True}

        if colab.estado_solicitud == "pendiente":
            return {"exists": True, "can_register": False, "message": "Ya tienes una solicitud pendiente"}
        elif colab.estado_solicitud == "aprobada" and colab.activo:
            return {"exists": True, "can_register": False, "message": "Ya eres un colaborador activo"}
        else:
            return {"exists": True, "can_register": True}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "check_collaborator_email")


@router.post("/check-orcid")
@limiter.limit("20/minute")
async def check_collaborator_orcid(request: Request, data: CheckOrcid, db: Session = Depends(get_db)):
    try:
        orcid = data.orcid.strip()

        colab = db.query(Colaborador).filter(
            Colaborador.orcid == orcid,
            Colaborador.orcid != ""
        ).first()

        if not colab:
            return {"exists": False, "can_register": True}

        if colab.estado_solicitud == "pendiente":
            return {"exists": True, "can_register": False, "message": "Este ORCID ya tiene una solicitud pendiente"}
        elif colab.estado_solicitud == "aprobada" and colab.activo:
            return {"exists": True, "can_register": False, "message": "Este ORCID ya pertenece a un colaborador activo"}
        else:
            return {"exists": True, "can_register": True}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "check_collaborator_orcid")


@router.post("/check-cedula")
@limiter.limit("20/minute")
async def check_collaborator_cedula(request: Request, data: CheckCedula, db: Session = Depends(get_db)):
    try:
        cedula = data.cedula.strip()

        colab = db.query(Colaborador).filter(
            Colaborador.numero_cedula == cedula,
            Colaborador.numero_cedula != ""
        ).first()

        if not colab:
            return {"exists": False, "can_register": True}

        if colab.estado_solicitud == "pendiente":
            return {"exists": True, "can_register": False, "message": "Esta cédula ya tiene una solicitud pendiente"}
        elif colab.estado_solicitud == "aprobada" and colab.activo:
            return {"exists": True, "can_register": False, "message": "Esta cédula ya pertenece a un colaborador activo"}
        else:
            return {"exists": True, "can_register": True}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "check_collaborator_cedula")


@router.put("/perfil")
async def update_colaborador_perfil(
    data: ColaboradorPerfilUpdate,
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db)
):
    try:
        user_id = int(current_user.get("sub"))
        colaborador_id = current_user.get("colaborador_id")

        user = db.query(Usuario).filter(Usuario.id == user_id).first()
        if user:
            if data.nombre:
                user.nombre = data.nombre
            if data.apellido_paterno:
                user.apellido_paterno = data.apellido_paterno
            if data.apellido_materno:
                user.apellido_materno = data.apellido_materno
            if data.telefono:
                user.telefono = data.telefono
            if data.fecha_nacimiento:
                user.fecha_nacimiento = data.fecha_nacimiento

        colaborador = db.query(Colaborador).filter(Colaborador.id == colaborador_id).first()
        if colaborador:
            from datetime import datetime
            if data.especialidad:
                colaborador.especialidad = data.especialidad
            if data.grado_academico:
                colaborador.grado_academico = data.grado_academico
            if data.institucion:
                colaborador.institucion = data.institucion
            if data.años_experiencia:
                colaborador.años_experiencia = data.años_experiencia
            if data.numero_cedula:
                colaborador.numero_cedula = data.numero_cedula
            if data.orcid:
                colaborador.orcid = data.orcid
            if data.motivacion:
                colaborador.motivacion = data.motivacion
            colaborador.fecha_modificacion = datetime.utcnow()

        db.commit()
        return {"success": True, "message": "Perfil actualizado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "update_colaborador_perfil")


@router.put("/perfil/password")
@limiter.limit("5/minute")
async def change_colaborador_password(
    request: Request,
    data: ColaboradorPasswordChange,
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db)
):
    try:
        user_id = int(current_user.get("sub"))

        user = db.query(Usuario).filter(Usuario.id == user_id).first()
        if not user or not check_password_hash(user.password_hash, data.password_actual):
            raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")

        user.password_hash = generate_password_hash(data.password_nuevo)
        db.commit()
        return {"success": True, "message": "Contraseña actualizada correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "change_colaborador_password")


@router.delete("/perfil")
async def delete_colaborador_perfil(
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db)
):
    try:
        colaborador_id = current_user.get("colaborador_id")
        user_id = int(current_user.get("sub"))

        colaborador = db.query(Colaborador).filter(Colaborador.id == colaborador_id).first()
        if colaborador:
            colaborador.activo = False
            colaborador.estado_solicitud = "inactivo"

        user = db.query(Usuario).filter(Usuario.id == user_id).first()
        if user:
            user.activo = False

        db.commit()
        return {"success": True, "message": "Cuenta desactivada correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "delete_colaborador_perfil")


@router.get("/avistamientos")
async def get_colaborador_avistamientos(
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db)
):
    try:
        colaborador_email = current_user.get("email")

        registros = (
            db.query(Avistamiento, Especie, Usuario)
            .join(Especie, Avistamiento.id_especie == Especie.id)
            .join(Usuario, Avistamiento.id_usuario == Usuario.id)
            .filter(Usuario.email == colaborador_email)
            .order_by(Avistamiento.fecha.desc())
            .all()
        )

        avistamientos = []
        for avistamiento, especie, usuario in registros:
            partes = [usuario.nombre, usuario.apellido_paterno, usuario.apellido_materno]
            nombre_completo = " ".join(p for p in partes if p)
            avistamientos.append({
                "id": avistamiento.id,
                "fecha": avistamiento.fecha.isoformat() if avistamiento.fecha else None,
                "latitud": float(avistamiento.latitud) if avistamiento.latitud else None,
                "longitud": float(avistamiento.longitud) if avistamiento.longitud else None,
                "notas": avistamiento.notas,
                "especie_nombre": especie.nombre_comun,
                "especie_cientifica": especie.nombre_cientifico,
                "reportado_por": nombre_completo or None,
                "email_usuario": usuario.email,
                "foto_url": avistamiento.foto_url
            })

        return {"success": True, "avistamientos": avistamientos}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_colaborador_avistamientos")
