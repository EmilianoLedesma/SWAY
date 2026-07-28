# 5.2 CatalogScreen — Catálogo de Especies

**Archivo:** `src/screens/CatalogScreen.js`

**Función principal:** Explorar el catálogo completo de especies marinas.

**Objetivos:**
- Visualizar todas las especies marinas en tarjetas con imagen
- Buscar especies por nombre común o científico
- Filtrar por estado de conservación
- Consultar el detalle completo de cada especie

**Elementos de la interfaz:**
1. Header con logo SWAY, título "Catálogo" y subtítulo con total de especies
2. Barra de búsqueda con icono de lupa y botón para limpiar
3. Filtros horizontales tipo chip: Todas / Peligro crítico / En peligro / Vulnerable / Casi amenazada / Preocupación menor
4. Grilla de tarjetas en 2 columnas con:
   - Imagen de la especie (o icono placeholder)
   - Badge de estado de conservación (color + texto)
   - Nombre común
   - Nombre científico en cursiva
5. Modal inferior (bottom sheet) con detalle de especie:
   - Fotografía grande
   - Nombre común + badge de estado
   - Nombre científico
   - Descripción
   - Grid informativo: Hábitat y Población
6. Estado vacío con mensaje "No encontramos especies con ese nombre"

**Comportamiento:**
- La búsqueda filtra en tiempo real mientras se escribe
- Los filtros son mutuamente excluyentes (solo uno activo a la vez)
- Al seleccionar una tarjeta, se abre un modal desde la parte inferior
- El modal se cierra con un swipe hacia abajo o tocando fuera
