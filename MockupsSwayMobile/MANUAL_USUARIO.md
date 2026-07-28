# Manual de Interfaces — SWAY

## Aplicación Móvil de Colaboración Científica para el Registro de Especies Marinas

---

# 1. Logo

| Elemento | Descripción |
|---|---|
| **Nombre de la marca** | SWAY |
| **Archivo** | `assets/SwayLogo.jpeg` |
| **Uso** | Pantalla de inicio de sesión, cabecera de pantallas principales |

El logotipo de SWAY consiste en un isotipo representativo junto con el nombre de la marca. Se utiliza como elemento central en la pantalla de Login y como parte del header en las pantallas principales del aplicativo. El logo se muestra en la parte superior izquierda de cada pantalla, excepto en la pantalla de Notificaciones donde se omite para dar espacio al título.

**Ubicación en la app:**
- LoginScreen: Centrado en la parte superior
- CatalogScreen, AnimalCrudScreen, SightingsScreen, EventsScreen, ProfileScreen: En el header vía componente `ScreenHeader`

---

# 2. Paleta de Colores

## Colores Primarios

| Nombre | Código | Muestra | Uso |
|---|---|---|---|
| **Azul primario** | `#0071e3` | ■ | Botones principales, links, acentos |
| **Azul hover** | `#0077ed` | ■ | Estado hover de botones |
| **Azul tenue** | `#0059b3` | ■ | Variante oscura del primario |
| **Azul luz** | `rgba(0, 113, 227, 0.09)` | ■ | Fondos de chips y badges azules |

## Colores Secundarios (Océano)

| Nombre | Código | Muestra | Uso |
|---|---|---|---|
| **Océano** | `#47b2e4` | ■ | Acentos secundarios, timeline de avistamientos |
| **Océano oscuro** | `#37517e` | ■ | Textos y variantes |
| **Océano luz** | `rgba(71, 178, 228, 0.10)` | ■ | Fondos |

## Fondos y Superficies

| Nombre | Código | Muestra | Uso |
|---|---|---|---|
| **Fondo** | `#f5f5f7` | ■ | Fondo general de la app |
| **Superficie** | `#ffffff` | ■ | Tarjetas, modales, inputs |

## Textos

| Nombre | Código | Muestra | Uso |
|---|---|---|---|
| **Texto principal** | `#1d1d1f` | ■ | Títulos, párrafos principales |
| **Texto secundario** | `#6e6e73` | ■ | Subtítulos, metadatos |
| **Texto terciario** | `#aeaeb2` | ■ | Placeholders, texto deshabilitado |

## Colores Semánticos (Estados de Conservación)

| Nombre | Código | Muestra | Significado |
|---|---|---|---|
| **Rojo** | `#ff3b30` | ■ | Peligro crítico |
| **Naranja** | `#ff6b35` | ■ | En peligro |
| **Ámbar** | `#ff9500` | ■ | Vulnerable |
| **Amarillo** | `#f59e0b` | ■ | Casi amenazada |
| **Verde** | `#34c759` | ■ | Preocupación menor |

## Bordes

| Nombre | Código | Uso |
|---|---|---|
| **Borde** | `rgba(0,0,0,0.08)` | Bordes de tarjetas y componentes |
| **Borde medio** | `#d2d2d7` | Divisores y bordes más visibles |

---

# 3. Tipografía

## Familias Tipográficas

| Rol | iOS | Android | Uso |
|---|---|---|---|
| **Display (títulos)** | SF Pro Display | Poppins | Títulos principales, headers |
| **Body (cuerpo)** | SF Pro Text | Open Sans | Texto general, párrafos |
| **Mono (monoespaciada)** | SF Mono | Menlo | Código o datos técnicos |

## Escala de Tamaños

| Token | Tamaño | Uso |
|---|---|---|
| `xs` | 11px | Texto auxiliar, etiquetas |
| `sm` | 12px | Metadatos, badges pequeños |
| `md` | 14px | Cuerpo de texto estándar |
| `lg` | 15px | Texto destacado |
| `xl` | 17px | Subtítulos |
| `xxl` | 22px | Títulos de sección |
| `hero` | 32px | Título principal (Login) |

## Pesos

| Token | Peso | Uso |
|---|---|---|
| `regular` | 400 | Texto de cuerpo |
| `medium` | 500 | Texto semidestacado |
| `semibold` | 600 | Subtítulos, botones |
| `bold` | 700 | Títulos |
| `extrabold` | 800 | Títulos principales |

