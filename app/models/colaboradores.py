# Para los modelos de validaciones el nombre debe reflejar la entidad que protege.
# Se usa Field para agregar validaciones adicionales: longitud, rangos, descripción y ejemplos.
from pydantic import BaseModel, Field, EmailStr, field_validator


class ColaboradorLogin(BaseModel):
    # Ambos requeridos para autenticación
    email: str = Field(
        ..., min_length=5, max_length=150,
        description="Correo electrónico registrado del colaborador",
        example="colaborador@upq.edu.mx"
    )
    password: str = Field(
        ..., min_length=4, max_length=128,
        description="Contraseña del colaborador"
    )


class ColaboradorRegister(BaseModel):
    # NOT NULL en Usuarios — requeridos
    nombre: str = Field(
        ..., min_length=2, max_length=100,
        description="Primer nombre del colaborador",
        example="Ana"
    )
    email: EmailStr = Field(
        ..., max_length=150,
        description="Correo electrónico institucional",
        example="ana.garcia@upq.edu.mx"
    )
    password: str = Field(
        ..., min_length=6, max_length=128,
        description="Contraseña (mínimo 6 caracteres)"
    )
    # Nullable en BD Colaboradores, pero requeridos por lógica de registro
    especialidad: str = Field(
        ..., min_length=3, max_length=100,
        description="Área de especialización científica",
        example="Biología Marina"
    )
    grado_academico: str = Field(
        ..., min_length=2, max_length=50,
        description="Grado académico más alto obtenido",
        example="Maestría"
    )
    institucion: str = Field(
        ..., min_length=3, max_length=200,
        description="Institución u organización de adscripción",
        example="Universidad Politécnica de Querétaro"
    )
    años_experiencia: str = Field(
        ..., min_length=1, max_length=3,
        description="Años de experiencia profesional",
        example="5"
    )
    motivacion: str = Field(
        ..., min_length=10, max_length=1000,
        description="Motivación para unirse a SWAY como colaborador"
    )
    # Nullable en BD Usuarios — valor por defecto cadena vacía; nunca Optional para evitar anyOf en Swagger
    apellidoPaterno: str = Field(
        "", max_length=100,
        description="Apellido paterno",
        example="García"
    )
    apellidoMaterno: str = Field(
        "", max_length=100,
        description="Apellido materno",
        example="López"
    )
    numero_cedula: str = Field(
        "", max_length=20,
        description="Número de cédula profesional"
    )
    orcid: str = Field(
        "", max_length=50,
        description="Identificador ORCID del investigador",
        example="0000-0002-1825-0097"
    )

    @field_validator("años_experiencia")
    @classmethod
    def validar_años_experiencia_digitos(cls, v):
        if not v.isdigit():
            raise ValueError("años_experiencia debe contener solo dígitos")
        return v


class CheckEmail(BaseModel):
    email: EmailStr = Field(
        ..., max_length=150,
        description="Correo electrónico a verificar disponibilidad",
        example="nuevo@upq.edu.mx"
    )


class CheckOrcid(BaseModel):
    orcid: str = Field(
        ..., min_length=1, max_length=50,
        description="ORCID a verificar disponibilidad",
        example="0000-0002-1825-0097"
    )


class CheckCedula(BaseModel):
    cedula: str = Field(
        ..., min_length=1, max_length=20,
        description="Cédula profesional a verificar disponibilidad"
    )


class ColaboradorPerfilUpdate(BaseModel):
    # Partial update — campos con default "" no generan anyOf en Swagger
    # Campos de tabla Usuarios
    nombre: str = Field("", min_length=0, max_length=100, description="Primer nombre")
    apellido_paterno: str = Field("", max_length=100, description="Apellido paterno")
    apellido_materno: str = Field("", max_length=100, description="Apellido materno")
    telefono: str = Field("", max_length=15, description="Teléfono de contacto")
    fecha_nacimiento: str = Field("", description="Fecha de nacimiento en formato YYYY-MM-DD")
    # Campos de tabla Colaboradores
    especialidad: str = Field("", min_length=0, max_length=100, description="Área de especialización")
    grado_academico: str = Field("", min_length=0, max_length=50, description="Grado académico")
    institucion: str = Field("", min_length=0, max_length=200, description="Institución de adscripción")
    años_experiencia: str = Field("", max_length=3, description="Años de experiencia")
    numero_cedula: str = Field("", max_length=20, description="Número de cédula profesional")
    orcid: str = Field("", max_length=50, description="Identificador ORCID")
    motivacion: str = Field("", max_length=1000, description="Motivación del colaborador")

    @field_validator("años_experiencia")
    @classmethod
    def validar_años_experiencia_digitos(cls, v):
        if v != "" and not v.isdigit():
            raise ValueError("años_experiencia debe contener solo dígitos")
        return v


class ColaboradorPasswordChange(BaseModel):
    # Ambos requeridos para cambio de contraseña
    password_actual: str = Field(
        ..., min_length=4, max_length=128,
        description="Contraseña actual (para verificación)"
    )
    password_nuevo: str = Field(
        ..., min_length=6, max_length=128,
        description="Nueva contraseña (mínimo 6 caracteres)"
    )
