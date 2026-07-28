# 5.7 ProfileScreen — Perfil de Usuario

**Archivo:** `src/screens/ProfileScreen.js`

**Función principal:** Gestión del perfil de usuario, preferencias y actividad.

**Objetivos:**
- Visualizar y editar información personal (nombre, correo, institución, biografía)
- Consultar estadísticas de actividad (avistamientos, especies registradas, eventos)
- Cambiar contraseña
- Gestionar preferencias de notificaciones
- Visualizar logros e insignias desbloqueadas
- Consultar actividad reciente
- Cerrar sesión

**Elementos de la interfaz:**
1. Header con logo SWAY, título "Perfil", subtítulo "Colaborador científico"
2. Tarjeta de perfil con:
   - Avatar circular (icono de persona)
   - Nombre completo
   - Correo electrónico
   - Fila de estadísticas: 3 indicadores (Avistamientos, Especies, Eventos) con icono, número y etiqueta
3. Tabs de sección: Información | Seguridad | Actividad
4. **Sección Información:**
   - Modo visualización: filas con label + valor (Nombre, Correo, Institución, Biografía)
   - Botón "Editar perfil"
   - Modo edición: campos de texto editables + botones Cancelar / Guardar
   - Preferencias de notificaciones: 4 interruptores (Switch) con label y descripción:
     - Avistamientos: "Nuevos avistamientos verificados"
     - Eventos: "Recordatorios de eventos próximos"
     - Logros: "Nuevos logros desbloqueados"
     - Sistema: "Actualizaciones del sistema"
   - Botón "Cerrar sesión" (rojo) con confirmación mediante diálogo nativo
5. **Sección Seguridad:**
   - Campo: Contraseña actual
   - Campo: Nueva contraseña
   - Campo: Confirmar nueva contraseña
   - Botón: "Actualizar contraseña"
6. **Sección Actividad:**
   - Logros: Grid de 4 badges (2 desbloqueados, 2 bloqueados con candado):
     - Explorador inicial (desbloqueado)
     - Guardián del océano (desbloqueado)
     - Coleccionista (bloqueado)
     - — (bloqueado)
   - Actividad reciente: lista de 3 eventos con punto y descripción

**Comportamiento:**
- El perfil alterna entre modo visualización y modo edición
- Los cambios en preferencias de notificaciones se guardan automáticamente
- El cambio de contraseña requiere completar los 3 campos
- Cerrar sesión muestra una alerta de confirmación
- Los badges bloqueados muestran un icono de candado
