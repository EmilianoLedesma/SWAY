from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Numeric,
    Date, Time, ForeignKey, TIMESTAMP
)
from sqlalchemy.orm import relationship
from app.data.database import Base


# ---------------------------------------------------------------------------
# Catalogos simples
# ---------------------------------------------------------------------------

class EstadoConservacion(Base):
    __tablename__ = "estadosconservacion"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))
    descripcion = Column(Text)

    especies = relationship("Especie", back_populates="estado_conservacion")


class Habitat(Base):
    __tablename__ = "habitats"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100))
    descripcion = Column(Text)


class Amenaza(Base):
    __tablename__ = "amenazas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100))
    descripcion = Column(Text)


class Caracteristica(Base):
    __tablename__ = "caracteristicas"

    id = Column(Integer, primary_key=True, index=True)
    tipo_caracteristica = Column(String(50))
    valor = Column(String(100))


class Estado(Base):
    __tablename__ = "estados"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))

    municipios = relationship("Municipio", back_populates="estado")


class Municipio(Base):
    __tablename__ = "municipios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))
    id_estado = Column(Integer, ForeignKey("estados.id"))

    estado = relationship("Estado", back_populates="municipios")
    colonias = relationship("Colonia", back_populates="municipio")


class Colonia(Base):
    __tablename__ = "colonias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))
    id_municipio = Column(Integer, ForeignKey("municipios.id"))
    cp = Column(Integer)

    municipio = relationship("Municipio", back_populates="colonias")
    calles = relationship("Calle", back_populates="colonia")


class Calle(Base):
    __tablename__ = "calles"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))
    id_colonia = Column(Integer, ForeignKey("colonias.id"))
    n_interior = Column(Integer)
    n_exterior = Column(Integer)

    colonia = relationship("Colonia", back_populates="calles")


class Direccion(Base):
    __tablename__ = "direcciones"

    id = Column(Integer, primary_key=True, index=True)
    id_calle = Column(Integer, ForeignKey("calles.id"))

    calle = relationship("Calle")


class Estatus(Base):
    __tablename__ = "estatus"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class TipoEvento(Base):
    __tablename__ = "tiposevento"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))
    descripcion = Column(Text)


class Modalidad(Base):
    __tablename__ = "modalidades"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))


class Organizacion(Base):
    __tablename__ = "organizaciones"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class Cargo(Base):
    __tablename__ = "cargos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class CategoriaProducto(Base):
    __tablename__ = "categoriasproducto"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))
    descripcion = Column(Text)


class Material(Base):
    __tablename__ = "materiales"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))


class TipoTarjeta(Base):
    __tablename__ = "tipostarjeta"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class TipoDonacion(Base):
    __tablename__ = "tipodonaciones"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class Especialidad(Base):
    __tablename__ = "especialidades"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class Institucion(Base):
    __tablename__ = "instituciones"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(254))


class Idioma(Base):
    __tablename__ = "idiomas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))


class TipoRecurso(Base):
    __tablename__ = "tiposrecurso"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))
    descripcion = Column(Text)


class TagRecurso(Base):
    __tablename__ = "tagsrecurso"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))


class GradoAcademico(Base):
    __tablename__ = "gradosacademicos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))
    nivel = Column(Integer)
    activo = Column(Boolean)


class EspecialidadColaborador(Base):
    __tablename__ = "especialidadescolaboradores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100))
    descripcion = Column(Text)
    activo = Column(Boolean)


class InstitucionColaborador(Base):
    __tablename__ = "institucionescolaboradores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200))
    pais = Column(String(100))
    tipo = Column(String(50))
    activo = Column(Boolean)


