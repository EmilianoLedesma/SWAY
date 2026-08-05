from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.data.database import get_db
from app.data.models import (
    Pedido, DetallePedido, PagoPedido, Producto,
    Estado, Municipio, Colonia, Calle, Direccion, Estatus
)
from app.security.auth import get_current_tienda_user, get_current_colaborador
from app.models.pedidos import PedidoCreate, CarritoAgregar
from app.services.errors import safe_500

router = APIRouter(prefix="/api", tags=["pedidos"])


def _buscar_o_crear_calle(db: Session, direccion_info) -> int:
    """Busca o crea la cadena estado->municipio->colonia->calle y retorna el id de calle."""
    estado = db.query(Estado).filter(Estado.nombre == direccion_info.estado).first()
    if not estado:
        estado = Estado(nombre=direccion_info.estado)
        db.add(estado)
        db.commit()
        db.refresh(estado)

    municipio = db.query(Municipio).filter(
        Municipio.nombre == direccion_info.municipio,
        Municipio.id_estado == estado.id
    ).first()
    if not municipio:
        municipio = Municipio(nombre=direccion_info.municipio, id_estado=estado.id)
        db.add(municipio)
        db.commit()
        db.refresh(municipio)

    colonia = db.query(Colonia).filter(
        Colonia.nombre == direccion_info.colonia,
        Colonia.id_municipio == municipio.id
    ).first()
    if not colonia:
        colonia = Colonia(
            nombre=direccion_info.colonia,
            id_municipio=municipio.id,
            cp=direccion_info.codigo_postal
        )
        db.add(colonia)
        db.commit()
        db.refresh(colonia)

    calle = db.query(Calle).filter(
        Calle.nombre == direccion_info.calle,
        Calle.id_colonia == colonia.id
    ).first()
    if not calle:
        calle = Calle(
            nombre=direccion_info.calle,
            id_colonia=colonia.id,
            n_exterior=direccion_info.numero_exterior,
            n_interior=direccion_info.numero_interior
        )
        db.add(calle)
        db.commit()
        db.refresh(calle)

    return calle.id


@router.post("/pedidos/crear")
async def crear_pedido(
    data: PedidoCreate,
    current_user: dict = Depends(get_current_tienda_user),
    db: Session = Depends(get_db)
):
    try:
        user_id = int(current_user["sub"])

        id_calle = _buscar_o_crear_calle(db, data.direccion)

        nueva_direccion = Direccion(id_calle=id_calle)
        db.add(nueva_direccion)
        db.commit()
        db.refresh(nueva_direccion)

        total = 0.0
        for item in data.productos:
            item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
            item_qty = int(item.get("quantity", item.get("cantidad", 1)) if isinstance(item, dict) else getattr(item, "quantity", 1))
            producto = db.query(Producto).filter(Producto.id == item_id).first()
            if producto:
                total += float(producto.precio) * item_qty

        nuevo_pedido = Pedido(
            id_usuario=user_id,
            total=total,
            id_estatus=1,
            id_direccion=nueva_direccion.id,
            telefono_contacto=data.direccion.telefono_contacto or ""
        )
        db.add(nuevo_pedido)
        db.commit()
        db.refresh(nuevo_pedido)

        for item in data.productos:
            item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
            item_qty = int(item.get("quantity", item.get("cantidad", 1)) if isinstance(item, dict) else getattr(item, "quantity", 1))
            producto = db.query(Producto).filter(Producto.id == item_id).first()
            if producto:
                precio_unitario = float(producto.precio)
                subtotal = precio_unitario * item_qty
                db.add(DetallePedido(
                    id_pedido=nuevo_pedido.id,
                    id_producto=item_id,
                    cantidad=item_qty,
                    precio_unitario=precio_unitario,
                    subtotal=subtotal
                ))

        pago = data.pago
        if pago.tipo_pago == "paypal":
            db.add(PagoPedido(
                id_pedido=nuevo_pedido.id,
                numero_tarjeta="PAYPAL_TRANS",
                fecha_expiracion="N/A",
                cvv="N/A",
                nombre_tarjeta="PayPal User",
                id_tipotarjeta=5,
                monto=total,
                id_estatus=3
            ))
        else:
            numero_limpio = (pago.numero_tarjeta or "").replace(" ", "")
            tipo_tarjeta_id = 1
            if numero_limpio.startswith("5"):
                tipo_tarjeta_id = 2
            elif numero_limpio.startswith("3"):
                tipo_tarjeta_id = 3
            db.add(PagoPedido(
                id_pedido=nuevo_pedido.id,
                numero_tarjeta=numero_limpio,
                fecha_expiracion=pago.fecha_expiracion or "",
                cvv=pago.cvv or "",
                nombre_tarjeta=pago.nombre_tarjeta or "",
                id_tipotarjeta=tipo_tarjeta_id,
                monto=total,
                id_estatus=3
            ))

        for item in data.productos:
            item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
            item_qty = int(item.get("quantity", item.get("cantidad", 1)) if isinstance(item, dict) else getattr(item, "quantity", 1))
            producto = db.query(Producto).filter(Producto.id == item_id).first()
            if producto:
                producto.stock = producto.stock - item_qty

        nuevo_pedido.id_estatus = 3
        db.commit()

        return {"success": True, "pedido_id": nuevo_pedido.id, "total": total, "message": "Pedido creado exitosamente"}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error en crear_pedido: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Ocurrió un error al procesar la solicitud.")