## Radios de Borde

| Token | Valor | Uso |
|---|---|---|
| `r4` | 4px | Badges pequeños |
| `r8` | 8px | Inputs, chips |
| `r12` | 12px | Tarjetas |
| `r16` | 16px | Modales, contenedores grandes |
| `r20` | 20px | Componentes especiales |
| `r24` | 24px | Secciones principales |
| `r99` | 999px | Elementos circulares (avatars, botones redondos) |

## Sombras

| Token | Opacidad | Elevación | Uso |
|---|---|---|---|
| `xs` | 6% | 1 | Sombras sutiles |
| `sm` | 7% | 2 | Tarjetas, modales ligeros |
| `md` | 10% | 4 | Modales destacados |

---

# 4. Iconografía

**Librería:** `@expo/vector-icons` — **Ionicons**

## Iconos de Navegación (Tabs)

| Icono | Tipo | Pantalla |
|---|---|---|
| `apps-outline` / `apps` | Ionicons | Catálogo (Tab 1) |
| `fish-outline` / `fish` | Ionicons | Animales (Tab 2) |
| `binoculars-outline` / `binoculars` | Ionicons | Avistamientos (Tab 3) |
| `calendar-outline` / `calendar` | Ionicons | Eventos (Tab 4) |
| `person-outline` / `person` | Ionicons | Perfil (Tab 5) |

## Iconos de Acción

| Icono | Acción |
|---|---|
| `search` / `search-outline` | Buscar |
| `close-circle` / `close` | Cerrar / Limpiar |
| `chevron-back` | Retroceder |
| `add-circle-outline` | Nuevo / Agregar |
| `eye-outline` | Ver detalle |
| `pencil-outline` | Editar |
| `trash-outline` | Eliminar |
| `copy-outline` | Duplicar |
| `cloud-upload-outline` | Publicar |
| `share-outline` | Compartir |
| `refresh-outline` | Reenviar |
| `checkmark` | Guardar |
| `checkmark-done-outline` | Marcar todas como leídas |
| `log-out-outline` | Cerrar sesión |
| `notifications-outline` | Campana de notificaciones |

## Iconos de Información (Detalle de Especie)

| Icono | Significado |
|---|---|
| `water` | Hábitat acuático |
| `shield` | Protección / Estado |
| `boat` | Avistamiento en barco |
| `skull` | Especie en peligro |
| `sparkles` | Especie destacada |
| `airplane` | Migración |
| `snow` | Aguas frías |
| `rose` | Especie única |
| `paw` | Mamífero marino |
| `moon` | Hábitat nocturno |

## Iconos de Notificación

| Icono | Tipo de notificación |
|---|---|
| `binoculars` | Avistamiento (sighting) |
| `calendar` | Evento (event) |
| `trophy` | Logro/Insignia (badge) |
| `megaphone` | Sistema (system) |

## Iconos de Perfil y Badges

| Icono | Significado |
|---|---|
| `leaf-outline` | Estadística: especies registradas |
| `compass-outline` | Badge: Explorador inicial |
| `water-outline` | Badge: Guardián del océano |
| `flower-outline` | Badge: Coleccionista |
| `lock-closed-outline` | Badge bloqueado |

## Iconos de Formulario

| Icono | Campo |
|---|---|
| `camera` / `camera-outline` | Fotografía |
| `location-outline` | Ubicación |
| `time-outline` | Hora |
| `people-outline` | Participantes |
| `create-outline` | Nuevo registro |

---

# 5. Interfaces Programadas en React Native

## 5.1 LoginScreen — Inicio de Sesión

**Archivo:** `src/screens/LoginScreen.js`

**Función principal:** Autenticación de usuarios colaboradores.

**Objetivos:**
- Permitir al colaborador iniciar sesión con correo y contraseña
- Permitir crear una cuenta nueva
- Validar que los campos obligatorios estén completos
- Confirmar que las contraseñas coincidan en el registro

**Elementos de la interfaz:**
1. Logo SWAY centrado en la parte superior
2. Título "Iniciar Sesión" o "Crear Cuenta" según el modo
3. Campo: Nombre completo (solo en registro)
4. Campo: Correo electrónico (teclado tipo email)
5. Campo: Contraseña (oculta)
6. Campo: Confirmar contraseña (solo en registro)
7. Enlace "¿Olvidaste tu contraseña?" (solo en login)
8. Botón principal: "Iniciar Sesión" / "Crear Cuenta"
9. Indicador de carga mientras se procesa la autenticación
10. Separador "o"
11. Enlace de alternancia entre login y registro
12. Banner de error en caso de validación fallida