# ---------------------------------------------------------------------------
# Entidades principales
# ---------------------------------------------------------------------------

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50))
    apellido_paterno = Column(String(50))
    apellido_materno = Column(String(50))
    email = Column(String(100), unique=True, index=True)
    password_hash = Column(String(255))
    telefono = Column(String(20))
    fecha_nacimiento = Column(Date)
    suscrito_newsletter = Column(Boolean, default=False)
    fecha_registro = Column(TIMESTAMP)
    activo = Column(Boolean, default=True)

    colaboradores = relationship("Colaborador", back_populates="usuario")
    avistamientos = relationship("Avistamiento", back_populates="usuario")
    contactos = relationship("Contacto", back_populates="usuario")
    testimonios = relationship("Testimonio", back_populates="usuario")
    pedidos = relationship("Pedido", back_populates="usuario")
    donadores = relationship("Donador", back_populates="usuario")
    registros_evento = relationship("RegistroEvento", back_populates="usuario")


class Colaborador(Base):
    __tablename__ = "colaboradores"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    especialidad = Column(String(100))
    grado_academico = Column(String(50))
    institucion = Column(String(200))
    años_experiencia = Column(String(20))
    numero_cedula = Column(String(20))
    orcid = Column(String(50))
    motivacion = Column(Text)
    estado_solicitud = Column(String(50))
    fecha_solicitud = Column(TIMESTAMP)
    fecha_aprobacion = Column(TIMESTAMP)
    aprobado_por = Column(Integer)
    comentarios_admin = Column(Text)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(TIMESTAMP)
    fecha_modificacion = Column(TIMESTAMP)

    usuario = relationship("Usuario", back_populates="colaboradores")


class Administrador(Base):
    __tablename__ = "administradores"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))

    usuario = relationship("Usuario")


class Especie(Base):
    __tablename__ = "especies"

    id = Column(Integer, primary_key=True, index=True)
    nombre_comun = Column(String(100))
    nombre_cientifico = Column(String(100))
    descripcion = Column(Text)
    esperanza_vida = Column(Integer)
    poblacion_estimada = Column(Integer)
    id_estado_conservacion = Column(Integer, ForeignKey("estadosconservacion.id"))
    imagen_url = Column(String(255))

    estado_conservacion = relationship("EstadoConservacion", back_populates="especies")
    avistamientos = relationship("Avistamiento", back_populates="especie")


class EspecieHabitat(Base):
    __tablename__ = "especieshabitats"

    id_especie = Column(Integer, ForeignKey("especies.id"), primary_key=True)
    id_habitat = Column(Integer, ForeignKey("habitats.id"), primary_key=True)


class EspecieAmenaza(Base):
    __tablename__ = "especiesamenazas"

    id_especie = Column(Integer, ForeignKey("especies.id"), primary_key=True)
    id_amenaza = Column(Integer, ForeignKey("amenazas.id"), primary_key=True)


class EspecieCaracteristica(Base):
    __tablename__ = "especiescaracteristicas"

    id_especie = Column(Integer, ForeignKey("especies.id"), primary_key=True)
    id_caracteristica = Column(Integer, ForeignKey("caracteristicas.id"), primary_key=True)


class Avistamiento(Base):
    __tablename__ = "avistamientos"

    id = Column(Integer, primary_key=True, index=True)
    id_especie = Column(Integer, ForeignKey("especies.id"))
    fecha = Column(TIMESTAMP)
    latitud = Column(Numeric(10, 8))
    longitud = Column(Numeric(11, 8))
    notas = Column(Text)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    foto_url = Column(Text, nullable=True)

    especie = relationship("Especie", back_populates="avistamientos")
    usuario = relationship("Usuario", back_populates="avistamientos")


class Organizador(Base):
    __tablename__ = "organizadores"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    id_organizacion = Column(Integer, ForeignKey("organizaciones.id"))
    id_cargo = Column(Integer, ForeignKey("cargos.id"))
    experiencia_eventos = Column(Integer)
    certificado = Column(Boolean)
    fecha_alta = Column(TIMESTAMP)

    usuario = relationship("Usuario")
    eventos = relationship("Evento", back_populates="organizador")


