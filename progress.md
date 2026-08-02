# Progreso — 2026-07-29

Conclusión 360 del trabajo de hoy: 3 sesiones en paralelo, cada una en su propio git worktree sobre el mismo checkout, las 3 mergeadas a `master`.

## Resumen ejecutivo

| Sesión | Worktree | Feature | Estado |
|---|---|---|---|
| A — Biometric login + bug sweep | `mobile-biometric-login` | Login biométrico real (antes decorativo) + 4 fixes UI menores | ✅ Mergeada (`32d00e0`) — 2 archivos UI quedaron sin commitear |
| B — Bugfix session | `bugfix-session` | Formulario de registro de colaborador (mobile) con validación real | ✅ Mergeada (`d5160a5`) |
| C — Reportes filtering (esta sesión) | `reportes-filtering` | Filtros en tab Reportes (Personal/Global) + PDF filtrado | ✅ Mergeada (`7b37e72`) |

`master` actual: `7b37e72`. Las 3 features conviven sin romperse entre sí (verificado: imports de `client.js` y `ProfileScreen.js` se resolvieron en merge sin perder ninguna).

---

## A — Biometric login unlock + bug sweep

Ciclo completo `brainstorming` → spec → `writing-plans` → `subagent-driven-development` (4 tasks, worktree aislado, review por tarea + review final de rama completa).

- **Problema real resuelto:** el botón "Iniciar sesión con biometría" no verificaba identidad — cualquier éxito de huella llamaba `onLogin()` sin atar sesión a ningún token.
- Token JWT migrado de `AsyncStorage` (plano) a `expo-secure-store`.
- Flag de biometría habilitado/deshabilitado por dispositivo (`isBiometricLoginEnabled`/`setBiometricLoginEnabled`), toggle en Perfil → Seguridad.
- `LoginScreen` ahora: si hay token + flag activo, muestra panel solo-biometría; éxito revalida con `getProfile()` antes de entrar; fallo cae a formulario de contraseña.
- Review final (opus) encontró 1 Critical (boot `Promise.all` sin guard podía colgar la pantalla en spinner infinito) + 4 Important (error de red confundido con sesión expirada y borrando token válido; plugin `expo-secure-store` nunca registrado en `app.json`; token viejo en texto plano nunca limpiado; botón biométrico visible sin token, mostrando "sesión expirada" falso). Un fix wave, un re-review: todo corregido.

**Bug sweep aparte (ad hoc, mismos hallazgos por screenshot del usuario):**
- Label "AVISTAMIENTOS" wrapeaba a 2 líneas → `numberOfLines={1}` + `adjustsFontSizeToFit`.
- Tarjetas de acción rápida en Home con alturas distintas — dos causas raíz distintas (línea de hint faltante en 3 de 4 tarjetas; luego `flex:1` faltante en `TouchableOpacity` que no heredaba el stretch del wrapper).
- Saludo de Home hardcodeado → ahora usa `getProfile()`.
- Alineación de labels en form de edición de especie (CatalogScreen) — "Esperanza de vida" wrapeaba y desalineaba el input vs la columna vecina → `minHeight` en esa fila específica.

**⚠️ Pendiente de esa sesión:** `HomeScreen.js` y `CatalogScreen.js` quedaron editados pero **sin commitear** en `master` (confirmado — siguen apareciendo como `M` en `git status` ahora mismo). Hay que commitearlos.

---

## B — Formulario de registro de colaborador (mobile)

Mismo ciclo completo (`brainstorming` → spec → plan → `subagent-driven-development`, 3 tasks).

- Se detectó que la validación real de web1 vive en `templates/especies.html`, no en `index.html` como se asumió al inicio — corregido antes de escribir el spec.
- Decisiones de diseño fijadas con el usuario: duplicate-check (email/orcid/cédula) corre en submit, no en blur; auto-login tras registro exitoso; `numero_cedula` se mantiene requerido en mobile (aunque web1 lo trata como opcional — decisión explícita del usuario, no un descuido); nombre se envía plano, sin concatenar apellidos (la concatenación de web1 es un bug preexistente, no se replica).
- Review final encontró 2 Important: cédula/orcid sin `trim()` rompía el duplicate-check permanentemente; registro exitoso + auto-login fallido (email ya existe como usuario no-colaborador) dejaba al usuario en un dead-end confuso. Un fix round, resuelto.
- Verificación manual del contrato del backend vía uvicorn local + curl (sin simulador Expo disponible en el entorno): registro, bloqueo por email duplicado, y login-para-auto-login confirmados funcionando; cuenta de prueba desactivada después para no ensuciar la BD Postgres compartida.
- Un conflicto real al mergear: línea de import en `LoginScreen.js` (master ya tenía el merge de biometric-login) — resuelto combinando ambas listas de imports.

**⚠️ Pendiente de esa sesión:** nunca se corrió un walkthrough manual en un dispositivo/simulador Expo real — solo el contrato del backend fue verificado. Recomendado: registro happy path, email duplicado, años_experiencia fuera de rango, cédula malformada.

---

## C — Reportes filtering (esta sesión)

Mismo ciclo (`brainstorming` → spec → plan de 9 tasks → `subagent-driven-development` → review final con 1 fix wave).

- Tab Reportes pasó de ser un dump fijo sin filtros a dos sub-tabs: **Personal** (avistamientos propios por email de sesión, quick-picks de fecha) y **Global** (catálogo completo filtrable por estado de conservación, hábitat, especie).
- Backend: 3 endpoints (`/api/especies/estadisticas`, `/api/avistamientos`, `/api/reportes/especies`) ganaron query params opcionales y aditivos, respaldados por 2 helpers de filtro compartidos — el PDF descargado siempre coincide con lo que está filtrado en pantalla.
- Review final (opus) encontró 3 Important reales: `fecha_hasta` con fecha-sin-hora excluía las capturas del día actual (bug de límite de medianoche contra columna `TIMESTAMP`); fila de chips de estado/hábitat sin `flexWrap` — 16 hábitats aplastados en una sola fila ilegible en celular; tab Personal renderizaba el mismo dashboard global en vez de solo datos propios (desvío del spec aprobado). Un fix wave, un re-review: los 6 hallazgos (3 Important + 3 Minor) atendidos, sin breakage nuevo.
- **Incidente de proceso detectado y corregido dos veces:** el subagente implementador de la Task 5 (y su primer fix) commiteó directo en `master` del checkout principal en vez del worktree aislado — bug de ambigüedad de ruta (`MockupsSwayMobile/src/api/client.js` existe en ambos lugares). Revertido en `master` (autorizado por el usuario), cherry-pickeado al worktree correcto. A partir de ahí, cada dispatch a subagentes que tocaran mobile incluyó una advertencia explícita de ruta absoluta — no volvió a pasar.

---

## Pendientes cruzados (para la próxima sesión)

1. ~~**Commitear `HomeScreen.js` y `CatalogScreen.js`**~~ — ✅ **RESUELTO**, ya estaba commiteado (`77993d5`) antes de esta sesión, verificado.
2. ~~**3 worktrees `agent-a*` obsoletos**~~ — ✅ **RESUELTO 2026-07-30**, eran 4 (no 3), verificados: 3 en `56dfd7f` (ancestro directo de `master`) y 1 en `c5b710d` (cherry-pick, mismo contenido ya en `master`). Removidos con `git worktree remove` + `branch -D`, sin pérdida de trabajo.
3. ~~**Walkthrough real en dispositivo**~~ — ✅ **RESUELTO 2026-07-30** (confirmado por el usuario, probado en dispositivo real vía Expo Go conectado al droplet).
~~4. **Avistamientos y Eventos: el submit no existe, es más profundo que Pending #1/#2 — corregido el registro de esta discrepancia.** La sesión de date-pickers (2026-07-28) había documentado Pending #1 (avistamiento necesita nombre/email de sesión) y Pending #2 (evento necesita catálogo de tipo/modalidad por ID) **asumiendo que el POST ya existía** y solo le faltaban/sobraban campos. La investigación de hoy (solo lectura, sin cambios de código) encontró que el problema es más básico: **el POST nunca se conectó, ni bien ni mal.**
   - **Avistamientos** (`SightingsScreen.js:132`, `handleReportSighting`): solo hace `setSightings(prev => [...])`, mutación de estado local — cero `fetch`/API. `client.js` no tiene ninguna función de creación de avistamiento, solo GETs (`getAvistamientosMine`, `getAvistamientosAll`).
   - **Eventos** (`EventsScreen.js`): mismo patrón — sin handler de submit ni `fetch`. `client.js` solo tiene `getEventos()` (GET).
   - **Referencia real que funciona (web1, `assets/js/eventos.js`):** `POST /api/eventos/crear` (no `/api/eventos`, que es solo listado). Payload: `{titulo, descripcion, fecha_evento, hora_inicio, hora_fin, id_tipo_evento, id_modalidad, url_evento, capacidad_maxima, costo, contacto}`. Catálogos vía `GET /api/tipos-evento` y `GET /api/modalidades` (`{success, tipos/modalidades: [{id, nombre, descripcion}]}`). Web1 no manda token de auth ni saca datos personales de sesión (`contacto` es texto libre, tampoco manda `nombre_organizador`).
   - **Decisiones tomadas hoy (acordadas, no implementadas):**
     - Avistamientos: `nombre_usuario`/`email_usuario` se sacan del usuario activo (sesión) — esto **reemplaza** a Pending #1 original, ya no es "corregir campos de un POST existente", es parte del wire completo.
     - Eventos: `nombre_organizador` (campo opcional del backend, que web1 ni siquiera manda) también se saca del usuario activo en mobile — decisión mobile-específica, diverge de web1 (que no vincula el evento a ningún usuario). Esto **extiende** a Pending #2 original (catálogo por ID sigue aplicando, más este dato de sesión).
     - Wire completo de POST para ambas vistas queda pendiente — no se implementa todavía. Cuando se retome: para eventos, replicar `POST /api/eventos/crear` + catálogos `tipos-evento`/`modalidades` (mismo endpoint que ya funciona en web1), cambiando los chips de tipo/modalidad para guardar `id` en vez del label del array hardcodeado actual (`TIPOS_EVENTO`/`MODALIDADES`); para avistamientos, crear la función de cliente que falta y sourcear identidad de sesión.
   - **Pending #1/#2 del spec de reportes-filtering quedan obsoletos como items independientes** — su contenido vive ahora dentro de este punto único.~~ ✅ **RESUELTO 2026-07-30** — plan [2026-07-30-avistamientos-eventos-post](docs/superpowers/plans/2026-07-30-avistamientos-eventos-post.md): ambos POST endpoints (`/api/reportar-avistamiento` y `/api/eventos/crear`) ahora funcionan end-to-end desde mobile (`SightingsScreen.js` y `EventsScreen.js`); backend bug encontrado y corregido (crear_evento no reconocía tokens de colaborador — `app/security/auth.py` get_optional_organizador_user, commit fa26cf1).