@router.get("/pedidos/mis-pedidos")
async def get_mis_pedidos(current_user: dict = Depends(get_current_tienda_user), db: Session = Depends(get_db)):
    try:
        user_id = int(current_user["sub"])

        pedidos_db = (
            db.query(Pedido, Estatus)
            .join(Estatus, Pedido.id_estatus == Estatus.id)
            .filter(Pedido.id_usuario == user_id)
            .order_by(Pedido.fecha_pedido.desc())
            .all()
        )

        pedidos = [
            {
                "id": p.id,
                "fecha_pedido": p.fecha_pedido.isoformat() if p.fecha_pedido else None,
                "total": float(p.total),
                "estatus": e.nombre
            }
            for p, e in pedidos_db
        ]

        return {"pedidos": pedidos}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_mis_pedidos")


@router.get("/pedidos/usuario/{user_id}")
async def get_pedidos_usuario(
    user_id: int,
    current_user: dict = Depends(get_current_tienda_user),
    db: Session = Depends(get_db)
):
    try:
        if int(current_user["sub"]) != user_id:
            raise HTTPException(status_code=403, detail="No autorizado para ver estos pedidos")

        pedidos_db = (
            db.query(Pedido, Estatus)
            .join(Estatus, Pedido.id_estatus == Estatus.id)
            .filter(Pedido.id_usuario == user_id)
            .order_by(Pedido.fecha_pedido.desc())
            .all()
        )

        pedidos = [
            {
                "id": p.id,
                "fecha_pedido": p.fecha_pedido.isoformat() if p.fecha_pedido else None,
                "total": float(p.total),
                "estatus": e.nombre
            }
            for p, e in pedidos_db
        ]

        return {"pedidos": pedidos}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_pedidos_usuario")


