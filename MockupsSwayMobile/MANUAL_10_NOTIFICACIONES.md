# 5.6 NotificationsScreen — Centro de Notificaciones

**Archivo:** `src/screens/NotificationsScreen.js`

**Función principal:** Centro de notificaciones y alertas del usuario colaborador.

**Objetivos:**
- Visualizar todas las notificaciones recibidas
- Marcar notificaciones individuales como leídas
- Marcar todas las notificaciones como leídas
- Eliminar notificaciones individuales
- Mostrar contador de notificaciones no leídas

**Elementos de la interfaz:**
1. Header con título "Notificaciones", subtítulo con no leídas, botón de retroceso
2. Botón "Marcar todas como leídas" (visible solo si hay no leídas)
3. Lista de tarjetas de notificación con:
   - Icono según tipo (avistamiento, evento, logro, sistema) con fondo de color distintivo
   - Título en negrita si no está leída + punto azul indicador
   - Cuerpo del texto (máximo 2 líneas)
   - Tiempo relativo (ej: "hace 5 min", "hace 2 horas")
   - Botón de eliminar (icono de papelera)
   - Borde izquierdo azul si no está leída
4. Estado vacío con icono de campana tachada y mensaje

**Tipos de notificaciones:**
| Tipo | Icono | Significado |
|---|---|---|
| `sighting` | Binoculars | Avistamiento verificado o pendiente de revisión |
| `event` | Calendar | Evento próximo o recordatorio |
| `badge` | Trophy | Nuevo logro o insignia desbloqueada |
| `system` | Megaphone | Mensajes del sistema (bienvenida, actualizaciones) |

**Comportamiento:**
- Al tocar una notificación, se marca como leída automáticamente
- El punto azul y la negrita desaparecen al marcar como leída
- El borde azul izquierdo también desaparece
- "Marcar todas como leídas" actualiza todas las notificaciones visibles
- El botón de eliminar requiere deslizar o tocar el icono de papelera
- Las notificaciones no leídas aparecen siempre al inicio de la lista