class Evento(Base):
    __tablename__ = "eventos"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(200))
    descripcion = Column(Text)
    fecha_evento = Column(Date)
    hora_inicio = Column(Time)
    hora_fin = Column(Time)
    id_tipo_evento = Column(Integer, ForeignKey("tiposevento.id"))
    id_modalidad = Column(Integer, ForeignKey("modalidades.id"))
    id_direccion = Column(Integer, ForeignKey("direcciones.id"))
    url_evento = Column(String(255))
    capacidad_maxima = Column(Integer)
    costo = Column(Numeric(10, 2))
    id_organizador = Column(Integer, ForeignKey("organizadores.id"))
    id_estatus = Column(Integer, ForeignKey("estatus.id"))
    fecha_creacion = Column(TIMESTAMP)

    tipo_evento = relationship("TipoEvento")
    modalidad_rel = relationship("Modalidad")
    organizador = relationship("Organizador", back_populates="eventos")
    estatus = relationship("Estatus")
    direccion = relationship("Direccion")
    registros = relationship("RegistroEvento", back_populates="evento")


class RegistroEvento(Base):
    __tablename__ = "registrosevento"

    id = Column(Integer, primary_key=True, index=True)
    id_evento = Column(Integer, ForeignKey("eventos.id"))
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    fecha_registro = Column(TIMESTAMP)
    asistio = Column(Boolean)

    evento = relationship("Evento", back_populates="registros")
    usuario = relationship("Usuario", back_populates="registros_evento")


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100))
    descripcion = Column(Text)
    precio = Column(Numeric(10, 2))
    id_categoria = Column(Integer, ForeignKey("categoriasproducto.id"))
    stock = Column(Integer)
    imagen_url = Column(String(255))
    id_material = Column(Integer, ForeignKey("materiales.id"))
    dimensiones = Column(String(100))
    peso_gramos = Column(Integer)
    es_sostenible = Column(Boolean)
    activo = Column(Boolean, default=True)
    fecha_agregado = Column(TIMESTAMP)

    categoria = relationship("CategoriaProducto")
    material = relationship("Material")
    resenas = relationship("ResenaProducto", back_populates="producto")


class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    fecha_pedido = Column(TIMESTAMP)
    total = Column(Numeric(10, 2))
    id_estatus = Column(Integer, ForeignKey("estatus.id"))
    id_direccion = Column(Integer, ForeignKey("direcciones.id"))
    telefono_contacto = Column(String(20))

    usuario = relationship("Usuario", back_populates="pedidos")
    estatus = relationship("Estatus")
    direccion = relationship("Direccion")
    detalles = relationship("DetallePedido", back_populates="pedido")
    pagos = relationship("PagoPedido", back_populates="pedido")


class DetallePedido(Base):
    __tablename__ = "detallespedido"

    id = Column(Integer, primary_key=True, index=True)
    id_pedido = Column(Integer, ForeignKey("pedidos.id"))
    id_producto = Column(Integer, ForeignKey("productos.id"))
    cantidad = Column(Integer)
    precio_unitario = Column(Numeric(10, 2))
    subtotal = Column(Numeric(10, 2))

    pedido = relationship("Pedido", back_populates="detalles")
    producto = relationship("Producto")


class PagoPedido(Base):
    __tablename__ = "pagospedidos"

    id = Column(Integer, primary_key=True, index=True)
    id_pedido = Column(Integer, ForeignKey("pedidos.id"))
    numero_tarjeta = Column(String(16))
    fecha_expiracion = Column(String(5))
    cvv = Column(String(4))
    nombre_tarjeta = Column(String(100))
    id_tipotarjeta = Column(Integer, ForeignKey("tipostarjeta.id"))
    monto = Column(Numeric(10, 2))
    fecha_pago = Column(TIMESTAMP)
    id_estatus = Column(Integer, ForeignKey("estatus.id"))

    pedido = relationship("Pedido", back_populates="pagos")
    tipo_tarjeta = relationship("TipoTarjeta")