@router.get("/pedidos/detalle/{pedido_id}")
async def get_pedido_detalle(
    pedido_id: int,
    current_user: dict = Depends(get_current_tienda_user),
    db: Session = Depends(get_db)
):
    try:
        user_id = int(current_user["sub"])

        pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
        if not pedido or pedido.id_usuario != user_id:
            raise HTTPException(status_code=403, detail="No autorizado para ver este pedido")

        estatus = db.query(Estatus).filter(Estatus.id == pedido.id_estatus).first()

        direccion_completa = None
        if pedido.id_direccion:
            direccion_obj = db.query(Direccion).filter(Direccion.id == pedido.id_direccion).first()
            if direccion_obj and direccion_obj.id_calle:
                calle = db.query(Calle).filter(Calle.id == direccion_obj.id_calle).first()
                if calle:
                    colonia = db.query(Colonia).filter(Colonia.id == calle.id_colonia).first()
                    municipio = db.query(Municipio).filter(Municipio.id == colonia.id_municipio).first() if colonia else None
                    estado_geo = db.query(Estado).filter(Estado.id == municipio.id_estado).first() if municipio else None
                    partes = [
                        calle.nombre,
                        colonia.nombre if colonia else None,
                        municipio.nombre if municipio else None,
                        estado_geo.nombre if estado_geo else None
                    ]
                    direccion_completa = ", ".join(p for p in partes if p)

        detalles_db = (
            db.query(DetallePedido, Producto)
            .join(Producto, DetallePedido.id_producto == Producto.id)
            .filter(DetallePedido.id_pedido == pedido_id)
            .all()
        )

        detalles = [
            {
                "cantidad": dp.cantidad,
                "precio_unitario": float(dp.precio_unitario),
                "subtotal": float(dp.subtotal),
                "producto_nombre": prod.nombre
            }
            for dp, prod in detalles_db
        ]

        return {"pedido": {
            "id": pedido.id,
            "fecha_pedido": pedido.fecha_pedido.isoformat() if pedido.fecha_pedido else None,
            "total": float(pedido.total),
            "estatus": estatus.nombre if estatus else None,
            "telefono_contacto": pedido.telefono_contacto,
            "direccion": direccion_completa,
            "detalles": detalles
        }}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_pedido_detalle")


@router.post("/pedidos/reordenar/{pedido_id}")
async def reordenar_pedido(
    pedido_id: int,
    current_user: dict = Depends(get_current_tienda_user),
    db: Session = Depends(get_db)
):
    try:
        user_id = int(current_user["sub"])

        pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
        if not pedido or pedido.id_usuario != user_id:
            raise HTTPException(status_code=403, detail="No autorizado")

        detalles_db = (
            db.query(DetallePedido, Producto)
            .join(Producto, DetallePedido.id_producto == Producto.id)
            .filter(DetallePedido.id_pedido == pedido_id, Producto.activo == True)
            .all()
        )

        productos = []
        for dp, prod in detalles_db:
            if prod.stock >= dp.cantidad:
                productos.append({
                    "id": prod.id,
                    "nombre": prod.nombre,
                    "precio": float(prod.precio),
                    "cantidad": dp.cantidad,
                    "imagen_url": prod.imagen_url,
                    "stock": prod.stock
                })

        if not productos:
            raise HTTPException(status_code=400, detail="No hay productos disponibles para reordenar")

        return {"success": True, "productos": productos, "message": f"Se agregaron {len(productos)} productos al carrito"}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "reordenar_pedido")


@router.post("/carrito/agregar")
async def agregar_al_carrito(data: CarritoAgregar, db: Session = Depends(get_db)):
    try:
        producto = db.query(Producto).filter(Producto.id == data.producto_id).first()

        if not producto or not producto.activo:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        if producto.stock < data.cantidad:
            raise HTTPException(status_code=400, detail="Stock insuficiente")

        return {"success": True, "producto": {
            "id": producto.id,
            "nombre": producto.nombre,
            "precio": float(producto.precio),
            "stock": producto.stock
        }}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "agregar_al_carrito")


@router.get("/tipos-tarjeta")
async def get_tipos_tarjeta(db: Session = Depends(get_db)):
    try:
        from app.data.models import TipoTarjeta
        tipos = db.query(TipoTarjeta).order_by(TipoTarjeta.nombre).all()
        return {"tipos_tarjeta": [{"id": t.id, "nombre": t.nombre} for t in tipos]}
    except Exception as e:
        raise safe_500(e, "get_tipos_tarjeta")