5. ~~**Los filtros de Reportes no funcionan en el dispositivo real**~~ — ✅ **RESUELTO 2026-07-30** (confirmado por el usuario, retest en vivo con bundle fresco contra el droplet — la sospecha de bundle Metro viejo era correcta, no había bug de código).
6. ~~**"Actividad reciente" en Home es un placeholder, no datos reales**~~ — ✅ **RESUELTO 2026-07-30**, wireado a `getAvistamientosMine()` (ver sección de sesión 2026-07-30 abajo).
7. ~~**Cambio de contraseña no cierra sesión, aunque el mensaje lo promete**~~ — ✅ **RESUELTO 2026-07-30**, `handleChangePassword` ahora fuerza logout tras éxito (ver sección de sesión 2026-07-30 abajo).
8. ~~**"¿Olvidaste tu contraseña?"**~~ — ✅ **CERRADO 2026-07-30 (decisión de alcance, no gap).** `ForgotPasswordScreen.js` (input de correo + validación client-side, mensaje genérico "revisa tu correo", sin llamada a API), registrada en `AppNavigator`, botón de `LoginScreen.js` navega ahí (`719f523`). **El endpoint de backend NO se va a implementar** — decisión explícita del usuario, deja de ser pendiente.
9. ~~**ORCID sin auto-formato en el registro**~~ — ✅ **RESUELTO 2026-07-30**, `formatOrcidInput()` wireado en el `onChangeText` (ver sección de sesión 2026-07-30 abajo).
10. ~~**Conectar Expo Go a la API en DigitalOcean**~~ — ✅ **EJECUTADO 2026-07-30**, `API_HOST` en `client.js` hardcodeado temporalmente a `http://165.232.146.240` (IP, puerto 80 vía nginx — no 8000), lógica dinámica de Metro comentada justo debajo lista para revertir (`2de19f6`). Antes de esto el droplet corría código viejo (`GET /api/eventos?mine=true` sin token devolvía 200 en vez de 401) — se redesplegó manualmente (`git pull` + `docker compose -f docker-compose.prod.yml build api && up -d api`), verificado con curl que ya corre el código de hoy. **No revertir sin que el usuario lo pida** — está probando activamente contra producción.
11. ~~**Patrón de botones muertos (sin `onPress`)**~~ — ✅ **RESUELTO 2026-07-30** (confirmado por el usuario: barrido completo hecho, no quedan botones muertos en la app).

## Nuevos pendientes (post-sesión, 2026-07-30 noche)

1. **Explorar almacenamiento local de fotos de avistamiento tomadas con cámara del dispositivo, y enviarlas al compartir la tarjeta de avistamiento.** Actualmente `fotoUri` (capturada vía `expo-image-picker` en `SightingsScreen.js`) es puramente local/efímera — no se persiste más allá de la sesión del formulario, y `ShareCard`/`handleShare` no incluyen la foto al compartir. Investigar: dónde guardarla localmente de forma persistente (¿`expo-file-system`, ya usado en `client.js` para PDFs?), y cómo incluir la imagen en el share (¿`react-native-view-shot` ya captura la tarjeta como imagen — agregar la foto a esa composición, o compartir la foto por separado junto con el texto?). No implica backend todavía (sigue sin haber columna/endpoint de foto en avistamientos, ver decisión original de la sesión de POST wiring).

## Sesión 2026-07-30 (tarde) — Home real-time + feed comunitario + limpieza

