import asyncio
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.data.database import get_db
from app.data.models import (
    Usuario, Contacto, Donador, Donacion, CategoriaProducto, Material
)
from app.models.catalogos import NewsletterSuscripcion, ContactoMensaje, DonacionCreate
from app.services.email_service import send_newsletter_confirmation, send_newsletter, send_donation_thanks
from app.services.errors import safe_500


async def _send_newsletter_after_delay(email: str, nombre: str, delay_seconds: int = 120):
    await asyncio.sleep(delay_seconds)
    send_newsletter(email, nombre)

router = APIRouter(prefix="/api", tags=["catalogos"])


@router.get("/regiones")
async def get_regiones():
    regiones = [
        {"id": "pacifico", "nombre": "Océano Pacífico", "descripcion": "El mayor océano del planeta"},
        {"id": "atlantico", "nombre": "Océano Atlántico", "descripcion": "Segundo océano más grande del mundo"},
        {"id": "indico", "nombre": "Océano Índico", "descripcion": "Tercer océano más grande"},
        {"id": "artico", "nombre": "Océano Ártico", "descripcion": "Océano polar del norte"},
        {"id": "antartico", "nombre": "Océano Antártico", "descripcion": "Océano que rodea la Antártida"},
        {"id": "mediterraneo", "nombre": "Mar Mediterráneo", "descripcion": "Mar semicerrado entre Europa, África y Asia"},
        {"id": "caribe", "nombre": "Mar Caribe", "descripcion": "Mar tropical en América Central"}
    ]
    return {"success": True, "regiones": regiones}


@router.post("/newsletter")
async def suscribir_newsletter(data: NewsletterSuscripcion, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        email = data.email
        if not email or "@" not in email or "." not in email:
            raise HTTPException(status_code=400, detail="Email inválido")

        user = db.query(Usuario).filter(Usuario.email == email).first()

        if user:
            if user.suscrito_newsletter:
                return {"success": True, "message": "Este email ya está suscrito al newsletter", "already_subscribed": True}
            else:
                user.suscrito_newsletter = True
                db.commit()
                nombre = user.nombre or "Suscriptor"
                background_tasks.add_task(send_newsletter_confirmation, email)
                background_tasks.add_task(_send_newsletter_after_delay, email, nombre, 120)
                return {"success": True, "message": "Suscripción reactivada exitosamente"}
        else:
            nuevo_usuario = Usuario(
                nombre="Usuario",
                apellido_paterno="Newsletter",
                apellido_materno=None,
                email=email,
                suscrito_newsletter=True,
                activo=True
            )
            db.add(nuevo_usuario)
            db.commit()
            background_tasks.add_task(send_newsletter_confirmation, email)
            background_tasks.add_task(_send_newsletter_after_delay, email, "Suscriptor", 120)
            return {"success": True, "message": "Suscripción exitosa al newsletter"}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "suscribir_newsletter")


