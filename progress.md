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
