from pydantic import BaseModel, Field, EmailStr
from typing import Optional


class NewsletterSuscripcion(BaseModel):
    email: EmailStr = Field(
        ..., max_length=150,
        description="Correo electrónico para suscripción al newsletter",
        example="usuario@ejemplo.com"
    )


class ContactoMensaje(BaseModel):
    name: str = Field(
        ..., min_length=2, max_length=100,
        description="Nombre completo del remitente",
        example="Juan Pérez"
    )
    email: EmailStr = Field(
        ..., max_length=150,
        description="Correo electrónico de contacto",
        example="juan@ejemplo.com"
    )
    subject: str = Field(
        ..., min_length=3, max_length=200,
        description="Asunto del mensaje",
        example="Consulta sobre adopción de especie"
    )
    message: str = Field(
        ..., min_length=10, max_length=3000,
        description="Cuerpo del mensaje"
    )
    nombre: Optional[str] = Field(
        None, max_length=80,
        description="Primer nombre (campo alternativo)"
    )
    apellidoPaterno: Optional[str] = Field(
        None, max_length=80,
        description="Apellido paterno"
    )
    apellidoMaterno: Optional[str] = Field(
        None, max_length=80,
        description="Apellido materno"
    )


class DonacionCreate(BaseModel):
    amount: float = Field(
        ..., gt=0, le=999999,
        description="Monto de la donación en MXN",
        example=500.00
    )
    contact_name: str = Field(
        ..., min_length=2, max_length=150,
        description="Nombre completo del donante",
        example="María García"
    )
    contact_email: EmailStr = Field(
        ..., max_length=150,
        description="Correo electrónico del donante",
        example="maria@ejemplo.com"
    )
    payment_method: str = Field(
        ..., min_length=2, max_length=30,
        description="Método de pago: credit_card, debit_card, paypal",
        example="credit_card"
    )
    card_number: Optional[str] = Field(
        None, min_length=16, max_length=19,
        description="Número de tarjeta (16-19 dígitos)"
    )
    card_name: Optional[str] = Field(
        None, max_length=80,
        description="Nombre del titular de la tarjeta"
    )
    card_expiry: Optional[str] = Field(
        None, min_length=5, max_length=5,
        description="Fecha de vencimiento en formato MM/YY",
        example="12/27"
    )
    card_cvv: Optional[str] = Field(
        None, min_length=3, max_length=4,
        description="Código de seguridad CVV/CVC"
    )
    contact_nombre: Optional[str] = Field(
        None, max_length=80,
        description="Primer nombre del donante (campo alternativo)"
    )
    contact_apellido_paterno: Optional[str] = Field(
        None, max_length=80,
        description="Apellido paterno del donante"
    )
    contact_apellido_materno: Optional[str] = Field(
        None, max_length=80,
        description="Apellido materno del donante"
    )
