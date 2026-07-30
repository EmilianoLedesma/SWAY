# Wire real POST for Avistamientos y Eventos (mobile)

## Problema

`SightingsScreen.js` y `EventsScreen.js` solo mutan estado local en el submit — ningún `fetch` real. El pendiente #4 de `progress.md` documenta esto. La investigación de esta sesión encontró que **el backend FastAPI ya tiene ambos endpoints implementados y funcionando** — el trabajo real es puramente de wiring en mobile, no de backend.

## Backend (sin cambios, verificado)

- `POST /api/reportar-avistamiento` (`app/routers/estadisticas.py:148`, modelo `AvistamientoCreate`) — busca usuario por `email_usuario`, lo crea si no existe, crea el `Avistamiento`. Payload: `id_especie` (int, requerido), `fecha_avistamiento` (str ISO `YYYY-MM-DDTHH:MM:SS`, requerido), `latitud`/`longitud` (float, requerido), `nombre_usuario`/`email_usuario` (str, requerido), `notas` (opcional), `nombre`/`apellido_paterno`/`apellido_materno` (opcionales, usados solo si el usuario no existe aún).
- `POST /api/eventos/crear` (`app/routers/eventos.py:102`, modelo `EventoCreate` en `app/models/eventos.py`) — usa `get_optional_tienda_user`: si hay JWT válido, el organizador es el usuario autenticado (ignora `nombre_organizador`); si no hay token, crea usuario/organizador a partir de `nombre_organizador`/`contacto`. Payload requerido: `titulo`, `descripcion`, `fecha_evento`, `hora_inicio`, `id_tipo_evento`, `id_modalidad`. Opcionales: `hora_fin`, `url_evento`, `capacidad_maxima`, `costo`, `nombre_organizador`, `contacto`. No existe campo de dirección/ubicación en el modelo.
- Catálogos: `GET /api/tipos-evento` → `{success, tipos: [{id, nombre, descripcion}]}`. `GET /api/modalidades` → `{success, modalidades: [{id, nombre}]}`.

## Decisiones de scope (acordadas con el usuario)

1. **Especie no catalogada (Avistamientos):** se elimina el toggle "especie no catalogada" del formulario — solo se puede reportar una especie que ya existe en el catálogo, porque `id_especie` es FK requerida y no hay campo de texto libre en el backend.
2. **Foto (Avistamientos):** el botón de cámara se mantiene en la UI (para preview/share-card local), pero `fotoUri` **no se envía** en el POST — no existe columna ni endpoint de subida de imágenes.
3. **Ubicación (Eventos):** el campo `ubicacion` del formulario no tiene contraparte en el backend (`crear_evento` nunca setea `id_direccion`). Se mantiene el campo en la UI pero su valor se concatena al final de `descripcion` antes de enviar, para no perder el dato.
4. **Organizador (Eventos):** la app mobile siempre requiere sesión iniciada (`AppNavigator.js` — `MainTabs` completo, incluidas `Sightings` y `Events`, solo es alcanzable con `isLoggedIn`). Por eso `crearEvento` siempre manda el Bearer token vía `authHeaders()`, y el backend resuelve el organizador desde el JWT — no hace falta mandar `nombre_organizador`.

## Cambios de código

### `client.js`

Cuatro funciones nuevas, siguiendo el patrón existente (`try/catch`, `authHeaders()` donde aplique):

- `crearAvistamiento(payload)` → `POST /api/reportar-avistamiento` (sin auth headers — el endpoint no los requiere, pero no rompe si se mandan; se omiten para no crear dependencia falsa).
- `crearEvento(payload)` → `POST /api/eventos/crear` con `headers: await authHeaders()`.
- `getTiposEvento()` → `GET /api/tipos-evento`.
- `getModalidades()` → `GET /api/modalidades`.

### `SightingsScreen.js`

- `useEffect` adicional (o extendido) que llama `getProfile()` una vez al montar, guarda `{nombre, apellido_paterno, apellido_materno, email}` en un ref/estado para usarlos en el submit.
- Quitar `especieNoCatalogada` de `initialSightingForm` y de la UI (toggle + input de texto libre); el selector de especie queda catálogo-only.
- `handleReportSighting` pasa a ser `async`:
  - Arma `fecha_avistamiento` combinando `sightingForm.fecha` (`YYYY-MM-DD`) con la hora actual (`HH:MM:SS`) del dispositivo.
  - Llama `crearAvistamiento({ id_especie, fecha_avistamiento, latitud, longitud, notas, nombre_usuario: <nombre completo>, email_usuario, nombre, apellido_paterno, apellido_materno })`.
  - En éxito: cierra modal, resetea form, refresca la lista con `getAvistamientosMine()` (mismo patrón que el `useEffect` inicial), mantiene `incrementSightings`/`bumpStreak`.
  - En error: `Alert.alert` con el mensaje del backend, no cierra el modal (el usuario no pierde lo que escribió).
  - `fotoUri` no se incluye en el payload.

### `EventsScreen.js`

- `useEffect` adicional que llama `getTiposEvento()` y `getModalidades()` al montar, guarda los catálogos en estado (`tiposEvento`, `modalidades`), reemplaza las constantes hardcodeadas `TIPOS_EVENTO`/`MODALIDADES` en el render de chips.
- `eventForm.tipo`/`eventForm.modalidad` pasan a guardar el `id` numérico del catálogo (no el label); la UI muestra `nombre` pero compara/guarda por `id`.
- `handleCreateEvent` pasa a ser `async`:
  - Validaciones existentes se mantienen igual (título, descripción, capacidad, costo, contacto, términos), ajustando la de "campo requerido" para chequear `tipo`/`modalidad` como id no-nulo en vez de string no-vacío.
  - `descripcion` final = `eventForm.descripcion` + (si `eventForm.ubicacion` no está vacío) `"\n\nUbicación: " + eventForm.ubicacion`.
  - Llama `crearEvento({ titulo, descripcion: descripcionFinal, fecha_evento: fecha, hora_inicio, hora_fin, id_tipo_evento: tipo, id_modalidad: modalidad, capacidad_maxima, costo, contacto })`.
  - En éxito: cierra modal, resetea form, refresca lista con `getEventos()`, mantiene `bumpStreak()` y el alert de "Propuesta enviada".
  - En error: `Alert.alert` con el mensaje del backend, modal se mantiene abierto.

## Testing

- Verificación manual vía `curl` contra el backend local (uvicorn/docker) para ambos endpoints antes de dar por bueno el wiring, igual que se hizo en la sesión de registro de colaborador (`progress.md` sección B).
- Walkthrough en dispositivo real de ambos flujos completos (reportar avistamiento, proponer evento) queda pendiente de ejecutar — no hay simulador Expo disponible en este entorno, mismo gap que otras features ya mergeadas.

## Fuera de scope

- Subida real de fotos de avistamiento (no hay columna/endpoint).
- Campo de dirección estructurado para eventos (no hay `id_direccion` en el payload de creación).
- Cualquier cambio a `API_HOST`/conexión a producción — explícitamente pospuesto (ver pendiente #10 de `progress.md`).