@router.post("/newsletter/enviar")
async def enviar_newsletter(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Dispara el newsletter a todos los usuarios suscritos."""
    try:
        suscritos = db.query(Usuario).filter(
            Usuario.suscrito_newsletter == True,
            Usuario.activo == True,
            Usuario.email != None
        ).all()

        if not suscritos:
            return {"success": True, "message": "No hay suscriptores activos", "total": 0}

        for usuario in suscritos:
            nombre = usuario.nombre or "Suscriptor"
            background_tasks.add_task(send_newsletter, usuario.email, nombre)

        return {"success": True, "message": f"Newsletter enviándose a {len(suscritos)} suscriptores", "total": len(suscritos)}

    except Exception as e:
        raise safe_500(e, "enviar_newsletter")


@router.post("/contacto")
async def enviar_contacto(data: ContactoMensaje, db: Session = Depends(get_db)):
    try:
        user = db.query(Usuario).filter(Usuario.email == data.email).first()

        if not user:
            if data.nombre and data.apellidoPaterno:
                primer_nombre = data.nombre
                apellido_paterno = data.apellidoPaterno
                apellido_materno = data.apellidoMaterno
            else:
                partes = data.name.split()
                primer_nombre = partes[0] if partes else "Usuario"
                apellido_paterno = partes[1] if len(partes) > 1 else "Sin Apellido"
                apellido_materno = partes[2] if len(partes) > 2 else None

            user = Usuario(
                nombre=primer_nombre,
                apellido_paterno=apellido_paterno,
                apellido_materno=apellido_materno,
                email=data.email,
                suscrito_newsletter=False,
                activo=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        nuevo_contacto = Contacto(
            id_usuario=user.id,
            asunto=data.subject,
            mensaje=data.message,
            respondido=False
        )
        db.add(nuevo_contacto)
        db.commit()

        return {"success": True, "message": "Mensaje enviado exitosamente. Te contactaremos pronto."}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en enviar_contacto: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.post("/procesar-donacion")
async def procesar_donacion(data: DonacionCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        user = db.query(Usuario).filter(Usuario.email == data.contact_email).first()

        if not user:
            if data.contact_nombre and data.contact_apellido_paterno:
                primer_nombre = data.contact_nombre
                apellido_paterno = data.contact_apellido_paterno
                apellido_materno = data.contact_apellido_materno
            else:
                partes = data.contact_name.split()
                primer_nombre = partes[0] if partes else "Usuario"
                apellido_paterno = partes[1] if len(partes) > 1 else "Sin Apellido"
                apellido_materno = partes[2] if len(partes) > 2 else None

            user = Usuario(
                nombre=primer_nombre,
                apellido_paterno=apellido_paterno,
                apellido_materno=apellido_materno,
                email=data.contact_email,
                suscrito_newsletter=False,
                activo=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        nuevo_donador = Donador(
            id_usuario=user.id,
            monto=float(data.amount),
            id_tipodonacion=1
        )
        db.add(nuevo_donador)
        db.commit()
        db.refresh(nuevo_donador)

        if data.payment_method == "credit_card":
            primer_digito = (data.card_number or "").replace(" ", "")[:1]
            if primer_digito == "4":
                tipo_tarjeta_id = 1
            elif primer_digito in ["5", "2"]:
                tipo_tarjeta_id = 2
            elif primer_digito == "3":
                tipo_tarjeta_id = 3
            else:
                tipo_tarjeta_id = 4

            nueva_donacion = Donacion(
                id_donador=nuevo_donador.id,
                numero_tarjeta_encriptado=(data.card_number or "").replace(" ", ""),
                fecha_expiracion_encriptada=data.card_expiry,
                cvv_encriptado=data.card_cvv,
                id_tipotarjeta=tipo_tarjeta_id
            )
            db.add(nueva_donacion)
        elif data.payment_method == "paypal":
            nueva_donacion = Donacion(
                id_donador=nuevo_donador.id,
                numero_tarjeta_encriptado="PAYPAL_TRANSACTION",
                fecha_expiracion_encriptada="N/A",
                cvv_encriptado="N/A",
                id_tipotarjeta=5
            )
            db.add(nueva_donacion)

        db.commit()
        background_tasks.add_task(send_donation_thanks, user.nombre, data.contact_email, float(data.amount))
        return {"success": True, "message": "Donación procesada exitosamente", "donador_id": nuevo_donador.id}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "procesar_donacion")


@router.post("/setup-tienda")
async def setup_tienda(db: Session = Depends(get_db)):
    try:
        categorias_ejemplo = [
            ("Ropa Sostenible", "Prendas fabricadas con materiales ecológicos"),
            ("Accesorios Ecológicos", "Productos útiles hechos con materiales reciclados"),
            ("Educativos", "Materiales educativos sobre conservación marina"),
            ("Hogar Sustentable", "Productos para el hogar que respetan el medio ambiente"),
            ("Juguetes Ecológicos", "Juguetes fabricados con materiales naturales")
        ]
        for nombre, descripcion in categorias_ejemplo:
            existe = db.query(CategoriaProducto).filter(CategoriaProducto.nombre == nombre).first()
            if not existe:
                db.add(CategoriaProducto(nombre=nombre, descripcion=descripcion))

        materiales_ejemplo = [
            "Algodón Orgánico", "Plástico Reciclado", "Bambú",
            "Madera Certificada", "Acero Inoxidable", "Vidrio Reciclado", "Materiales Naturales"
        ]
        for nombre in materiales_ejemplo:
            existe = db.query(Material).filter(Material.nombre == nombre).first()
            if not existe:
                db.add(Material(nombre=nombre))

        db.commit()
        return {"success": True, "message": "Tienda configurada con datos de ejemplo"}

    except Exception as e:
        raise safe_500(e, "setup_tienda")
