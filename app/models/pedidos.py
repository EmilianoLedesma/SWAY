# Para los modelos de validaciones el nombre debe reflejar la entidad que protege.
# Se usa Field para agregar validaciones adicionales: longitud, rangos, descripción y ejemplos.
from pydantic import BaseModel, Field
from typing import Optional, List, Any


class DireccionEnvio(BaseModel):
    # Requeridos — sin estos no se puede construir la dirección de entrega
    estado: str = Field(
        ..., min_length=2, max_length=100,
        description="Estado de la República Mexicana",
        example="Querétaro"
    )
    municipio: str = Field(
        ..., min_length=2, max_length=100,
        description="Municipio de entrega",
        example="Querétaro"
    )
    colonia: str = Field(
        ..., min_length=2, max_length=100,
        description="Colonia o fraccionamiento",
        example="Centro Histórico"
    )
    calle: str = Field(
        ..., min_length=2, max_length=150,
        description="Nombre de la calle",
        example="Av. Constituyentes"
    )
    # Nullable en tabla Direcciones — opcionales
    codigo_postal: Optional[str] = Field(
        None, min_length=5, max_length=5,
        description="Código postal de 5 dígitos",
        example="76000"
    )
    numero_exterior: Optional[str] = Field(
        None, max_length=10,
        description="Número exterior del domicilio"
    )
    numero_interior: Optional[str] = Field(
        None, max_length=10,
        description="Número interior (depto, oficina, etc.)"
    )
    telefono_contacto: Optional[str] = Field(
        None, min_length=10, max_length=15,
        description="Teléfono de contacto para coordinación de entrega"
    )


class PagoInfo(BaseModel):
    # tipo_pago tiene valor por defecto — no requiere enviarse
    tipo_pago: str = Field(
        "credit_card", max_length=30,
        description="Método de pago: credit_card, debit_card, paypal",
        example="credit_card"
    )
    # Los datos de tarjeta son opcionales (dependen del tipo de pago)
    numero_tarjeta: Optional[str] = Field(
        None, min_length=16, max_length=19,
        description="Número de tarjeta (16–19 dígitos)"
    )
    fecha_expiracion: Optional[str] = Field(
        None, min_length=5, max_length=5,
        description="Fecha de vencimiento en formato MM/YY",
        example="12/27"
    )
    cvv: Optional[str] = Field(
        None, min_length=3, max_length=4,
        description="Código de seguridad CVV/CVC"
    )
    nombre_tarjeta: Optional[str] = Field(
        None, max_length=80,
        description="Nombre del titular impreso en la tarjeta"
    )


class ProductoItem(BaseModel):
    # ID requerido para identificar el producto
    id: int = Field(
        ..., gt=0,
        description="ID del producto en el catálogo"
    )
    quantity: Optional[int] = Field(
        1, ge=1, le=99,
        description="Cantidad solicitada (1–99)"
    )
    cantidad: Optional[int] = Field(
        None, ge=1, le=99,
        description="Alias de quantity para compatibilidad con clientes Web1"
    )


class PedidoCreate(BaseModel):
    # user_id ignorado en el servidor — se extrae del JWT para prevenir BOLA/IDOR
    user_id: Optional[int] = Field(
        None, gt=0,
        description="Ignorado por el servidor; el usuario se identifica por el token JWT"
    )
    productos: List[Any] = Field(
        ..., min_length=1,
        description="Lista de productos con id y cantidad (mínimo 1 producto)"
    )
    direccion: DireccionEnvio = Field(
        ...,
        description="Dirección de envío completa"
    )
    pago: PagoInfo = Field(
        ...,
        description="Información de pago del pedido"
    )


class CarritoAgregar(BaseModel):
    # Ambos requeridos para validar stock
    producto_id: int = Field(
        ..., gt=0,
        description="ID del producto a agregar al carrito"
    )
    cantidad: int = Field(
        ..., ge=1, le=99,
        description="Cantidad a agregar al carrito (1–99)"
    )
