from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash, check_password_hash
from app.data.database import get_db, construir_nombre_completo
from app.data.models import Usuario
from app.security.auth import create_token, get_current_tienda_user
from app.security.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["auth"])


class UserLogin(BaseModel):
    email: str
    password: str


class UserRegister(BaseModel):
    nombre: str
    apellidoPaterno: str
    apellidoMaterno: Optional[str] = None
    email: str
    password: str
    telefono: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    newsletter: Optional[bool] = False

    @field_validator("fecha_nacimiento", mode="before")
    @classmethod
    def validar_fecha(cls, v):
        if v is None:
            return v
        from datetime import datetime
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        raise ValueError("fecha_nacimiento debe estar en formato YYYY-MM-DD")


class AuthLogin(BaseModel):
    email: str
    password: str


class AuthRegister(BaseModel):
    nombre: str
    email: str
    password: str
    telefono: str
    apellidoPaterno: Optional[str] = None
    apellidoMaterno: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    newsletter: Optional[bool] = False


@router.post("/user/login")
@limiter.limit("5/minute")
async def user_login(request: Request, data: UserLogin, db: Session = Depends(get_db)):
    try:
        if not data.email or not data.password:
            raise HTTPException(status_code=400, detail="Email y contraseña son requeridos")

        user = db.query(Usuario).filter(
            Usuario.email == data.email,
            Usuario.activo == True
        ).first()

        if user and check_password_hash(user.password_hash, data.password):
            nombre_completo = construir_nombre_completo(
                user.nombre, user.apellido_paterno, user.apellido_materno
            )
            token = create_token({
                "sub": str(user.id),
                "email": user.email,
                "name": nombre_completo,
                "token_type": "tienda"
            })
            return {
                "success": True,
                "message": "Login exitoso",
                "access_token": token,
                "token_type": "bearer",
                "user": {
                    "id": user.id,
                    "nombre": nombre_completo,
                    "email": user.email,
                    "telefono": user.telefono
                }
            }
        else:
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error en login: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.post("/user/register")
@limiter.limit("10/minute")
async def user_register(request: Request, data: UserRegister, db: Session = Depends(get_db)):
    try:
        existente = db.query(Usuario).filter(Usuario.email == data.email).first()
        if existente:
            if existente.password_hash:
                raise HTTPException(status_code=400, detail="El email ya está registrado")
            # Usuario ghost creado por newsletter — completar registro
            existente.nombre = data.nombre
            existente.apellido_paterno = data.apellidoPaterno
            existente.apellido_materno = data.apellidoMaterno
            existente.password_hash = generate_password_hash(data.password)
            existente.telefono = data.telefono
            existente.fecha_nacimiento = data.fecha_nacimiento
            if data.newsletter:
                existente.suscrito_newsletter = True
            existente.activo = True
            db.commit()
            db.refresh(existente)
            nuevo_usuario = existente
        else:
            nuevo_usuario = Usuario(
                nombre=data.nombre,
                apellido_paterno=data.apellidoPaterno,
                apellido_materno=data.apellidoMaterno,
                email=data.email,
                password_hash=generate_password_hash(data.password),
                telefono=data.telefono,
                fecha_nacimiento=data.fecha_nacimiento,
                suscrito_newsletter=data.newsletter,
                activo=True
            )
            db.add(nuevo_usuario)
            db.commit()
            db.refresh(nuevo_usuario)

        nombre_completo = data.nombre + " " + data.apellidoPaterno
        if data.apellidoMaterno:
            nombre_completo += " " + data.apellidoMaterno

        token = create_token({
            "sub": str(nuevo_usuario.id),
            "email": nuevo_usuario.email,
            "name": nombre_completo,
            "token_type": "tienda"
        })

        return {
            "success": True,
            "message": "Registro exitoso",
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": nuevo_usuario.id,
                "nombre": nombre_completo,
                "email": nuevo_usuario.email,
                "telefono": nuevo_usuario.telefono
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error en registro: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.post("/user/logout")
@limiter.limit("60/minute")
async def logout(request: Request):
    return {"success": True, "message": "Sesión cerrada exitosamente"}


@router.get("/user/status")
@limiter.limit("60/minute")
async def user_status(request: Request, current_user: dict = Depends(get_current_tienda_user), db: Session = Depends(get_db)):
    try:
        user_id = int(current_user["sub"])

        user = db.query(Usuario).filter(Usuario.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")

        nombre_completo = construir_nombre_completo(
            user.nombre, user.apellido_paterno, user.apellido_materno
        )

        return {
            "success": True,
            "user": {
                "id": user.id,
                "nombre": nombre_completo,
                "email": user.email,
                "telefono": user.telefono,
                "fecha_registro": user.fecha_registro.isoformat() if user.fecha_registro else None,
                "fecha_nacimiento": user.fecha_nacimiento.isoformat() if user.fecha_nacimiento else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en user_status: {e}")
        raise HTTPException(status_code=500, detail="Error al verificar sesión")


@router.post("/auth/register")
@limiter.limit("10/minute")
async def auth_register(request: Request, data: AuthRegister, db: Session = Depends(get_db)):
    try:
        existente = db.query(Usuario).filter(Usuario.email == data.email).first()
        if existente:
            raise HTTPException(status_code=400, detail="El email ya está registrado")

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
            email=data.email,
            password_hash=generate_password_hash(data.password),
            telefono=data.telefono,
            fecha_nacimiento=data.fecha_nacimiento,
            suscrito_newsletter=data.newsletter or False
        )
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)

        return {
            "success": True,
            "message": "Usuario registrado exitosamente",
            "user_id": nuevo_usuario.id
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en auth_register: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.post("/auth/login")
@limiter.limit("5/minute")
async def auth_login(request: Request, data: AuthLogin, db: Session = Depends(get_db)):
    try:
        user = db.query(Usuario).filter(
            Usuario.email == data.email,
            Usuario.activo == True
        ).first()

        if not user or not check_password_hash(user.password_hash, data.password):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")

        nombre_completo = construir_nombre_completo(
            user.nombre, user.apellido_paterno, user.apellido_materno
        )

        return {
            "success": True,
            "user": {
                "id": user.id,
                "nombre": nombre_completo,
                "email": user.email,
                "telefono": user.telefono
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en auth_login: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")
