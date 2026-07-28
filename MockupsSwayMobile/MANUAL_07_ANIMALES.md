# 5.3 AnimalCrudScreen — Gestión de Animales (CRUD)

**Archivo:** `src/screens/AnimalCrudScreen.js`

**Función principal:** Administración completa de especies marinas por parte del colaborador.

**Objetivos:**
- Listar las especies creadas por el usuario
- Crear nuevas especies con todos sus datos
- Editar especies existentes
- Ver ficha detallada de cada especie
- Publicar especies (pasar de borrador a publicado)
- Duplicar especies ya publicadas
- Eliminar especies con confirmación previa

**Elementos de la interfaz:**
1. Header con logo SWAY, título "Animales" y subtítulo con total registradas
2. Barra de búsqueda
3. Filtros horizontales: Todas / Borrador / Publicada
4. Botón "+ Nueva especie" con borde punteado azul
5. Lista vertical de tarjetas con:
   - Fotografía o icono placeholder
   - Nombre común + badge de estado de publicación (Borrador/Publicada)
   - Nombre científico
   - Indicador de estado de conservación
   - Barra de acciones con botones: Ver, Editar, Publicar/Duplicar, Eliminar
6. Modal de detalle tipo "Ficha de especie" con icono representativo grande
7. Modal de formulario para crear/editar con campos:
   - Nombre común
   - Nombre científico
   - Estado de conservación (chips horizontales)
   - Hábitat
   - Descripción (multilínea)
   - Botones: Cancelar / Guardar
8. Diálogo de confirmación para eliminar (Alert nativo)
9. Estado vacío con icono de pez y mensaje

**Comportamiento:**
- Las tarjetas se organizan en lista vertical (una por fila)
- La barra de acciones ofrece acceso directo a las operaciones CRUD
- Publicar cambia el estado a "Publicada"; si ya está publicada, permite duplicar
- Eliminar requiere confirmación mediante un cuadro de diálogo nativo
- El formulario valida que los campos obligatorios estén llenos antes de guardar
