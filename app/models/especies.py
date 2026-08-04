# Para los modelos de validaciones el nombre debe reflejar la entidad que protege.
# Se usa Field para agregar validaciones adicionales: longitud, rangos, descripción y ejemplos.
from pydantic import BaseModel, Field
from typing import List, Optional


class EspecieCreate(BaseModel):
    # NOT NULL en tabla Especies — requeridos
    nombre_comun: str = Field(
        ..., min_length=2, max_length=100,
        description="Nombre común de la especie marina",
        example="Tortuga laúd"
    )
    nombre_cientifico: str = Field(
        ..., min_length=2, max_length=100,
        description="Nombre científico en nomenclatura binomial",
        example="Dermochelys coriacea"
    )
    # Nullable en BD — valor por defecto vacío o cero; nunca Optional para evitar anyOf en Swagger
    descripcion: str = Field(
        "", max_length=2000,
        description="Descripción general de la especie"
    )
    esperanza_vida: Optional[int] = Field(
        None, ge=0, le=500,
        description="Esperanza de vida en años (None = no especificada, máx. 500)"
    )
    poblacion_estimada: Optional[int] = Field(
        None, ge=0,
        description="Número estimado de individuos en la naturaleza (None = no especificado)"
    )
    id_estado_conservacion: int = Field(
        ..., ge=1,
        description="ID del estado de conservación según catálogo IUCN"
    )
    imagen_url: str = Field(
        "", max_length=255,
        description="URL de la imagen representativa de la especie"
    )
    amenazas: List[int] = Field(
        default_factory=list,
        description="Lista de IDs de amenazas asociadas"
    )
    habitats: List[int] = Field(
        default_factory=list,
        description="Lista de IDs de hábitats donde habita la especie"
    )
    firma_imagen: str = Field(
        "",
        description="Imagen de firma biométrica en base64"
    )


class EspecieUpdate(BaseModel):
    # NOT NULL en tabla Especies — requeridos también en actualización
    nombre_comun: str = Field(
        ..., min_length=2, max_length=100,
        description="Nombre común de la especie marina",
        example="Tortuga laúd"
    )
    nombre_cientifico: str = Field(
        ..., min_length=2, max_length=100,
        description="Nombre científico en nomenclatura binomial",
        example="Dermochelys coriacea"
    )
    descripcion: str = Field(
        "", max_length=2000,
        description="Descripción general de la especie"
    )
    esperanza_vida: Optional[int] = Field(
        None, ge=0, le=500,
        description="Esperanza de vida en años (None = no especificada, máx. 500)"
    )
    poblacion_estimada: Optional[int] = Field(
        None, ge=0,
        description="Número estimado de individuos en la naturaleza (None = no especificado)"
    )
    id_estado_conservacion: int = Field(
        ..., ge=1,
        description="ID del estado de conservación según catálogo IUCN"
    )
    imagen_url: str = Field(
        "", max_length=255,
        description="URL de la imagen representativa de la especie"
    )
    amenazas: List[int] = Field(
        default_factory=list,
        description="Lista de IDs de amenazas asociadas"
    )
    habitats: List[int] = Field(
        default_factory=list,
        description="Lista de IDs de hábitats donde habita la especie"
    )
    firma_imagen: str = Field(
        "",
        description="Imagen de firma biométrica en base64"
    )