- **Pendiente #2 resuelto — worktrees `agent-a*` eliminados.** Eran 4 (no 3): 3 en `56dfd7f` (ancestro directo de `master`) y 1 en `c5b710d` (cherry-pick, mismo contenido ya en `master`). Verificados uno por uno antes de borrar, sin pérdida de trabajo.
- **"Actividad reciente" en Home ahora refresca en cada foco de pantalla** (`useFocusEffect`) y combina avistamientos propios + eventos de toda la comunidad (no solo los del usuario) en un solo feed ordenado por fecha, top 5.
- **`SightingsScreen` ahora muestra avistamientos de toda la comunidad** (`getAvistamientosAll()`), no solo los del colaborador logueado — cambio de alcance pedido por el usuario, `getAvistamientosMine()` queda solo para Home.
- **Eliminado botón "Enviar" (resend) muerto** en tarjeta de avistamiento, junto con `handleResend()` huérfano.
- **Eliminado conteo de "individuos"** de tarjeta y modal de detalle de avistamiento — la cantidad ya vive en las notas, campo quedó de solo escritura.
- **Eliminado botón "Editar" muerto** en tarjetas de eventos próximos (`EventsScreen.js`) — nunca tuvo `onPress`.
- **Nuevo filtro "Míos" en Avistamientos y Eventos.** Ambas pantallas por defecto muestran feed comunitario completo; chip nuevo alterna a solo lo propio del colaborador logueado (`getAvistamientosMine()`/`getEventosMine()`), respetando el toggle también en el refresh post-submit.
- **`GET /api/eventos` ganó filtro real `?mine=true`** (backend, `app/routers/eventos.py`), reutilizando `get_optional_organizador_user` de la sesión anterior — filtra por `Organizador.id_usuario`. Reemplaza el matching por nombre/apellido que se había intentado primero y que causaba un crash.
- **KPIs de Perfil (Avistamientos/Especies/Eventos) wireados a datos reales** — antes eran `.length` de arrays mock estáticos. Avistamientos y Eventos cuentan solo lo propio del colaborador, Especies es el catálogo completo.
- **Bug real encontrado y corregido — crash en Perfil por TDZ.** Un `useEffect` nuevo leía `personal.nombre` antes de que `personal` estuviera declarado más abajo en el mismo componente ("Cannot read property 'nombre' of undefined" en cada render). Corregido de raíz (no solo reordenando) implementando el filtro backend real de arriba.
- **Popups de error en registro** (`LoginScreen.js`) — el banner de error arriba del formulario ahora solo se usa en modo login; en modo registro, todos los errores (validación, duplicados, fallo de registro) usan `Alert.alert`, igual que el popup "Tu evento será revisado" de Eventos.
- **Bug de key duplicada en Home corregido.** `recentActivity.map` usaba `act.text` (string derivado de especie+notas) como `key` — dos avistamientos con texto idéntico disparaban el warning de React "Encountered two children with the same key". No rompía el flujo pero era ruido constante en LogBox. Ahora usa `avistamiento-{id}`/`evento-{id}` real.
- **Nuevo endpoint real `DELETE /api/avistamientos/{id}`** — el botón "Eliminar" de la tarjeta de avistamiento solo filtraba estado local, nunca llamaba al backend (mismo patrón de gap que el POST original). Cualquier colaborador autenticado puede eliminar cualquier avistamiento (sin chequeo de dueño, decisión explícita del usuario). `deleteAvistamiento()` en `client.js`, `handleDelete` en `SightingsScreen.js` ahora llama al endpoint y refresca la lista (respetando el toggle Míos) en vez de solo mutar estado local.
- **Droplet DigitalOcean redesplegado dos veces hoy** — primero para ponerse al día con el fix de auth de colaborador/mine filter (`master` estaba adelante del código corriendo en el droplet pese a que GitHub sí estaba al día — no hay CI/CD, "GitHub actualizado" no implica "droplet actualizado"), segunda vez confirmada por el usuario tras el push del endpoint de delete (commit `e026609`).
- **Pantalla "Olvidé mi contraseña" construida (solo UI, sin backend)** — ver pendiente #8 arriba.
- **Evaluación honesta contra 7 requisitos del PI (checklist del profesor/evaluación).** Revisado código real, no supuesto:
  - ✅ Utilidad real vs copia de Web (biometría, GPS, cámara, gamificación — features mobile-nativas confirmadas en código).
  - ✅ Diseño profesional (sistema de theme + componentes reutilizables confirmado).
  - ✅ Navegación clara (bottom-tabs + stack, estándar).
  - ⚠️ **Formularios validados — gap real encontrado y corregido**: `handleSavePersonal`/`handleSaveProfesional` en `ProfileScreen.js` no tenían NINGUNA validación client-side antes de enviar a `updatePerfil()`. Corregido reutilizando los mismos validadores de `collaboratorValidation.js` que usa el registro (`4ca32bf`).
  - ✅ Info de mobile reflejada en Web — verificado en código: web2 (`DashboardView.jsx`) usa el mismo `GET /api/avistamientos`, web1 (`eventos.js`) usa el mismo `GET /api/eventos`. Datos compartidos confirmados, no solo supuestos.
  - ✅ Web/API/BD alojados en la nube — verificado en vivo vía curl contra el droplet: web1 (`/`), portal web2 (`/portal/`), API (`/docs`, `/api/estadisticas`) los tres respondiendo 200 simultáneamente.
  - ❌ **"App móvil 100% funcional" — no se cumple al pie de la letra.** Gaps reales y documentados: filtros de Reportes sin confirmar en dispositivo (#5), forgot-password sin backend (#8), barrido de botones muertos incompleto (#11), ningún walkthrough completo de biometric login/registro en dispositivo real. Es "funcional con gaps conocidos", no "100%".

## Sesión 2026-07-30 (madrugada) — SDD sobre pendientes rápidos

Plan ejecutado vía `subagent-driven-development` en worktree aislado (`worktree-pending-fixes`), 4 tasks, cada una con implementador + review por separado, más review final de rama completa. Mergeado a `master` (fast-forward, `2e95a77`). Plan: `docs/superpowers/plans/2026-07-29-pending-fixes.md`.

- **Pendiente #9 resuelto — ORCID auto-formato.** `formatOrcidInput()` en `collaboratorValidation.js`, wireado en el `onChangeText` del campo ORCID de `LoginScreen.js`. Auto-inserta guiones cada 4 caracteres, tope 19 formateados (16 crudos), `X` solo válida como último carácter. Test con 8 assertions (convención `node assert` del repo). Review: aprobado sin hallazgos.
- **Pendiente #7 resuelto — logout forzado tras cambio de contraseña.** `handleChangePassword` en `ProfileScreen.js` ahora sigue el mismo patrón que `handleDeactivate`: limpia form → `await logout()` → alert → `setIsLoggedIn(false)`. Antes solo mostraba el alert sin cerrar sesión de verdad. Review: aprobado sin hallazgos.
- **Pendiente #6 resuelto — "Actividad reciente" con datos reales.** `HomeScreen.js` ya no deriva `recentActivity` de mocks (`sightingsList`/`pastEvents`); ahora usa `getAvistamientosMine()` en un `useEffect` propio, mapea los 3 avistamientos más recientes del colaborador (ya vienen ordenados desc por fecha desde el backend). Se decidió **no** wirear "eventos asistidos" — el backend no tiene tabla de asistencia/RSVP, solo avistamientos tienen datos reales por usuario.
- **Bug fantasma detectado durante planeación, ya no reproducible al ejecutar — `getAvistamientosMine()` con backslashes en la URL.** Al escribir el plan (leyendo el código vía Grep) se vio `${API_HOST}\api\colaboradores\avistamientos` con backslashes, un bug real que hubiera roto la función. Al ejecutar la tarea minutos después, el código ya tenía forward slashes correctos en ambos el checkout principal y el worktree nuevo — no hay explicación clara (posible sesión paralela tocando el mismo archivo, o error de lectura del tooling en ese momento). Verificado en runtime: `curl http://localhost:8000/api/colaboradores/avistamientos` responde 401 (no error de conexión), confirmando que la ruta actual es válida. No se hizo commit para esta "task" — se registró como no-op en el ledger.
- **Pendiente #5 (filtros de Reportes) — investigado, sin fix, sigue pendiente.** Revisión completa de `ProfileScreen.js` (useEffect de filtros, chips, `buildQuery`) contra el backend (`app/routers/estadisticas.py`) no encontró ningún bug de código — los nombres de query params coinciden exactamente, los `setFiltros` usan referencias nuevas de objeto correctamente. Hipótesis: el dispositivo probado la vez pasada corría un bundle de Metro viejo (pre-merge) o los logs de Docker revisados eran de otro contenedor. **Necesita retest en vivo con bundle fresco antes de tocar código de nuevo** — no forzar un fix sin evidencia nueva.

**Quedan pendientes sin tocar (fuera de scope de esta sesión, según decisión del usuario):** #2 (worktrees `agent-a*` obsoletos — sigue habiendo 4 en `.claude/worktrees/`: `agent-a10318f7984c3c86b`, `agent-a160bd9017b3eee94`, `agent-a6cef882843ed1f86` (commit `56dfd7f`) y `agent-a2a42772ba1ec4c4d` (commit `c5b710d`, remanente de esta sesión, ya con su trabajo cherry-pickeado a master)), #4 (avistamientos/eventos POST), #8 (forgot password), #10 (Expo Go → DigitalOcean, explícitamente dejado para el final).

---

## Lo que funcionó bien hoy

- **3 worktrees en paralelo sobre el mismo checkout, sin colisión real** — cada sesión aisló su trabajo, git resolvió los conflictos de merge (todos aditivos: líneas de import) sin perder nada de ninguna de las 3 features.
- El patrón `brainstorming → spec → plan → subagent-driven-development → review final` se usó de punta a punta en las 3 sesiones, con reviews reales que encontraron bugs genuinos (no solo trámite) en las 3.
- **Desactivación de cuenta (soft-delete) confirmada funcionando en producción real** — usuario creó cuenta "Juan Rulfo" (`usuarios.id=39`), la eliminó desde la app, verificado vía `psql`: `usuarios.activo=f`, `colaboradores.activo=f`, `estado_solicitud=inactivo`. Soft-delete correcto, no borra la fila.
- **Correo de bienvenida al registrar colaborador (SMTP roto, ver investigación anterior) no es un bug** — confirmado por el usuario: por diseño, esa notificación es exclusiva de web, la app mobile no debería mandarla. Descartado de pendientes.
- **Validación de formato de ORCID confirmada correcta** — `collaboratorValidation.js:9`, `ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/` (formato ORCID real, último carácter dígito o X). Campo opcional respetado (`validateOrcid` retorna `null` si está vacío), pero si se llena, exige el patrón exacto. Wireado correctamente: `LoginScreen.js:136` llama `validateRegisterForm()` en el submit del registro, que incluye esta validación. No es un pendiente — solo falta la UX de auto-formato mientras se escribe (ver pendiente #9).

---

## Sesión 2026-07-31 — Seguridad: merge de `seguridad_api` + despliegue en 2 droplets

Ciclo completo `brainstorming → writing-plans → subagent-driven-development (agentes especializados) → review final` en worktree aislado (`two-droplet-security-deploy`). PR abierto contra `master`: **https://github.com/EmilianoLedesma/SWAY-POO/pull/3** (rama `worktree-two-droplet-security-deploy`, sin mergear todavía).

**Contexto de arranque:** rúbrica de seguridad pedía hasheo, 2 servidores (uno público/uno privado), monitoreo Prometheus/Grafana, firewall, JWT, SSL, balanceador de carga con reparto visible. Existía rama `seguridad_api` (5 commits) con la parte de aplicación ya resuelta pero diseñada para 2 VMs VirtualBox — arquitectura descartada, se adaptó a 2 droplets DigitalOcean reales (uno existente, `165.232.146.240`, otro por crear).

### Investigación previa (spec + brainstorming)
- Se encontró un proyecto de referencia en `Downloads/demo-files` con el mismo patrón (HAProxy + Prometheus + Grafana + 2 servidores) para otro stack — se adoptó el patrón de balanceador (nginx solo no mostraba reparto de tráfico; HAProxy sí, con `/stats` + exporter Prometheus propio).
- Diagnóstico SSH real sobre el droplet privado (con autorización explícita, key temporal agregada y dejada por pedido del usuario): 1.9GB RAM con solo 241Mi libres → se descartó `cadvisor` del stack de monitoreo. UFW ya tenía `22/80/443 Anywhere` del despliegue de un solo droplet → el plan tuvo que agregar `ufw delete` explícito antes de las reglas nuevas. Red VPC ya activa, IP real `10.124.0.3` (no hubo que inventar el esquema de IPs).

### Implementación (15 tareas, subagent-driven-development)
- **Tareas 1-5** (código): merge de `seguridad_api` a `master` (bcrypt, JWT, API key global, rate limiting, BOLA/IDOR) + fix de web1/web2/mobile, que dejaron de funcionar al quedar la API key exigida globalmente — hallazgo no cubierto por el spec original, detectado durante la planeación, no durante la ejecución.
- **Tareas 6-15** (infra, agente `DevOps-CI-CD-Engineer`): `docker-compose.private.yml`/`.public.yml`, `haproxy.cfg`, `nginx/portal.conf`, `prometheus.yml`, provisioning de Grafana, script de cert autofirmado, scripts UFW, `.env.example`, runbook manual (`docs/DEPLOYMENT_2_DROPLETS.md`).
- Reviews por tarea con agente `Application-Security-Specialist` (hallazgos reales, no trámite): página de stats de HAProxy sin auth expuesta a todo internet (corregido, `stats auth`), script de cert sin comentario explicando un workaround de Windows (corregido), bit ejecutable perdido en 2 scripts al commitear desde Windows (corregido).
- **Review final de rama completa** (`Application-Security-Specialist`, modelo opus): encontró 3 Critical + 4 Important de integración cruzada que ninguna review por tarea podía ver sola —
  1. Docker publica puertos a `0.0.0.0`, lo que **saltea UFW por completo** (DNAT de Docker corre antes de la cadena INPUT) — el firewall del droplet privado no protegía nada en la práctica. Corregido: bindear los puertos publicados a la IP VPC real en vez de todas las interfaces.
  2. El runbook nunca creaba el `.env` del droplet privado ni indicaba reemplazar el placeholder de `API_KEY` en los 3 clientes — la app hubiera muerto con 500 en todos los endpoints al primer despliegue real.
  3. `templates/payment.html` (donaciones) era la única plantilla que no cargaba `main.js`, así que el parche de `x-api-key` nunca se aplicaba ahí — las donaciones hubieran devuelto 401. Se resolvió de raíz extrayendo el parche a `assets/js/api-key.js` e incluyéndolo en todas las plantillas que llaman a la API, no solo parcheando `payment.html`.
  4. Panel de Grafana agrupaba por `proxy` en vez de `proxy+server`, mezclando api1 y api2 en una sola línea — invisibilizaba justo lo que la rúbrica pedía demostrar (el reparto de tráfico).
  5. Rate limiting quedaba con un solo cupo global compartido por todo internet (uvicorn no confiaba en `X-Forwarded-For` detrás de HAProxy).
  6. `JWT_SECRET_KEY` caía en un fallback hardcodeado silencioso si faltaba la variable — combinado con el hallazgo #2, un despliegue sin `.env` completo hubiera quedado firmando tokens con un secreto público.
  - Un solo fix wave para todos los hallazgos + re-review acotado (como pide el proceso — nunca un fixer por hallazgo). La re-review encontró un residual: el propio fix wave movió el parche a `api-key.js` pero el texto del runbook seguía apuntando a `main.js` y en la sección equivocada del droplet — corregido directo (cambio de 2 líneas en un doc, sin riesgo de código).

### Decisiones tomadas con el usuario durante la ejecución
- `JWT_SECRET_KEY` con fallback débil heredado de `seguridad_api`: se dejó tal cual (decisión explícita, "keep tal cual" del brief original).
- Defaults débiles de `DB_PASSWORD`/`SECRET_KEY` en `docker-compose.private.yml`: se dejaron por consistencia con el `docker-compose.prod.yml` actual (mismo patrón ya en uso).
- Página de stats de HAProxy (`:8404`): se agregó `stats auth` (no estaba en el plan original, hallazgo de seguridad).

### Pendiente real antes de que esto funcione en producción
1. **El droplet público no existe todavía** — hay que crearlo en DigitalOcean, mismo datacenter (`sfo3`) que el privado para compartir la VPC `10.124.0.0/20`.
2. **Nada de esto se probó contra servidores reales** — toda la validación fue local (sintaxis de compose/haproxy/nginx/prometheus, JSON de Grafana, pytest). El runbook es la guía para el despliegue real, todavía no ejecutado.
3. Generar valores reales para `JWT_SECRET_KEY`, `API_KEY`, `GRAFANA_ADMIN_PASSWORD`, contraseña de `stats auth` — hoy son placeholders `REEMPLAZAR_CON_*`.
4. Verificar en el droplet real, después de `ufw_private.sh`, que no sobrevivieron reglas IPv6 residuales de `80/443` (posible no-op de UFW según versión).
5. Confirmar en vivo la prueba de balanceo (`:8404/stats` + panel de Grafana con tráfico repartido entre api1/api2) — es la evidencia que pide la rúbrica.
6. Dejado fuera de alcance a propósito (mismo hallazgo #1 pero en el droplet público, `docker-compose.public.yml` publica `:8405` a `0.0.0.0`): no se pudo bindear a una IP real porque el droplet público todavía no existe — revisar con la IP real una vez creado.

### Nota de proceso
- Dos desvíos del proceso estándar de subagent-driven-development, ambos anotados en el ledger de la ejecución (ya borrado, historia vive en los commits): un fix de bit ejecutable (Tarea 13) y la corrección final del runbook se hicieron directo por el controlador en vez de resumir al implementador — en ambos casos por ser cambios triviales de metadata/doc sin riesgo de lógica, y en ambos casos se verificaron con re-review de todas formas.
- Key SSH temporal (`claude-diag-temp`) sigue autorizada en `root@165.232.146.240` — el usuario pidió dejarla para cuando se retome el despliegue real.

---

## Sesión 2026-08-01 — Despliegue real en 2 droplets + SSL real + dominio + verificación en vivo

Continuación directa de la sesión anterior (PR #3 mergeado a `master`). Se ejecutó el runbook completo contra servidores reales de DigitalOcean, no solo validación local.

### Merge y hardening previo al despliegue
- PR #3 mergeado a `master` (`0f7c958`).
- Placeholder `API_KEY` reemplazado por clave real generada, en los 3 clientes (`assets/js/api-key.js`, `web2/src/api/client.js`, `MockupsSwayMobile/src/api/client.js`).
- **Rate limiting extendido a `colaboradores.py`** (antes solo existía en `auth.py`/tienda) — `default_limits=["100/minute"]` global en el `Limiter`, más límites explícitos en `/login` y `/perfil/password` (5/min), `/register` (10/min), `/check-email`/`/check-orcid`/`/check-cedula` (20/min). Verificado en vivo con `curl`: `429` real tras exceder el límite.
- Placeholder de password de `stats auth` de HAProxy reemplazado por valor real.

### Despliegue real
- **Droplet público creado** en DigitalOcean: `sway-public`, `146.190.136.236` (pública) / `10.124.0.2` (VPC), mismo datacenter `sfo3` que el privado — confirmado en la misma VPC `10.124.0.0/20` con `ping` cruzado real (0% packet loss).
- Agente nativo de monitoreo de DigitalOcean (`do-agent`) instalado y activo en ambos droplets.
- Placeholders `IP_PUBLICA_VPC` reemplazados por la IP real en `prometheus.yml`, `ufw_private.sh`, `docs/DEPLOYMENT_2_DROPLETS.md`.
- Público: usuario `sway` creado, Docker ya venía preinstalado, repo clonado, `web2/dist` transferido por `scp` (gitignored, no viaja con `git clone`), certificado autofirmado inicial generado, `.env` con `GRAFANA_ADMIN_PASSWORD` real, UFW aplicado, stack (`haproxy`+`nginx-portal`+`grafana`) levantado — un bug real encontrado y corregido en el momento: HAProxy no arrancaba porque el cert (`600`, dueño `sway`) no era legible por el usuario no-root del contenedor `haproxy:3.2-alpine` — corregido a `644`.
- Privado: `.env` completado con `JWT_SECRET_KEY`/`API_KEY` reales y `CORS_ORIGINS` apuntando al dominio público, stack viejo (`docker-compose.prod.yml`, un solo servidor) bajado, stack nuevo (`docker-compose.private.yml`, 8 contenedores) levantado reusando el volumen de Postgres existente (sin pérdida de datos), UFW aplicado con la IP VPC real del público.
- **Verificado en vivo, extremo a extremo, con evidencia real (no solo "debería funcionar"):** ping VPC cruzado, contenedores `docker ps` en ambos droplets, bind de puertos a IP VPC (no `0.0.0.0`) confirmado, `ufw status` en ambos, backends alcanzables desde el público vía VPC (`200` en los 4), API vía HAProxy con y sin `x-api-key` (`401`/`200`), reparto de tráfico real entre `api1`/`api2` vía `stats;csv` de HAProxy (~50/50 sobre 20+ peticiones), targets de Prometheus (`up` los 4), Grafana accesible vía HTTPS.

### SSL real (upgrade de autofirmado a Let's Encrypt)
- Se confirmó que el proyecto ya tenía un dominio propio (`proyecto-sway.site`, DNS gestionado en DigitalOcean) — decisión de subir de certificado autofirmado a uno real en vez de quedarse con el autofirmado original del plan.
- Registro `A` del dominio movido de la IP del droplet privado (`165.232.146.240`, apuntaba ahí desde el despliegue de un solo droplet) a la IP del droplet público (`146.190.136.236`) — confirmado propagado globalmente (`8.8.8.8`, `1.1.1.1`) aunque el resolver local de esta máquina tardó bastante más en actualizar su caché (no es un problema de configuración, es caché de TTL normal).
- `certbot` instalado en el droplet público, certificado real emitido (`certonly --standalone`, requiere detener HAProxy brevemente para liberar el puerto 80 durante el desafío ACME).
- Renovación automática configurada con `pre_hook`/`post_hook` (detener HAProxy → renovar → recombinar `fullchain.pem`+`privkey.pem` al formato que HAProxy necesita → reiniciar) — probada con `certbot renew --dry-run` exitoso.
- **Confirmado en dispositivo real** (captura de pantalla del usuario): Chrome mobile muestra "Connection is secure", TLS 1.3, certificado válido emitido por Let's Encrypt — no solo `curl`, verificación real en hardware real.
- `MockupsSwayMobile/src/api/client.js` → `API_HOST` actualizado a `https://proyecto-sway.site` (pasó por IP autofirmada primero, luego al dominio con cert real).

### Documentación de verificación para revisión del PI
- Nuevo `docs/PI_REQUIREMENTS_VERIFICATION.md`: los 14 puntos de la rúbrica, qué se hizo por cada uno, y cómo confirmarlo con comandos copy-paste reales (`curl`, SQL, `ping`, `openssl`, `ufw status`, `docker logs`) — sin secretos reales incluidos (solo la API key pública, que ya está expuesta en el código cliente por diseño).
- Extendido con sección de preguntas frecuentes de revisión (Q&A) por tema: arquitectura, seguridad de aplicación, monitoreo/firewall, SSL/dominio, balanceador, mobile, datos compartidos, despliegue en la nube — anticipando preguntas típicas de evaluador con respuesta directa.
- Sección 0 nueva: guía de cómo generar una llave SSH propia y pedir acceso, alternativa vía Web Console de DigitalOcean sin llave.
- Nota agregada sobre cuentas legacy con password en texto plano (anteriores al merge de seguridad de esta sesión, no se corrigen solas — requeriría script de migración, fuera de alcance) con query de auditoría real.
- Prueba agregada de que SSH rechaza conexión sin llave válida (`Permission denied` real, no solo un candado decorativo).

### Nueva llave SSH generada
- Par de llaves `sway_deploy` (sin nombre "claude"/temporal) generado y autorizado en `root@` de ambos droplets — confirmado funcionando. Coexiste con la llave temporal de la sesión anterior (`claude-diag-temp`), ninguna reemplaza a la otra.

### Bug real encontrado durante verificación en vivo (no durante desarrollo) — rate limiting identificaba mal al cliente
- Al probar force-brute en producción real contra `/api/colaboradores/login`, no se disparaba el `429` esperado. Investigado: `slowapi`'s `get_remote_address` lee `request.client.host`, que detrás de HAProxy es **siempre la IP del proxy** (`10.124.0.2`) para cualquier visitante de internet — el límite de 5/minuto era, en la práctica, **un solo cupo global compartido por todos los usuarios de internet**, mucho peor que el problema original que se estaba intentando resolver.
- Corregido (`app/security/rate_limit.py`, commit `d40be5b`): función `get_real_client_ip` que lee `X-Forwarded-For` (que HAProxy ya manda vía `option forwardfor` en `haproxy.cfg`) con fallback a `get_remote_address` para desarrollo local sin proxy.
- Verificado en vivo tras redeploy: pegándole a una sola réplica directo (bypass del balanceador), el intento 6 da `429` correctamente — la lógica de conteo por cliente ya es correcta.
- **Limitación real que queda documentada, no arreglada ahora (decisión explícita del usuario):** el almacenamiento del rate limit es en memoria por proceso (`storage_uri="memory://"`), y como hay 2 réplicas de la API balanceadas, cada una lleva su propio contador — el límite efectivo en producción es ~2x el nominal (ej. `login` permite ~10/min repartidos entre las 2 réplicas, no exactamente 5/min). No es un bypass total, sigue habiendo techo real. **Fix futuro documentado:** mover `storage_uri` a un backend compartido — típicamente Redis (`storage_uri="redis://redis:6379"` + contenedor `redis:alpine` nuevo en `docker-compose.private.yml`). Requiere nueva dependencia de infraestructura, fuera de alcance de esta sesión.

### Hallazgo real durante verificación, explicado (no un bug) — cuentas legacy con password en texto plano
- Al auditar la tabla `usuarios` en producción se encontraron 13 cuentas con `password_hash` en texto plano y 34 con el campo vacío/nulo, de 48 totales. Confirmado por el usuario: son cuentas creadas **antes** de que el hasheo de contraseñas existiera en el código (todo el trabajo de `seguridad_api` es de esta y la sesión anterior) — no es una regresión de esta sesión. Una cuenta de prueba registrada hoy contra producción real (`user_id:59`) sí quedó con hash correcto (`pbkdf2:sha256:600000$...`), confirmando que el hasheo funciona hacia adelante. Las cuentas legacy no se corrigen solas — necesitarían un script de migración forzando reset de password, fuera de alcance.

### Estado del despliegue al cierre de esta sesión
- **Los 2 droplets están corriendo en producción real ahora mismo**, con dominio propio y SSL real de Let's Encrypt, verificados extremo a extremo con evidencia reproducible (no solo "debería funcionar").
- Pendiente explícito para la próxima sesión: continuar la verificación paso a paso de los puntos restantes de la rúbrica (mobile, formularios, dashboards, etc. — ya cubiertos en el doc pero sin el mismo nivel de prueba en vivo que la parte de infraestructura) y decidir si probar la app real en Expo Go contra `https://proyecto-sway.site`.
- Redis para rate limiting compartido entre réplicas: pendiente, documentado como mejora futura, no bloqueante para la entrega actual.

### Continuación misma sesión — más verificación en vivo, más bugs reales, Grafana ampliado

- **Cuenta de colaborador de prueba en producción real** (`user_id:59`, `colaborador_id:20`) registrada vía `curl` contra `https://proyecto-sway.site`, confirmando hasheo real en producción (no solo local).
- **Credenciales legacy entregadas para probar Expo Go — con un bug real encontrado en el camino:** al intentar dar acceso a una cuenta antigua (`id:35`, cuenta real del propio usuario, `123046244@upq.edu.mx`) con su password guardado en texto plano, el login fallaba con `401` pese a usar el password correcto — `check_password_hash` no puede parsear un valor que no tiene el formato `metodo$salt$hash`, así que cualquier cuenta legacy con password en texto plano está, en la práctica, bloqueada sin importar qué se intente. Corregido puntualmente para esa cuenta generando un hash real e insertándolo vía SQL (transferido por archivo para evitar el problema de escape de `$` a través de capas de shell anidadas SSH). Login confirmado funcionando después. Las otras 12 cuentas legacy siguen igual, documentadas, no corregidas (fuera de alcance).
- **Bug real #2 encontrado en vivo — rate limit compartido por todo internet, no por usuario.** Al probar fuerza bruta contra `/api/colaboradores/login` en producción real, nunca disparaba `429`. Causa: `slowapi`'s `get_remote_address` lee `request.client.host`, que detrás de HAProxy es siempre la IP del proxy (`10.124.0.2`) — un solo cupo de 5/minuto compartido por absolutamente todo internet. Corregido (`app/security/rate_limit.py`, función `get_real_client_ip`, commit `d40be5b`) leyendo `X-Forwarded-For` que HAProxy ya manda. Verificado en vivo pegándole a una réplica directo (bypass del balanceador): intento 6 → `429` correcto. Limitación real que queda (decisión explícita del usuario, no corregida): el contador sigue siendo en memoria por proceso, así que en producción con balanceo el límite efectivo es ~2x el nominal (repartido entre `api1`/`api2`). Fix futuro documentado: Redis compartido.
- **Bug real #3 encontrado en vivo — email sin validar formato en 4 endpoints de registro.** Probando validación de formularios (rúbrica ítem 11) con `"email":"no-es-email"`, el servidor lo aceptaba (solo validaba longitud, no formato — campos `str` sin `EmailStr`). Corregido en `ColaboradorRegister`, `CheckEmail` (`app/models/colaboradores.py`), `UserRegister`, `AuthRegister` (`app/routers/auth.py`) — cambiados a `EmailStr`, agregada dependencia `email-validator` a `requirements.txt`. Verificado local (pytest 7/7, curl con email malformado → `422` real) antes de desplegar a producción y reverificar ahí. Commit `157fb15`. Efecto secundario esperado: `EmailStr` rechaza dominios reservados (`.test`, etc. — RFC 2606), así que los emails de ejemplo del doc de verificación se cambiaron de `@sway.test` a `@demo-sway.com`.
- **Prueba en vivo de balanceador + monitoreo con navegador real (chrome-devtools), no solo `curl`.** Login real en `https://proyecto-sway.site/grafana/login`, navegación al dashboard "SWAY — Balanceo y Monitoreo", captura de pantalla confirmando datos reales renderizando.
- **Bug real #4 encontrado en vivo — métrica inexistente en el dashboard de Grafana.** El panel "Backends activos" usaba `haproxy_server_up`, que no existe en las métricas reales del exporter de HAProxy 3.2 (confirmado con `curl :8405/metrics | grep haproxy_server_`) — el panel hubiera quedado sin datos. Corregido a `haproxy_server_active` (métrica real confirmada), commit `700f831`, redesplegado (`git pull` + `docker restart sway_grafana` en el droplet público) y reverificado con el dashboard abierto en el navegador.
- **Dashboard de Grafana ampliado de 3 a 7 paneles**, cada uno justificado directamente por un requisito de la rúbrica (no agregado por agregar): "Distribución de tráfico entre réplicas (%)" (pie chart, evidencia visual directa de balanceo — commit `40cc529`), "Sesiones actuales por réplica", "Conexiones activas a PostgreSQL" (el dashboard no tenía ningún panel de BD pese a que `postgres_exporter` se scrapea desde el principio), "Respuestas 4xx/5xx por backend (protección API)" (hace visible en monitoreo que JWT/rate-limit/validación realmente rechazan tráfico — commit `24c1d01`). Ambas métricas nuevas (`pg_stat_database_numbackends`, `haproxy_server_http_responses_total{code=...}`) verificadas reales vía `curl` antes de agregar los paneles, evitando repetir el error del bug #4.
- **`docs/PI_REQUIREMENTS_VERIFICATION.md` ampliado sustancialmente** (commit `8b32f3e`): mapa de código (archivo:línea por cada uno de los 14 puntos de la rúbrica), los 4 bugs reales de esta sesión documentados en detalle con causa/fix/verificación, sección nueva sobre cuentas legacy con login roto (no solo inseguro), 6 preguntas nuevas en el FAQ. Intro reescrita dejando explícito que cada afirmación del documento fue efectivamente ejecutada contra producción real, no es documentación aspiracional.
- **Rúbrica ítem 13 (Web+API+BD alojados en la nube) confirmado en vivo:** los 3 componentes responden `200` simultáneamente desde internet real, BD con 55 líneas de `\dt` (esquema completo, más de las 25+ tablas esperadas).
- Usuario decidió explícitamente saltar la verificación en vivo de los ítems 8-10 y 14 (mobile: utilidad real, diseño, navegación, funcionalidad completa) por ahora — quedan documentados en el doc con lo ya sabido de sesiones anteriores, sin la misma prueba en vivo paso a paso que el resto.

### Cierre de sesión — limpieza, técnica agregada al doc, onboarding, suite automatizada

- **Limpieza de branches/worktrees:** eliminadas 4 ramas (local+remoto) — `seguridad_api`, `worktree-two-droplet-security-deploy` (ambas ya mergeadas), `contenerizacion` y `copilot/visit-sway-poo-repository` (viejas, sin mergear, superadas por la arquitectura actual). Worktree `two-droplet-security-deploy` removido. Solo queda `master`.
- **`.claude/` dejó de trackearse en git** — ya estaba en `.gitignore` pero 2 archivos viejos seguían trackeados de antes de esa regla. `git rm --cached`, commit `34f24fc`.
- **Explicación técnica agregada a las 14 secciones del doc** (commit `7d5a4be`) — cada punto ganó un bloque "Cómo funciona técnicamente" explicando el mecanismo real (PBKDF2 y por qué las iteraciones importan, aislamiento de VPC, modelo pull de Prometheus, por qué Docker salta iptables, JWT stateless, desafío ACME HTTP-01, round-robin + healthchecks, APIs nativas de Expo, defensa en profundidad, por qué no hace falta sincronizar datos, qué distingue un despliegue real de "corre en mi máquina").
- **Corrección de contenido desactualizado en el doc:** decía "3 paneles" de Grafana en 2 lugares cuando ya son 7 — corregido (commit `0ebcce2`). Encontrado a pedido explícito del usuario ("revisa detalladamente... para que refleje la realidad").
- **Guía paso a paso de Expo Go agregada** (commit `27a40fc`) — instalación, `npx expo start`, verificación de `API_HOST`, credenciales de prueba, qué probar por cada ítem pendiente (8/9/10/14). Password de la cuenta de prueba corregido después (`d75e66c`) — el usuario la cambió a `Emiliano1` vía la propia app, verificado en vivo con `curl` antes de actualizar el doc.
- **Onboarding de colaborador (Luis Custodio):** generada llave SSH nueva y específica (`~/.ssh/luis_custodio`), agregada a `authorized_keys` de ambos droplets, verificada funcionando (`whoami` → `root` en ambos). La llave genérica temporal (`sway_onboarding_temp`) usada de borrador se removió de ambos droplets y se borró localmente. Estructura de correo de acceso entregada al usuario (no enviada por mí, solo redactada).
- **Suite automatizada de verificación creada** (`scripts/verify_pi_requirements.sh`, commit `119abc3`, referenciada en el doc en `ba0c849`) — script bash que corre contra producción real (no localhost), cubre los 14 puntos de la rúbrica con métodos independientes (SQL vía SSH, curl, ping VPC, openssl, ufw status, docker ps, conteo de tablas). Encontrados y corregidos 2 bugs reales del script mismo durante las primeras corridas: password de HAProxy stats confundido con el de Grafana (son distintos), y un payload de prueba con `ñ` que el shell de Git Bash mangla igual que en toda la sesión (mismo patrón de siempre: escribir a archivo temporal y usar `--data-binary @archivo`). Corrida final limpia: **25 pass, 0 fail, 2 skip** (mobile UX necesita dispositivo real; rate limiting 429 se skipea por defecto para no gastar el cupo real del endpoint de login en cada corrida).
- **Comparación contra el proyecto de referencia** (`Downloads/demo-files/demo - Copy`, usado como base del plan original): arquitectura base coincide (2 droplets, HAProxy+SSL+balanceo, Prometheus+Grafana+node_exporter). Diferencias reales: referencia tiene Redis+redis_exporter (SWAY no — coincide exactamente con la limitación de rate limiting compartido ya documentada), referencia tiene cadvisor (SWAY lo omitió a propósito por RAM), referencia usa 3 réplicas de API vs 2 en SWAY (cosmético). SWAY mejora sobre la referencia en 3 puntos: SSL real de Let's Encrypt vs CA propia autofirmada de la referencia, stats de HAProxy con auth (la referencia no tiene), y desplegado en VPC/dominio real de internet vs las IPs de LAN fija (`192.168.10.x`) de la referencia, que era solo un patrón de laboratorio.
- **Discusión sobre punto único de falla del droplet público** (pregunta del usuario sobre el FAQ existente) — recomendación dada pero no implementada: DigitalOcean Load Balancer administrado + 2do droplet público (~$12/mes extra) es la forma correcta de eliminar el SPOF sin tener que armar `keepalived`/VRRP a mano. Alternativa más barata: snapshots regulares + runbook de recreación rápida, aceptando minutos de downtime en vez de eliminar el punto de falla. Sin decisión tomada — queda para la próxima sesión si se quiere implementar.

---

## Sesión 2026-08-01 (continuación) — Feature: foto de avistamiento (upload/persist/share) + trabajo paralelo (easter egg + haptics)

### A — Foto de avistamiento: ciclo completo `brainstorming → writing-plans → subagent-driven-development`, mergeado a `master`

Motivado por el pendiente "explorar almacenamiento local de fotos de avistamiento" registrado en sesiones anteriores (2026-07-30). Ciclo completo en worktree aislado (`worktree-sighting-photo-upload`), 5 tareas + review final de rama completa, cada tarea con implementador + reviewer independiente.

**Diseño (spec en `docs/superpowers/specs/2026-08-01-sighting-photo-upload-design.md`):**
- Persistencia a backend (no solo local-device) — decisión explícita del usuario.
- Storage: disco local en el droplet privado, **no** DigitalOcean Spaces (sin costo extra).
- Upload en dos pasos: `POST /api/reportar-avistamiento` (JSON) sin tocar + nuevo `POST /api/avistamientos/{id}/foto` (multipart) separado — la foto nunca bloquea ni revierte el guardado del avistamiento.
- Binario directo (cámara → `FormData` → `UploadFile` → bytes a disco), sin base64 en ningún punto.
- Thumbnail en lista/detalle, no solo en el share card.

**Hallazgo real durante el diseño (antes de escribir código):** `api1`/`api2` son 2 contenedores separados balanceados round-robin por HAProxy — guardar fotos en disco local de cada contenedor hubiera causado 404 en ~50% de los intentos de verlas. Corregido con un volumen Docker compartido (`uploads_data`) montado en ambos.

**Implementación (5 tareas, `subagent-driven-development`):**
1. Columna `foto_url` (nullable) en `avistamientos` + wireado en los 2 endpoints GET de listado + `reportar-avistamiento` ahora devuelve `id`.
2. Endpoint `POST /api/avistamientos/{id}/foto` (auth requerida, allowlist `image/jpeg`/`image/png`, cap 5MB, filename generado server-side) + `app/config.py` nuevo + volumen compartido en `docker-compose.private.yml` + `python-multipart` agregado a `requirements.txt`.
3. Cliente mobile (`uploadAvistamientoFoto` en `client.js`) wireado al flujo de submit — sube la foto después de crear el avistamiento, no bloqueante.
4. Thumbnail real en la tarjeta de lista y en el modal de detalle (`SightingsScreen.js`), fallback a ícono de cámara si no hay foto.
5. Foto integrada en `ShareCard.js` — el mecanismo de captura (`captureRef`) ya existente la incluye automáticamente en el PNG compartido, sin tocar `handleShare`.

**Review final de rama completa (opus) encontró 2 Critical + 2 Important reales** que ningún review por tarea podía ver solo:
- Los 2 tests pytest nuevos (de tareas 1 y 2) se rompían entre sí al correr juntos — ambos seteaban `app.dependency_overrides[get_db]` a nivel de import contra motores SQLite en memoria separados, así que el que se importaba último "ganaba" el override global y el otro archivo quedaba probando contra datos que nadie consultaba. Corregido con `test/conftest.py` compartido.
- Un test de auth solo restauraba su override en el camino de éxito — un fallo de assertion hubiera dejado toda la sesión de test sin auth. Corregido con `try/finally`.
- Sin chequeo de dueño en el endpoint de foto (cualquier colaborador autenticado puede pisar la foto de cualquier avistamiento) — mismo patrón ya existente en el `DELETE` del mismo archivo, no es regresión nueva. Se agregó un comentario explícito en el código (no un fix de comportamiento, estaba fuera de alcance).
- Cap de 5MB se aplicaba después de leer el body completo — se agregó un pre-check por header `Content-Length` antes de leer, quedando el check post-lectura como respaldo.
- Hallazgos Minor también corregidos: `docker-compose.yml`/`.prod.yml` también recibieron el volumen compartido (sus servicios `api` también corren `app.main:app`), comentario aclaratorio sobre el hardcode de `image/jpeg` en mobile, y la gamificación (`incrementSightings`) ahora premia foto solo si el upload realmente tuvo éxito, no solo si se intentó.

**Incidente de proceso:** el agente del fix wave final se quedó sin cupo de su propia cuenta a mitad de tarea (límite de sesión ajeno, no de esta sesión), dejando cambios sin commitear en el worktree. Redespachado un agente fresco que retomó el trabajo ya en curso (sin descartarlo), completó los 2 hallazgos que faltaban y commiteó todo — re-review con foco (scoped) confirmó los 7 hallazgos atendidos, sin breakage nuevo.

**Mergeado a `master`** (`fe3cd06`), worktree y rama limpiados. Tests del feature (6) pasando en `master` post-merge.

**Pendiente real antes de producción:** migración manual `ALTER TABLE avistamientos ADD COLUMN foto_url TEXT;` (documentada, no ejecutada) + redeploy real de `api1`/`api2` en el droplet privado con `docker compose -f docker-compose.private.yml up -d --build api1 api2` (recoge el volumen nuevo y `UPLOAD_DIR`). Ninguno de los dos se hizo esta sesión — el trabajo quedó completo y mergeado a nivel de código, no desplegado.

### B — Trabajo en paralelo (otra sesión concurrente, mismo repo) — easter egg de versión + haptics

Registrado tal cual lo reportó esa sesión (no verificado por esta sesión), dos worktrees separados de `MockupsSwayMobile`:

**Easter egg (worktree `sway-poo-easter-egg`, branch `easter-egg-version-tap`):** diseño acordado verbalmente (5 taps en el logo de `ScreenHeader.js` → modal fullscreen con `expo-video` reproduciendo `assets/easter-egg.mp4`, auto-close al terminar o al tap) pero **sin spec escrita** (el `Write` fue rechazado por el usuario a mitad del brainstorming) y **sin código**. Video se genera aparte (el usuario lo va a proveer), integración queda pendiente. Se investigó `nexu-io/open-design` como posible herramienta para generarlo — confirmado que no es instalable vía npm (paquete `open-design` no existe en el registro, un resumen de WebFetch alucinó ese comando), requiere clonar y compilar el monorepo completo (Node 24 + pnpm 10.33.x). Usuario canceló esa instalación explícitamente, va a proveer el mp4 por separado.

---

## Sesión 2026-08-01 (continuación) — Eliminar evento real, prueba local sistemática, Logros/Actividad reciente wireados a datos reales

### A — `DELETE /api/eventos/{id}` conectado a la API real

Encontrado el mismo patrón de gap que ya se había arreglado antes para avistamientos: `handleDelete` en `EventsScreen.js` solo mutaba estado local (`setEvents(prev => prev.filter(...))`), sin llamada al backend, y el backend **no tenía endpoint de borrado en absoluto** (confirmado en vivo contra prod: `DELETE /api/eventos/1` → `404`).

- **Soft delete, no hard delete** — decisión tomada al ver que `RegistroEvento` referencia `eventos.id` por FK. Un hard delete hubiera arriesgado violar esa constraint si algún evento tuviera registros (la tabla existe en el esquema aunque nada la usa activamente todavía). En vez de eso, `eliminar_evento` mueve `id_estatus` al id de `"Cancelado"` (ya existe en el catálogo `Estatus` sembrado, junto a Activo/Inactivo/Pendiente/Completado) — mismo patrón de ciclo de vida que ya usa `crear_evento` (arranca en `id_estatus=1` "Activo") y que ya filtra `get_eventos` (`WHERE Estatus.nombre == "Activo"`).
- Sin chequeo de dueño — mismo patrón ya establecido (y documentado como intencional) en `DELETE /api/avistamientos/{id}`.
- `deleteEvento(id)` agregado a `client.js`, wireado en `EventsScreen.js` con refresco de lista respetando el toggle Míos, igual que el patrón ya usado para avistamientos.
- Commit `03f39c6`.

### B — Metodología de prueba local, sin necesidad de droplet, establecida y usada para 2 features

A pedido del usuario ("¿hay forma de probar local antes de deploy?"), se confirmó y demostró que `docker-compose.yml` (marcado como "solo archivo de referencia" en su propio comentario) sirve perfectamente para correr Postgres local — ya estaba corriendo de una sesión anterior (`sway_postgres`, puerto `5433`). Patrón usado dos veces esta sesión:
1. Levantar `uvicorn app.main:app` apuntando a `postgresql+psycopg://sway_app:sway123@localhost:5433/sway` (sin Docker para la API, solo para Postgres).
2. Registrar una cuenta de prueba real vía `/api/colaboradores/register` (con el payload en archivo temporal, nunca inline, por el problema conocido de `ñ` en Git Bash).
3. Ejercer el flujo real completo (crear evento/avistamiento, subir foto, borrar, verificar respuesta y estado en DB vía `psql`).
4. Revertir todo — borrar filas de prueba, revertir columnas/estatus tocados, matar el proceso `uvicorn` (con PowerShell `Get-NetTCPConnection`/`Stop-Process`, ya que `pkill` no existe en Git Bash de Windows).

Usado para validar **eliminar evento** (soft delete real, verificado con `psql` que la fila sobrevive con estatus Cancelado) y **foto de avistamiento** (columna `foto_url` aplicada localmente, upload real de un JPEG válido vía multipart, servido de vuelta sin `x-api-key`, rechazo de content-type/tamaño/auth verificados con códigos reales 400/401/413).

### C — Despliegue real a producción de ambas features (foto + delete de eventos)

Pedido explícito del usuario para poder probar desde su propio Expo Go. Pasos reales ejecutados (no simulados):
1. `git push origin master` (local estaba 15 commits adelante de `origin`, incluía también la rama `haptics-key-actions` que el propio usuario había mergeado).
2. SSH al droplet privado (`165.232.146.240`, repo en `/root/sway`), `git pull`.
3. Migración manual `ALTER TABLE avistamientos ADD COLUMN foto_url TEXT;` contra `sway_postgres` en el droplet.
4. `docker compose -f docker-compose.private.yml up -d --build api1 api2` — rebuild real, confirmado con `docker inspect` que ambos contenedores comparten el mismo volumen nombrado `sway_uploads_data` montado en `/app/uploads` (el fix de split-brain es real en prod, no solo en el archivo compose).
5. Verificado en vivo vía HAProxy/dominio real: ambos endpoints nuevos responden `401` (existen, no `404`), `foto_url` aparece en el listado real de avistamientos.

### D — Verificación en vivo del toggle "Míos" de Eventos (pregunta directa del usuario, no solo lectura de código)

Registrada cuenta de prueba real contra prod, confirmado `mine=true` devuelve `0` eventos antes de crear ninguno, exactamente `1` (el recién creado) después, y la lista global sin filtrar sube de 4 a 5 — aislamiento real por `Organizador.id_usuario`, no solo un filtro de fachada. Limpieza completa después (evento borrado con el propio endpoint nuevo de delete, cuenta de prueba eliminada de la DB de prod vía SSH).

### E — Aclarado qué NO hace nada en el app (2 preguntas directas del usuario)

- **Crear un evento para "hoy"** no dispara ninguna alerta — `NotificationsScreen.js` es 100% mock hardcodeado, sin `useEffect` ni fetch real, desconectado de cualquier evento/avistamiento real. Lo único real que reacciona a fechas es `mapEventoFromApi` en `EventsScreen.js`, y solo compara la fecha (no la hora), así que un evento más tarde el mismo día sigue mostrando `UPCOMING` todo el día.
- **El toggle "Eventos" bajo "Preferencias de notificaciones" en Perfil** es decoración pura — `notifPrefs` es `useState` local en `ProfileScreen.js`, nunca persistido (ni AsyncStorage ni backend), y nunca leído en ningún otro lugar del código (`NotificationsScreen.js` no lo consulta). Se resetea a los valores por defecto en cada carga de la app. Mismo patrón de toggle-muerto ya visto antes en la app.

### F — Logros (badges) y Actividad reciente wireados a datos reales

Confirmado por lectura de código que ambos eran mock:
- **"Actividad reciente" en Perfil** (`ProfileScreen.js`) era una constante a nivel de módulo derivada de `sightingsList`/`eventsList` (mocks), calculada una sola vez al cargar el archivo — nunca reflejaba datos reales, a diferencia de la versión de Home (wireada en sesión 2026-07-30).
- **"Logros"** (`GamificationContext.js`) se sembraban desde los mismos archivos mock y solo se incrementaban en memoria por acciones locales de la sesión — nunca perdurable, nunca reflejaba conteos reales.

Trabajo hecho:
- Extraída la lógica de fetch de Home (avistamientos + eventos combinados, ordenados, top N) a un hook compartido nuevo `src/hooks/useRecentActivity.js`, reusado por Home y Perfil (pedido explícito del usuario, "usa ponytail para reusar").
- `GamificationContext` reescrito para sembrar contadores reales vía `getAvistamientosMine`, `getEventosMine`, `getEspecies`.
- **Dos logros no tenían equivalente real honesto en el backend** — "Guardián del océano" dependía de un estado "verificado" que no existe en la tabla `avistamientos` (columna no existe, `mapAvistamientoFromApi` siempre pone `status:'PENDING'`), y "Voluntario activo" dependía de asistencia/RSVP a eventos, feature que no existe en ningún lado de la app pese a que la tabla `RegistroEvento` existe en el esquema (nunca se escribe en ella). Redefinidos en vez de dejarlos permanentemente inalcanzables: "Guardián del océano" ahora cuenta el total real de avistamientos reportados, "Voluntario activo" cuenta eventos organizados por el usuario (`getEventosMine`).
- **Agregados 4 logros nuevos, rápidos de lograr, wireados a funciones ya existentes del proyecto** (sin backend nuevo): "Colaborador aprobado" (`getProfile().colaborador.estado_solicitud`), "Seguridad activada" (`isBiometricLoginEnabled()`, con actualización en vivo al togglear biometría sin necesitar relogin), "Primera foto" y "Primer evento" (mismos contadores reales, umbral 1).
- **Bug real encontrado antes de desplegar, no después:** `GamificationProvider` envolvía a `AuthProvider` en `App.js`, montado una sola vez para toda la vida de la app, antes del login. Un `useEffect(..., [])` hubiera corrido sin token, fallado con 401, y nunca vuelto a intentar tras loguearse — logros/puntos congelados en cero toda la sesión real. Corregido invirtiendo el anidado de providers (`AuthProvider` ahora envuelve a `GamificationProvider`) y hacendo el fetch dependiente de `isLoggedIn`, reseteando a cero en logout.
- **Fix de texto cortándose a nivel de carácter en las tarjetas de Logros** (reportado con captura por el usuario: "Colecc/ionista/de esp/ecies") — layout de una sola fila (ícono + label + progreso apretados) dejaba muy poco ancho para el label. Reestructurado a ícono+progreso arriba, label completo abajo con `numberOfLines={2}`.
- Commit `08db172`.

**Haptics (worktree `sway-poo-haptics`, branch `haptics-key-actions`):** `expo-haptics` instalado, `src/utils/haptics.js` nuevo (3 helpers: success/error/warning) wireado en 6 pantallas (Sightings, Events, Login, Profile, Catalog — submits/errores/confirmaciones destructivas). Alcance decidido explícitamente con el usuario: **no** en validación de campo (~25 alerts de "datos incompletos" quedan sin tocar, para no generar ruido). Cambios completos pero **sin commitear** — pendiente probar en dispositivo/Expo Go real antes de commitear (nunca se llegó a verificar en runtime). Un proceso Metro quedó zombie en el puerto 8081 (arrancado sin `run_in_background: true`) — pendiente matarlo antes de poder levantar el dev server correctamente contra ese worktree. El usuario dijo que va a mergear él mismo una vez esté conforme con la prueba en dispositivo.

**Actualización — haptics ya mergeado.** Confirmado en esta sesión (`git log` en `master`): el usuario probó y mergeó `haptics-key-actions` él mismo (`198e5a1`), como había dicho que haría. `expo-haptics` apareció en `package.json` de `master` sin `node_modules` actualizado localmente en este checkout — causó `CommandError` al correr `npx expo start` (mencionado como pendiente en la sección anterior). Resuelto con `npm install` simple en `MockupsSwayMobile/`.

---

## Sesión 2026-08-01 (continuación) — Easter egg de versión: video real generado e implementado (trabajo en paralelo, otra sesión concurrente)

Registrado tal cual lo reportó esa sesión (no verificado por esta sesión) — continuación directa del easter egg mencionado arriba como "sin spec, sin código". Esta vez sí se completó: ciclo `writing-plans` → `subagent-driven-development` (3 tasks + review final de rama), en el worktree `sway-poo-easter-egg` (branch `easter-egg-version-tap`), **sin mergear a master** (pedido explícito del usuario).

- **Video generado con el toolchain real de HyperFrames** (`npx hyperframes --version` → `0.7.88`, ya instalado) — no el `open-design` fake investigado y descartado en la sesión anterior. Skill `motion-graphics` instalada vía `npx hyperframes skills update` (marcó un Snyk Critical Risk, investigado: vive en 2 archivos de categoría "maps" que la composición de logo nunca toca, sin exposición real).
- `MockupsSwayMobile/assets/easter-egg.mp4` generado y verificado independientemente por el reviewer (no solo reportado) — `ffprobe` propio confirmó 1080x1920 portrait, 3.0s, sin audio; frames extraídos confirmaron paleta on-brand. Commit `dc45562`.
- `EasterEggVideo.js` (componente `expo-video`, fullscreen) y `useTapTrigger.js` (hook de lógica pura, TDD real con test `node assert`) — wireados en `ScreenHeader.js` sin romper sus 3 branches existentes (`showBack`/`hideLogo`/normal). Commits `ea49ce0`, `d9e2ea6`.
- **Bug real encontrado por el review final de rama completa (opus), no por los reviews por tarea:** `EasterEggVideo` se montaba sin condición en `ScreenHeader.js` — hasta 6 reproductores de video nativos vivos en memoria simultáneamente (uno por tab del bottom-nav), incluso en pantallas `hideLogo` que nunca pueden disparar el easter egg. Causa raíz real: `useVideoPlayer` crea el player nativo al montar el componente, no al volverse visible. Fix de una línea (montaje condicional `{eggVisible && <EasterEggVideo .../>}`), cierra gratis también un Minor diferido de Task 2. Commit `61dfcff`.
- **Gap de `app.json` encontrado y corregido:** `npx expo install expo-video` (Task 2) había modificado `app.json` (config de plugin) pero el commit de Task 2 nunca lo incluyó — detectado por el reviewer de Task 3 como observación fuera de su alcance, commiteado directo por el controller (`dfae27d`) al ser output mecánico de una herramienta, no una decisión de código.
- **Lo que no funcionó:** FFmpeg/FFprobe faltaban en el entorno, bloqueando el render hasta instalar vía `winget install Gyan.FFmpeg` (el PATH no se propagó automático a la shell corriendo, necesitó export manual). El código literal del plan para `useTapTrigger.js` (mezclaba `export default` ESM con `module.exports.default` CommonJS) crasheaba bajo Node 24 — el implementador cambió a `require('react')` + `module.exports` puro, verificado por el reviewer como más seguro para el interop de Babel/Metro, no solo diferente.
- **Sin verificar en dispositivo real** — ningún emulador disponible en el entorno de esa sesión. Solo verificado: test de lógica pura, archivo de video (ffprobe + frames), lectura estática del código. Falta el tap-through manual real (5 taps rápidos → video; 4 taps + espera 3s + 1 tap → no dispara).
- Menú de `finishing-a-development-branch` presentado (merge local / PR / dejar como está) — sin respuesta del usuario todavía al cierre de esa sesión.
