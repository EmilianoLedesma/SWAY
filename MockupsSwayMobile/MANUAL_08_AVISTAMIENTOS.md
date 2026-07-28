# 5.4 SightingsScreen — Avistamientos

**Archivo:** `src/screens/SightingsScreen.js`

**Función principal:** Registro y seguimiento de avistamientos de especies marinas.

**Objetivos:**
- Visualizar avistamientos en formato de línea de tiempo
- Buscar avistamientos por especie, ubicación o reportero
- Filtrar por estado: Verificado / Pendiente
- Consultar detalle completo de cada avistamiento
- Crear nuevos avistamientos
- Reenviar avistamientos pendientes para verificación
- Eliminar avistamientos con confirmación

**Elementos de la interfaz:**
1. Header con logo SWAY, título "Avistamientos", subtítulo con total y verificados
2. Barra de búsqueda
3. Filtros horizontales: Todos / Verificado / Pendiente
4. Botón "+ Nuevo avistamiento" con borde punteado
5. Línea de tiempo vertical (timeline con línea azul intermitente) con tarjetas que contienen:
   - Icono de cámara
   - Nombre de la especie + reportero
   - Badge de estado: Verificado (verde) / Pendiente (ámbar)
   - Metadatos: fecha, ubicación, número de individuos, indicador de foto
   - Barra de acciones: Ver / Editar / Compartir / Enviar (solo pendiente) / Eliminar
6. Modal de detalle con:
   - Icono de cámara grande
   - Especie + badge de estado
   - Grid: Fecha / Ubicación / Individuos / Reportó
   - Notas adicionales
7. Modal "Nuevo avistamiento" con interfaz de 3 pasos:
   - Capturar fotografía
   - Usar ubicación GPS
   - Completar detalles del avistamiento
8. Diálogo de confirmación para eliminar

**Comportamiento:**
- La línea de tiempo organiza los avistamientos de más reciente a más antiguo
- Los avistamientos pendientes tienen disponible el botón "Enviar" para reenvío
- El botón "Compartir" permite exportar el avistamiento a otras aplicaciones
- Al crear uno nuevo, se muestra un modal con los 3 pasos del proceso
