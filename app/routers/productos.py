from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.data.database import get_db, construir_nombre_completo
from app.data.models import Producto, CategoriaProducto, Material, ResenaProducto, Usuario
from app.services.errors import safe_500

router = APIRouter(prefix="/api", tags=["productos"])


@router.get("/productos")
async def get_productos(
    categoria_id: Optional[int] = Query(None),
    busqueda: str = Query(""),
    pagina: int = Query(1),
    limite: int = Query(6),
    ordenar: str = Query("fecha_agregado"),
    db: Session = Depends(get_db)
):
    try:
        # Subquery: avg rating and review count per product
        resenas_sq = (
            db.query(
                ResenaProducto.id_producto.label("id_producto"),
                func.avg(ResenaProducto.calificacion).label("calificacion_promedio"),
                func.count(ResenaProducto.id).label("total_resenas"),
            )
            .group_by(ResenaProducto.id_producto)
            .subquery()
        )

        q = (
            db.query(
                Producto,
                CategoriaProducto,
                Material,
                resenas_sq.c.calificacion_promedio,
                resenas_sq.c.total_resenas,
            )
            .outerjoin(CategoriaProducto, Producto.id_categoria == CategoriaProducto.id)
            .outerjoin(Material, Producto.id_material == Material.id)
            .outerjoin(resenas_sq, Producto.id == resenas_sq.c.id_producto)
            .filter(Producto.activo == True)
        )

        if categoria_id:
            q = q.filter(Producto.id_categoria == categoria_id)
        if busqueda:
            like = f"%{busqueda}%"
            q = q.filter(
                (Producto.nombre.ilike(like)) | (Producto.descripcion.ilike(like))
            )

        if ordenar == "precio_asc":
            q = q.order_by(Producto.precio.asc())
        elif ordenar == "precio_desc":
            q = q.order_by(Producto.precio.desc())
        elif ordenar == "nombre":
            q = q.order_by(Producto.nombre.asc())
        elif ordenar == "popularidad":
            q = q.order_by(func.coalesce(resenas_sq.c.total_resenas, 0).desc())
        else:
            q = q.order_by(Producto.fecha_agregado.desc())

        total_productos = q.count()
        offset = (pagina - 1) * limite
        rows = q.offset(offset).limit(limite).all()

        productos = []
        for p, cat, mat, calificacion_promedio, total_resenas in rows:
            avg_rating = float(calificacion_promedio) if calificacion_promedio is not None else 0.0
            total_rev = total_resenas if total_resenas else 0
            productos.append({
                "id": p.id,
                "name": p.nombre,
                "description": p.descripcion,
                "price": float(p.precio),
                "stock": p.stock,
                "image_url": p.imagen_url,
                "dimensions": p.dimensiones,
                "weight_grams": p.peso_gramos,
                "is_sustainable": bool(p.es_sostenible),
                "date_added": p.fecha_agregado.isoformat() if p.fecha_agregado else None,
                "category": cat.nombre if cat else None,
                "material": mat.nombre if mat else None,
                "average_rating": round(avg_rating, 1),
                "total_reviews": total_rev,
            })

        return {
            "success": True,
            "products": productos,
            "total": total_productos,
            "pagina": pagina,
            "limite": limite,
            "total_paginas": (total_productos + limite - 1) // limite,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error en get_productos: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Ocurrió un error al procesar la solicitud.")


@router.get("/producto/{producto_id}")
async def get_producto_detalle(producto_id: int, db: Session = Depends(get_db)):
    try:
        row = (
            db.query(Producto, CategoriaProducto, Material)
            .outerjoin(CategoriaProducto, Producto.id_categoria == CategoriaProducto.id)
            .outerjoin(Material, Producto.id_material == Material.id)
            .filter(Producto.id == producto_id, Producto.activo == True)
            .first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        p, cat, mat = row

        stats = (
            db.query(
                func.coalesce(func.avg(ResenaProducto.calificacion), 0).label("avg"),
                func.count(ResenaProducto.id).label("total"),
            )
            .filter(ResenaProducto.id_producto == producto_id)
            .one()
        )

        return {
            "success": True,
            "producto": {
                "id": p.id,
                "nombre": p.nombre,
                "descripcion": p.descripcion,
                "precio": float(p.precio),
                "stock": p.stock,
                "imagen_url": p.imagen_url,
                "dimensiones": p.dimensiones,
                "peso_gramos": p.peso_gramos,
                "es_sostenible": bool(p.es_sostenible),
                "fecha_agregado": p.fecha_agregado.isoformat() if p.fecha_agregado else None,
                "categoria_nombre": cat.nombre if cat else None,
                "material_nombre": mat.nombre if mat else None,
                "calificacion_promedio": round(float(stats.avg), 1),
                "total_reseñas": stats.total,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_producto_detalle")


@router.get("/reseñas/{producto_id}")
async def get_resenas_producto(producto_id: int, db: Session = Depends(get_db)):
    try:
        rows = (
            db.query(ResenaProducto, Usuario)
            .join(Usuario, ResenaProducto.id_usuario == Usuario.id)
            .filter(ResenaProducto.id_producto == producto_id)
            .order_by(ResenaProducto.fecha_resena.desc())
            .all()
        )

        resenas = []
        for r, u in rows:
            resenas.append({
                "id": r.id,
                "calificacion": r.calificacion,
                "comentario": r.comentario,
                "fecha_reseña": r.fecha_resena.isoformat() if r.fecha_resena else None,
                "usuario_nombre": construir_nombre_completo(u.nombre, u.apellido_paterno, u.apellido_materno),
            })

        return {"reseñas": resenas}

    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_resenas_producto")


@router.get("/materiales")
async def get_materiales(db: Session = Depends(get_db)):
    try:
        materiales = db.query(Material).order_by(Material.nombre).all()
        return {"materiales": [{"id": m.id, "nombre": m.nombre} for m in materiales]}
    except HTTPException:
        raise
    except Exception as e:
        raise safe_500(e, "get_materiales")


@router.get("/categorias")
async def get_categories(db: Session = Depends(get_db)):
    try:
        cats = db.query(CategoriaProducto).order_by(CategoriaProducto.nombre).all()
        return {
            "success": True,
            "categories": [{"id": c.id, "name": c.nombre, "description": c.descripcion or ""} for c in cats],
        }
    except Exception as e:
        raise safe_500(e, "get_categories")