**Comportamiento:**
- El formulario se adapta con `KeyboardAvoidingView` para evitar que el teclado opaque los campos
- Los campos de contraseña usan `secureTextEntry` para ocultar el texto
- Al enviar, se muestra un `ActivityIndicator` y se deshabilita el botón
- Los errores se muestran en un banner rojo sobre el formulario

---

## 5.2 CatalogScreen — Catálogo de Especies

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

---

## 5.3 AnimalCrudScreen — Gestión de Animales (CRUD)

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

---

## 5.4 SightingsScreen — Avistamientos

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

---

## 5.5 EventsScreen — Eventos

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

---

## 5.6 NotificationsScreen — Centro de Notificaciones

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

---

## 5.7 ProfileScreen — Perfil de Usuario

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

---

# 6. Navegación General de la App

```
AppNavigator (Stack)
├── LoginScreen (si no ha iniciado sesión)
└── MainTabs (si ha iniciado sesión)
    ├── Tab 1: CatalogScreen — Catálogo
    ├── Tab 2: AnimalCrudScreen — Animales
    ├── Tab 3: SightingsScreen — Avistamientos
    ├── Tab 4: EventsScreen — Eventos
    └── Tab 5: ProfileScreen — Perfil
        └── → NotificationsScreen (desde header)
```

**Tipo de navegación:**
- **Stack principal:** React Navigation NativeStack
- **Tabs superiores:** Material Top Tab Navigator (5 tabs)
- **Transiciones:** Pantalla de login → Tabs principales (sin animación de retroceso al login)
- **Notificaciones:** Push hacia la derecha desde cualquier pantalla con header

---

# 7. Componentes Compartidos

## ScreenHeader

**Archivo:** `src/components/ScreenHeader.js`

Componente reutilizable que encabeza todas las pantallas principales.

**Propiedades (props):**
| Prop | Tipo | Descripción |
|---|---|---|
| `title` | string | Título de la pantalla |
| `subtitle` | string (opcional) | Subtítulo informativo |
| `hideLogo` | boolean | Oculta el logo SWAY |
| `hideBell` | boolean | Oculta el icono de campana |
| `showBack` | boolean | Muestra botón de retroceso |

**Comportamiento:**
- Muestra el logo SWAY o un botón de retroceso según el contexto
- Incluye acceso directo al centro de notificaciones mediante campana
- El subtítulo muestra información contextual como totales o contadores

---

# 8. Datos de la Aplicación

## Especies Marinas (13 registradas)

| # | Nombre Común | Nombre Científico | Estado |
|---|---|---|---|
| 1 | Vaquita Marina | Phocoena sinus | Peligro crítico |
| 2 | Tortuga Carey | Eretmochelys imbricata | Peligro crítico |
| 3 | Ballena Azul | Balaenoptera musculus | En peligro |
| 4 | Tiburón Blanco | Carcharodon carcharias | Vulnerable |
| 5 | Pez Payaso | Amphiprion ocellaris | Preocupación menor |
| 6 | Mantarraya | Manta birostris | Vulnerable |
| 7 | Pingüino de Humboldt | Spheniscus humboldti | Vulnerable |
| 8 | Delfín Nariz de Botella | Tursiops truncatus | Preocupación menor |
| 9 | Coral Cuerno de Alce | Acropora palmata | Peligro crítico |
| 10 | Tortuga Laud | Dermochelys coriacea | Vulnerable |
| 11 | Lobo Marino de Galápagos | Zalophus wollebaeki | En peligro |
| 12 | Pez Luna | Mola mola | Vulnerable |
| 13 | Tiburón Ballena | Rhincodon typus | En peligro |

## Datos Técnicos

| Aspecto | Especificación |
|---|---|
| **Framework** | React Native (Expo SDK 54) |
| **Lenguaje** | JavaScript |
| **Navegación** | @react-navigation/native + @react-navigation/material-top-tabs |
| **Iconos** | @expo/vector-icons (Ionicons) |
| **Plataformas** | iOS, Android, Web |
| **Idioma** | Español (México) |
| **Backend** | Datos locales (hardcodeados) — Fase prototipo |
