# 5.5 EventsScreen — Eventos

**Archivo:** `src/screens/EventsScreen.js`

**Función principal:** Visualización y gestión de eventos científicos y comunitarios.

**Objetivos:**
- Visualizar eventos próximos y pasados
- Buscar eventos por nombre o ubicación
- Filtrar por estado: Próximo / Pasado
- Consultar detalle completo de cada evento
- Crear nuevos eventos
- Duplicar eventos pasados
- Eliminar eventos con confirmación

**Elementos de la interfaz:**
1. Header con logo SWAY, título "Eventos", subtítulo con próximos
2. Barra de búsqueda
3. Filtros horizontales: Todos / Próximo / Pasado
4. Botón "+ Crear evento" con borde punteado
5. Tarjetas de evento con:
   - Bloque de fecha (día grande + mes, estilizado)
   - Nombre del evento
   - Badge de estado: Próximo (azul) / Pasado (gris)
   - Metadatos: ubicación, horario, participantes (con indicador "Completo" si llega al límite)
   - Barra de acciones: Ver / Editar y Compartir (si próximo) o Duplicar (si pasado) / Eliminar
6. Modal de detalle con:
   - Bloque de fecha grande
   - Nombre + badge de estado
   - Grid: Ubicación / Horario / Participantes / Organiza
   - Descripción del evento
7. Diálogo de confirmación para eliminar

**Comportamiento:**
- Los eventos próximos tienen prioridad visual y aparecen primero
- El badge "Completo" aparece cuando participantes = maxParticipantes
- Los eventos pasados muestran opción "Duplicar" en lugar de "Editar y Compartir"
- La búsqueda filtra por nombre y ubicación simultáneamente