class Donador(Base):
    __tablename__ = "donadores"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    monto = Column(Numeric(10, 2))
    fecha_donacion = Column(TIMESTAMP)
    id_tipodonacion = Column(Integer, ForeignKey("tipodonaciones.id"))

    usuario = relationship("Usuario", back_populates="donadores")
    donaciones = relationship("Donacion", back_populates="donador")


class Donacion(Base):
    __tablename__ = "donaciones"

    id = Column(Integer, primary_key=True, index=True)
    id_donador = Column(Integer, ForeignKey("donadores.id"))
    numero_tarjeta_encriptado = Column(String(256))
    fecha_expiracion_encriptada = Column(String(256))
    cvv_encriptado = Column(String(256))
    id_tipotarjeta = Column(Integer, ForeignKey("tipostarjeta.id"))

    donador = relationship("Donador", back_populates="donaciones")


class Testimonio(Base):
    __tablename__ = "testimonios"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    testimonio = Column(Text)
    fecha_creacion = Column(TIMESTAMP)
    aprobado = Column(Boolean)

    usuario = relationship("Usuario", back_populates="testimonios")


class Contacto(Base):
    __tablename__ = "contactos"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    asunto = Column(String(50))
    mensaje = Column(Text)
    fecha_contacto = Column(TIMESTAMP)
    respondido = Column(Boolean)

    usuario = relationship("Usuario", back_populates="contactos")


class Autor(Base):
    __tablename__ = "autores"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    biografia = Column(Text)
    id_especialidad = Column(Integer, ForeignKey("especialidades.id"))
    id_institucion = Column(Integer, ForeignKey("instituciones.id"))
    fecha_alta = Column(TIMESTAMP)

    usuario = relationship("Usuario")
    especialidad = relationship("Especialidad")
    institucion = relationship("Institucion")


class RecursoBiblioteca(Base):
    __tablename__ = "recursosbiblioteca"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(200))
    descripcion = Column(Text)
    id_tipo_recurso = Column(Integer, ForeignKey("tiposrecurso.id"))
    archivo_url = Column(String(255))
    tamaño_mb = Column(Numeric(10, 2))
    formato = Column(String(20))
    id_autor = Column(Integer, ForeignKey("autores.id"))
    fecha_publicacion = Column(Date)
    numero_paginas = Column(Integer)
    duracion_minutos = Column(Integer)
    id_idioma = Column(Integer, ForeignKey("idiomas.id"))
    licencia = Column(String(100))
    activo = Column(Boolean)
    fecha_agregado = Column(TIMESTAMP)

    tipo_recurso = relationship("TipoRecurso")
    autor = relationship("Autor")
    idioma = relationship("Idioma")


class RecursoTag(Base):
    __tablename__ = "recursostags"

    id_recurso = Column(Integer, ForeignKey("recursosbiblioteca.id"), primary_key=True)
    id_tag = Column(Integer, ForeignKey("tagsrecurso.id"), primary_key=True)


class DescargaRecurso(Base):
    __tablename__ = "descargasrecurso"

    id = Column(Integer, primary_key=True, index=True)
    id_recurso = Column(Integer, ForeignKey("recursosbiblioteca.id"))
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    fecha_descarga = Column(TIMESTAMP)
    ip_descarga = Column(String(45))


class ResenaProducto(Base):
    __tablename__ = "ReseñasProducto"

    id = Column(Integer, primary_key=True, index=True)
    id_producto = Column(Integer, ForeignKey("productos.id"))
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    calificacion = Column(Integer)
    comentario = Column(Text)
    fecha_resena = Column("fecha_reseña", TIMESTAMP)

    producto = relationship("Producto", back_populates="resenas")
    usuario = relationship("Usuario")
