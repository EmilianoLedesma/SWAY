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

---

## Sesión 2026-08-01 (continuación) — Bugs reales de eventos, feed poblado, spec+plan de asistencia (RSVP) pendiente de ejecutar

### A — Quitada la distinción verificado/pendiente en Avistamientos

`status:'PENDING'` estaba hardcodeado en `mapAvistamientoFromApi`, nunca reflejaba nada real. El subtítulo del header comparaba contra `'VERIFIED'`, que nunca se seteaba — "0 verificados" siempre, bug real ya presente antes de esta sesión. Quitados: el campo `status`, el borde ámbar de "pendiente" en la tarjeta, el conteo roto. Subtítulo ahora muestra el total real como verificado (decisión explícita del usuario: "always assumes that is verified"). Commit `40df4b3`.

### B — Bug real de zona horaria en fechas de evento, encontrado en vivo contra prod

Usuario pidió crear un evento para "hoy" a las 19:10 hora de México para ver qué disparaba en la app. Antes de crear nada, se corrió la comparación real: `new Date('YYYY-MM-DD')` parsea como medianoche **UTC**, y en hora de México (UTC-6) pasadas las ~18:00 locales ya es "mañana" en UTC — cualquier evento de hoy se clasificaba como `PAST` y desaparecía de "próximos". Confirmado empíricamente creando un evento real en prod y replicando la lógica exacta de `EventsScreen.js`/`useNotifications.js` contra el timestamp real (`UTC now: 2026-08-02T01:05`, MX real `19:05` del 1/8). Corregido en los 2 lugares que hacían el mismo chequeo, comparación cambiada a string `'YYYY-MM-DD'` en zona horaria local del dispositivo. Commit `deabec7`.

### C — Bug real en `crear_evento` (path anónimo), encontrado creando eventos de prueba

Al crear varios eventos de prueba reusando el mismo email de `contacto`, el 2° request crasheaba con `500` — `crear_evento` insertaba un `Usuario` nuevo sin chequear si el email ya existía (a diferencia de `reportar_avistamiento`, que sí hace get-or-create). Reproducido y corregido localmente contra Postgres real antes de desplegar a prod. Commit `48a5bc9`.

### D — Eventos en tiempo real + orden corregido + popup de evento nuevo

- **Fetch convertido de `useEffect` (solo mount/toggle) a `useFocusEffect`** — se refresca cada vez que se vuelve a la pantalla, no solo al montar (mismo patrón que `useRecentActivity`).
- **Orden corregido** — el backend ordena estrictamente por fecha ascendente, así que eventos 2025 (pasados) salían antes que los de 2026 (próximos). Ordenado client-side: upcoming primero (más cercano primero), pasados después (más reciente primero).
- **Popup reusando el mecanismo de logros** — `celebrate()`/`CelebrationOverlay` (ya global, usado por badges) ahora también dispara cuando aparece un evento próximo nuevo desde el último focus. Tracking de ids vistos a nivel de módulo (no persistido, resetea con la app), con baseline en el primer fetch para no popear todo lo existente al abrir la app.
- Commit `a391570`.

### E — Tarjeta de evento completa abre el detalle

Pedido del usuario: quitar el botón "Ver" y hacer que toda la tarjeta sea tocable para abrir el detalle. Card completo convertido a `TouchableOpacity`, botones "Compartir"/"Eliminar" siguen anidados independientes (comportamiento nativo de RN para touchables anidados). Commit `7340929`.

### F — Prod poblado con eventos reales para pruebas

Creados 5 eventos reales upcoming en prod (ids 9-13, fechas 3-14 agosto 2026), usando 4 cuentas de colaborador distintas registradas para simular interacción real (no todos "Equipo SWAY" anónimo) — pedido explícito del usuario ("Create eventos on different usuarios to simulate real interaction"). Verificado el bug C durante este proceso.

### G — Spec + plan de asistencia a eventos (RSVP) — escritos, commiteados, **sin ejecutar**

Ciclo `brainstorming` completo con varias preguntas de diseño resueltas explícitamente con el usuario:
- Alcance: **RSVP únicamente** (intención de asistir), no confirmación de asistencia real post-evento. `asistio` queda `NULL` en cada fila que este feature crea.
- **Capacidad (`capacidad_maxima`) se hace cumplir** — RSVP rechazado al llegar al cupo real.
- Acción de RSVP vive en el modal de detalle ya existente; pantalla nueva es una lista personal de "a lo que voy a asistir".
- **Nombre de la pantalla nueva: "Voy a asistir"** — deliberadamente NO "Mis Eventos", para no colisionar con el toggle "Míos" ya existente (que filtra eventos que organizaste, un concepto completamente distinto — el propio usuario detectó este riesgo de colisión antes de que se implementara nada).
- **Los logros "Voluntario activo"/"Primer evento" vuelven a contar asistencia real** (antes de este feature estaban redefinidos a "eventos organizados" por no existir asistencia real — decisión explícita de revertir ahora que sí existe).

**Spec:** `docs/superpowers/specs/2026-08-01-event-attendance-design.md` (commit `691b646`).
**Plan:** `docs/superpowers/plans/2026-08-01-event-attendance.md` (commit `92357f6`) — 5 tasks: (1) backend, 3 endpoints nuevos sobre `RegistroEvento` (tabla que existía en el esquema sin usarse en ningún lado) + campo `registrados` en el listado existente, con tests pytest; (2) 3 funciones nuevas en `client.js`; (3) botón de asistencia en el modal de detalle de `EventsScreen.js` + conteo real de participantes + link a la pantalla nueva; (4) pantalla nueva `MisAsistenciasScreen.js` + registro en `AppNavigator.js`; (5) `GamificationContext.js` cambia la fuente de los badges de "organizados" a "asistencia real".

**Estado: plan completo, commiteado, NO ejecutado.** Se presentó el menú subagent-driven-development vs inline execution — sesión cerrada antes de que el usuario eligiera.

---

## Sesión 2026-08-01 (continuación) — Ejecución de asistencia/RSVP vía subagent-driven-development, Task 1/5

Ciclo `subagent-driven-development` iniciado sobre el plan de arriba, en worktree aislado (`.claude/worktrees/event-attendance`, rama `worktree-event-attendance`). Sesión cerrada a pedido explícito del usuario ("cuando termine task 1, para y guarda") apenas se cerró la Task 1 — **Tasks 2-5 sin empezar.**

### Task 1 — Backend: 3 endpoints de RSVP + conteo `registrados` — completa

- `_base_eventos_query`/`_serializar_eventos` extraídos de `get_eventos` (refactor sin cambio de comportamiento) + 3 endpoints nuevos (`POST`/`DELETE /api/eventos/{id}/registrar`, `GET /api/eventos/mis-registros`) en `app/routers/eventos.py`. Implementado por subagente (modelo haiku) transcribiendo el código casi verbatim del plan. Commit `351266c`.
- **Bug real encontrado por el reviewer (sonnet) y corregido en una ronda de fix:** `registrar_asistencia` no filtraba `Estatus.nombre == "Activo"` en el lookup del evento — un colaborador podía confirmar asistencia a un evento `Cancelado` (soft-delete existente desde la sesión de `DELETE /api/eventos/{id}`), violando la Global Constraint del plan ("cualquier evento Activo"). Corregido con el mismo join que ya usa `GET /api/eventos`, test nuevo agregado (`test_registrar_evento_cancelado_404`). Commit `55d7430`.
- Verificado por el controlador de forma independiente (no solo confiado del reporte del subagente): `python -m pytest test/test_eventos_registro.py test/test_avistamiento_foto_url.py test/test_subir_foto_avistamiento.py test/test_health_endpoint.py -q` → **15/15 pass** después del fix.
- 2 hallazgos Minor del review quedaron diferidos (no bloquean, documentados en el ledger de la ejecución): condición de carrera TOCTOU en el chequeo de capacidad/duplicado (SELECT luego INSERT sin lock ni constraint única en `(id_evento, id_usuario)` — impacto bajo a esta escala); `GET /api/eventos/mis-registros` no filtra por estatus `Activo` como sí hace `GET /api/eventos`, así que el historial de un usuario puede incluir eventos ya cancelados (ambiguo si es lo esperado, no estaba definido en el brief).

### Incidente de proceso — reporte del reviewer llegó tarde, no perdido

El subagente reviewer de la Task 1 tardó ~7 minutos en relayar su reporte completo por el mailbox de teammates, mostrando solo `idle_notification` mientras tanto. El controlador, sin ver contenido tras 3 intentos de pedirlo, asumió que el relay estaba roto y revisó el diff por su cuenta (dando por buena la Task 1 sin el hallazgo Activo). El reporte real llegó minutos después, ya con la sesión "cerrada" — se reabrió Task 1, se aplicó el fix, se re-verificó. **Lección para la próxima vez:** esperar más tiempo antes de asumir que un reviewer subagente falló — en este caso el reviewer sí encontró algo real que la revisión apresurada del controlador se había perdido.

**Estado al cierre:** Task 1 completa (`9ad6bcb..55d7430`, 1 Important corregido, 2 Minor diferidos). Tasks 2 (client.js), 3 (EventsScreen.js), 4 (MisAsistenciasScreen.js + nav), 5 (GamificationContext.js) del mismo plan, sin empezar. Ledger de la ejecución en `.superpowers/sdd/2026-08-01-event-attendance/progress.md` dentro del worktree — próxima sesión debe resumir ahí, no re-despachar Task 1.

---

## Sesión 2026-08-02 — Asistencia/RSVP: Tasks 2-5 completadas, merge, deploy real, datos de prueba

Continuación directa de la sesión anterior sobre el mismo worktree (`.claude/worktrees/event-attendance`). Confirmado que Task 1 seguía completa (ledger + `git log` verificados) antes de continuar — sin re-despachar nada ya hecho.

### Tasks 2-5 — `subagent-driven-development`, todas transcripción casi verbatim del plan

- **Task 2** (haiku): 3 funciones nuevas en `client.js` (`registrarAsistencia`, `cancelarAsistencia`, `getMisEventosRegistrados`), mismo patrón de error que `deleteEvento`. Commit `1c7c61e`. Review limpio.
- **Task 3** (sonnet, por tener más juicio de integración): botón de asistencia en el modal de detalle de `EventsScreen.js`, conteo real de participantes (`registrados` de Task 1), `useFocusEffect` combinado con `getMisEventosRegistrados`, link nuevo a "Voy a asistir". Commit `6fbbdcc`. Review limpio.
- **Task 4** (haiku): pantalla nueva `MisAsistenciasScreen.js` + registro en `AppNavigator.js` con el nombre de ruta exacto `'MisAsistencias'` (verificado carácter por carácter contra el link de Task 3, un typo aquí falla en silencio). Commit `b63af98`. Review limpio.
- **Task 5** (haiku): `GamificationContext.js` cambia `eventsOrganized` → `eventsAttended` en 5 puntos del plan + 1 línea extra no listada en el brief (`points = ... + counters.eventsOrganized * 15` también necesitaba el rename, o el cálculo de puntos hubiera dado `NaN`). Reviewer lo flageó explícitamente para que el controlador adjudicara — aprobado como corrección necesaria, no scope creep. Commit `0e32f09`.

### Review final de rama completa (opus) — 2 Important reales de integración cruzada, ninguno visible por task individual

1. **`eventsAttended` solo subía, nunca bajaba al cancelar una asistencia** — el modelo de contador (incrementos ciegos, heredado de cuando "asistencia" era un proxy irreversible de "eventos organizados") nunca contempló que Task 5 introdujo una acción reversible (cancelar RSVP). Corregido reemplazando el incremento ciego por un setter (`setEventsAttended(n)`) alimentado por el conteo real del refetch, en los 2 call-sites (toggle en `EventsScreen.js`, cancelar en `MisAsistenciasScreen.js`) — la función vieja `incrementEventAttended` se eliminó por quedar sin usos.
2. **El modal de detalle de evento mostraba el conteo de participantes desactualizado** justo después de tocar "Asistiré" — `handleToggleAsistencia` refrescaba la lista de eventos pero nunca re-apuntaba el snapshot `detailEvent` al dato fresco. Corregido re-buscando el evento actualizado por id y llamando `setDetailEvent(...)`.
3. **(Minor, plegado al mismo fix)** el chequeo de `sessionExpired` del `Promise.all` combinado solo miraba el primer fetch, no el segundo (`getMisEventosRegistrados`) — una sesión expirada borraba el token silenciosamente sin disparar logout. Una línea más en el mismo fix.

Fix wave único (sonnet) + re-review acotado (sonnet): los 3 hallazgos verificados `ADDRESSED`, sin regresiones nuevas. Commit `33be680`.

**Hallazgos Minor diferidos al ledger** (no bloquean, decisión explícita de no arreglarlos ahora): `GET /api/eventos/mis-registros` sigue sin filtrar por `Activo` y ahora alimenta también los logros y la pantalla nueva (mayor alcance que cuando se diferido en Task 1, queda como decisión de producto pendiente); código muerto (`status`/`todayLocalStr`) en `MisAsistenciasScreen.js` transcrito tal cual venía en el plan; tests sin aserción explícita de `asistio IS NULL` ni cobertura de `capacidad_maxima=NULL`; bug preexistente de "0/0 completo" en eventos sin cupo máximo (no introducido por este feature, solo señalado); condición de carrera TOCTOU y `datetime.utcnow()` deprecado (ya diferidos desde Task 1).

### Merge, deploy y verificación en vivo

- Suite completa corrida en el worktree antes de mergear: **19/19 tests pasan** (excluyendo 2 archivos de test rotos preexistentes en `master`, confirmado que ya fallaban antes de este feature — `test_home.py`/`test_integration_create_especie.py`, `ImportError` al importar `app` desde `app`, sin relación a este trabajo).
- Merge fast-forward a `master` (`9ad6bcb..33be680`), re-verificado con la suite completa contra el merge real (**20/20 pass**), worktree y rama `worktree-event-attendance` eliminados.
- `git push origin master`, SSH al droplet privado, `git pull`, `docker compose -f docker-compose.private.yml up -d --build api1 api2` — rebuild real, contenedores recreados.
- Verificado en vivo contra `https://proyecto-sway.site` (con `x-api-key`, la clave global sigue siendo obligatoria): `GET /api/eventos` devuelve `registrados` real, `POST`/`GET /api/eventos/{id}/registrar` y `GET /api/eventos/mis-registros` responden `401` sin token de usuario (existen, no `404`) — confirmando que el despliegue realmente corre el código nuevo.

### Datos de prueba: conteo real de asistencia poblado para los 11 eventos de prod

A pedido del usuario ("ninguno debe quedar en 0"), se sembraron filas reales en `registrosevento` para los 6 eventos que tenían `registrados=0` (ids 5, 6, 9, 11, 12, 13), usando cuentas de colaborador reales ya existentes en prod (excluidas explícitamente las cuentas de prueba obvias `ProdTest`/`SuiteTest`/`Pentest`, y excluido en cada caso el propio organizador del evento para no auto-registrarse). 20 filas insertadas vía SQL directo (archivo temporal + `scp` + `psql -f`, mismo patrón ya establecido para evitar el problema de escape de shell anidado). Verificado después: los 11 eventos de prod muestran `registrados` entre 1 y 4, ninguno en 0, todos muy por debajo de su `capacidad_maxima`.

**Estado del feature:** completo, mergeado, desplegado, verificado en vivo, con datos de demostración poblados. Sin pendientes abiertos de esta sesión salvo los Minor diferidos ya listados arriba.

### Sync final — commit del progress.md, push, pull en ambos droplets

- Commiteado `progress.md` (único cambio pendiente en el checkout local) y pusheado a `origin/master` (`9a27799`).
- **Droplet privado:** `git pull` trivial, solo el cambio de `progress.md` — sin rebuild necesario (no toca código de la API).
- **Droplet público:** `git pull` reveló que llevaba **varias sesiones sin actualizarse** (seguía en `700f831`, antes de easter egg, haptics, foto de avistamiento, y todo lo de asistencia/RSVP) — sincronizado ahora a `9a27799`, 50 archivos. No requiere rebuild de contenedores (este droplet solo corre HAProxy/nginx-portal/Grafana, no la API).
- **2 incidentes menores durante el pull, ambos resueltos sin pérdida de datos:**
  1. `git pull` en el público falló primero por "dubious ownership" (repo en `/home/sway/sway` pertenece a `sway`, comando corrido como `root`) — resuelto con `git config --global --add safe.directory /home/sway/sway`.
  2. Cambio local sin commitear en `grafana/provisioning/dashboards/sway-balanceo.json` bloqueaba el merge. Investigado antes de tocar nada: `stash` primero, comparado byte a byte contra la versión que trajo el pull (`md5sum` con `\r` removido) — **contenido idéntico**, la diferencia era solo formato de fin de línea (CRLF vs LF), no un cambio real. Resuelto quedándose con la versión del repo (`checkout --ours`) y descartando el stash (ya no aportaba nada nuevo). Los 2 scripts de renovación SSL sin trackear (`haproxy/pre_renew.sh`/`post_renew.sh`, ya documentados en sesiones anteriores) se dejaron intactos, sin tocar.
- **Ambos droplets confirmados limpios y en `9a27799`** al cierre.

---

## Sesión 2026-08-02 (continuación) — Verificación en vivo de Grafana, normalización de la suite de verificación PI

### A — Grafana verificado panel por panel contra Prometheus real, no solo el render

Usuario pidió confirmar que Grafana funciona como se espera. Login real via navegador (chrome-devtools), credencial `GRAFANA_ADMIN_PASSWORD` obtenida vía SSH del `.env` del droplet público (no vivía en el repo, como está documentado). Dashboard "SWAY — Balanceo y Monitoreo" abierto en `https://proyecto-sway.site/grafana/`.

- Primeras capturas mostraron paneles en blanco — investigado antes de reportar como bug: los requests `POST /grafana/api/ds/query` devolvían `200` con series reales (`api_back/api1`, etc.) en el body, así que no era un problema de datos. Confirmado que era un timing de repintado del canvas en la captura headless (una captura posterior mostró los 6 backends con valores reales, `Backends activos` en `1` todos).
- Verificados los 7 paneles individualmente vía `viewPanel=N` en la URL + snapshot de accesibilidad (no solo screenshot): peticiones por backend (6 series), backends activos (6× `1`), CPU host, distribución de tráfico %, sesiones por réplica, conexiones Postgres (`6`), 4xx/5xx (12 series).
- A pedido explícito de no confiar solo en el render, se consultó `http://10.124.0.3:9090/api/v1/query` directo (bypass total de Grafana) para las 7 expresiones PromQL del dashboard — todas devolvieron valores reales no-cero (excepto sesiones actuales, en `0` por estar el sistema idle en ese momento, no roto). El valor de conexiones Postgres (`6`) coincidió exacto entre Prometheus crudo y lo renderizado en Grafana.

### B — Screenshots viejos de terminal (arquitectura de 1 droplet) identificados como obsoletos

Usuario compartió 3 capturas antiguas (JWT `auth.py`, hashing `# bcrypt`, `docker compose -f docker-compose.prod.yml ps`/`docker stats`) pidiendo verificar si seguían siendo representativas.

- **JWT:** el código real (`app/security/auth.py:8-10`) es más estricto que la captura — la captura mostraba un fallback débil (`os.getenv("JWT_SECRET_KEY", "cambia_esto_en_produccion")`) que solo existe en el doc de diseño viejo (`docs/seguridad_api_app_layer.md:100`), no en el código que corre. El código real falla el arranque (`RuntimeError`) si falta la variable — sin fallback silencioso.
- **Hashing:** el comentario `# bcrypt` es incorrecto — Werkzeug usa PBKDF2-SHA256 por defecto (confirmado en prod: `password_hash LIKE 'pbkdf2:%'`), no bcrypt. El comentario solo vive en `docs/seguridad_api_app_layer.md:72`, no en el código real (`app/routers/auth.py`/`colaboradores.py`, sin ningún comentario de algoritmo). Usuario pidió explícitamente no tocar ese doc viejo.
- **`docker ps`/`docker stats`:** capturas de la arquitectura de un solo droplet (`sway_api`, `sway_web`, `docker-compose.prod.yml`), ya no representativa. Reproducido en vivo contra la arquitectura real de 2 droplets (`docker-compose.private.yml`, 8 contenedores incluyendo `api1`/`api2`) — confirmado que las nuevas capturas prueban mejor 3 de los 14 puntos de la rúbrica que las viejas: #2 (2 servidores, la vieja solo mostraba 1), #7 (balanceador, la vieja no tenía réplicas), #4 (firewall — la vieja mostraba bind a `0.0.0.0:80`, exactamente el bug que la review de seguridad de la sesión 2026-07-31 había encontrado y corregido; la nueva muestra bind a `10.124.0.3:8001`, la IP VPC).
- Reproducido también un log realista de tráfico real (`docker compose -f docker-compose.private.yml logs api1 api2`) — encontrado que el log se satura de `/health` (scrape de Prometheus) y hay que filtrarlo (`grep -v '/health'`) y generar tráfico real primero (`curl` a varios endpoints) para que aparezca algo parecido a la captura vieja.
- Preguntado por qué el log no muestra alternancia estricta `api1`/`api2` por request — explicado que `balance roundrobin` de HAProxy asigna por conexión TCP nueva, no por request individual; con keep-alive HTTP, varios requests seguidos de un mismo cliente caen en el mismo backend. El agregado (`api1=447` vs `api2=449` en la corrida de esa sesión) sigue siendo ~50/50 real.

### C — Suite `scripts/verify_pi_requirements.sh` corrida completa, doc normalizado, rate limiting dejó de skipearse

- **Normalización de llave SSH:** `docs/PI_REQUIREMENTS_VERIFICATION.md` mezclaba `~/.ssh/sway_droplet` (llave vieja) y `~/.ssh/sway_deploy` (llave nueva) en 23 comandos — ambas seguían autorizadas en los 2 droplets, nada estaba roto, pero a pedido del usuario se normalizó todo a `sway_deploy` (`sed` global, verificado que no quedó ningún `sway_droplet`).
- **Suite corrida 3 veces contra producción real** con `SSH_KEY=~/.ssh/sway_deploy`: **25 pass / 0 fail / 2 skip** las primeras 2 corridas (antes del cambio de rate limiting), **26 pass / 0 fail / 1 skip** después.
- **Rate limiting (429) dejó de skipearse — ahora se prueba de verdad.** Antes el script solo emitía `skip` (razón: gastaría el cupo real del endpoint de login). Reemplazado por un test real: 6 requests seguidos de login con credenciales falsas, pegándole directo a una sola réplica (`http://10.124.0.3:8001`, bypaseando HAProxy) para no repartir el cupo entre `api1`/`api2` — confirmado en vivo que los intentos 1-5 dan `401` y el 6° da `429` real. Mismo patrón que ya existía como ejemplo manual en la sección 5 del doc, ahora automatizado.
- **Mobile (ítems 8-10) se mantiene como el único `SKIP` real, no por pereza** — no hay forma de probarlo con `curl`/SQL/etc. porque son juicios de UX ("¿se ve profesional?", "¿la navegación es clara?") que requieren un harness de pruebas E2E de UI (Detox/Appium/Maestro) sobre la app corriendo en un dispositivo/simulador real, que este proyecto no tiene armado. Documentado explícitamente en el doc en vez de dejarlo ambiguo.
- **Verificación cruzada manual:** además de correr el script automatizado, se ejecutaron a mano los comandos individuales de cada sección del doc (1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14) contra producción real, confirmando que cada uno coincide con lo que reporta la suite — nada estaba desactualizado en el doc.

---

## Sesión 2026-08-02 (continuación 2) — Bastion real hacia el droplet privado, lockout SSH, recuperación vía Recovery Console

### Motivación

Usuario notó, mientras hacía un túnel SSH al droplet público, que el "privado" seguía siendo alcanzable directo por su propia IP pública — rompiendo el modelo mental de que el público es el único punto de entrada. Auditoría con `Application-Security-Specialist` (SSH real a ambos droplets) confirmó: el privado sí tenía IP pública real (`165.232.146.240`, interfaz `eth0`), puerto 22 abierto a "Anywhere", y `PasswordAuthentication yes` en sshd — superficie de fuerza bruta innecesaria (los puertos de app ya estaban bien contenidos a la VPC, eso no era el problema). El privado nunca actuó como bastion — la gestión SSH entraba directo a cada droplet por su propia IP pública, sin patrón de salto.

### Incidente — lockout SSH real durante la implementación

Plan acordado: público como bastion real vía SSH agent forwarding (sin copiar ninguna llave privada al servidor), UFW del privado restringido a solo aceptar 22/tcp desde la IP VPC del público (`10.124.0.2`), `PasswordAuthentication no`. Dispatch a `DevOps-CI-CD-Engineer` con checkpoint explícito de "probar el salto antes de cerrar el acceso viejo".

El checkpoint (paso 3) pasó bien. Al ejecutar el paso 4 (reordenar reglas UFW: agregar la nueva antes de borrar la vieja), el agente uso `ufw delete <N>` por número — la renumeración entre cada borrado hizo que borrara por error su propia regla nueva del bastion en vez de la regla IPv6 sobrante. Resultado: **cero reglas IPv4 permitían el puerto 22** en el privado — lockout SSH total, tanto directo como por el salto recién armado. El agente intentó auto-recuperarse buscando token de API de DigitalOcean (`doctl`, variables de entorno `DO_TOKEN`) para arreglarlo programáticamente — no encontró ninguno, correctamente detenido por el monitor de seguridad de la sesión (acción no autorizada, sin daño real porque no había credencial que encontrar).

**Confirmado que el lockout no afectó a usuarios reales:** api1/api2/Postgres/Prometheus siguieron corriendo sin interrupción (solo se perdió acceso de gestión SSH, no el servicio). Verificado en vivo contra `https://proyecto-sway.site` durante el incidente — API respondiendo normal.

### Recuperación

- **DO Web Console (out-of-band) falló repetidamente** con "Timed out while waiting for handshake" — descartado como causa: extensión VPN del navegador (no estaba activa), red del usuario, DO status page (todo verde). Restart del droplet tampoco lo resolvió.
- **Hallazgo real vía la documentación oficial de DO** (fetched con WebFetch): la Web Console normal en realidad **sí depende del firewall/sshd** ("your host firewalls must accept SSH traffic on the port that sshd uses") — explica por qué fallaba, no era un problema de DO sino consecuencia directa del propio lockout.
- **Solución:** DigitalOcean tiene una **Recovery Console separada** (Droplet → Settings → "Recovery console" → Launch Console) — login local tty (`getty`), completamente independiente de sshd/red/UFW, solo requiere usuario + password root del sistema. El usuario ya tenía password root configurado — entró sin problema.
- Desde la Recovery Console, corregido a mano: `ufw allow from 10.124.0.2 to any port 22 proto tcp comment 'bastion jump'` + `ufw delete` de la regla IPv6 "Anywhere" sobrante. Verificado con `ufw status numbered`: solo quedan reglas VPC, ninguna "Anywhere".
- Verificado desde la máquina de control: salto vía agent forwarding (`ssh -A` al público → `ssh` interno al privado) funcionando end-to-end (8 contenedores confirmados vía `docker ps`), y SSH directo externo al privado con timeout correcto (bloqueado).

**Lección de entorno aparte:** en el sandbox de Bash usado para verificar, cada invocación es un proceso nuevo — variables de entorno de `ssh-agent` (`SSH_AUTH_SOCK`) no persisten entre llamadas separadas. Arrancar el agente y usarlo deben ir en el mismo bloque de comando. Costó una ronda de debugging, documentado ahora en `docs/PI_REQUIREMENTS_VERIFICATION.md` sección 0.1 para no repetirlo.

### Cierre — sshd hardening, docs, y bug real en el script de verificación

Segundo dispatch (mismo especialista, con instrucciones explícitas de no tocar UFW de nuevo) para: deshabilitar `PasswordAuthentication` en el privado (encontró y corrigió un conflicto real entre 2 archivos de `sshd_config.d/` que hacía que la directiva efectiva fuera `yes` pese a que un archivo ya decía `no` — arreglado con un archivo nuevo que ordena antes que ambos), y actualizar `docs/PI_REQUIREMENTS_VERIFICATION.md` + `scripts/verify_pi_requirements.sh` al patrón de acceso nuevo (`ProxyJump`/alias `sway-privado`).

**Antes de dar la tarea por cerrada, se corrió la suite completa (`scripts/verify_pi_requirements.sh`) para confirmar todo end-to-end — reveló un bug real que el agente no había atrapado:** el script usaba `ssh -i "$SSH_KEY" -J "root@$PUBLIC_IP" ...` (ProxyJump por línea de comandos) — a diferencia del alias de `~/.ssh/config` (que sí especifica `IdentityFile` por host y funciona), el flag `-J` en línea de comandos **no** hereda el `-i` para el salto intermedio, solo lo aplica al destino final. Resultado: el salto fallaba silenciosamente (`Permission denied` en el público), y 8 de los 26 checks de la suite fallaban en cascada (todo lo que dependía de `ssh_priv()`). Corregido reemplazando `-J` por `-o ProxyCommand="ssh -i \"$SSH_KEY\" ... -W %h:%p root@$PUBLIC_IP"` (reutiliza la llave explícitamente en ambos saltos) — verificado directo antes de aplicar el fix, y confirmado con la suite completa re-corrida.

**Resultado final: 26 pass, 0 fail, 1 skip (mobile, manual, esperado).** Confirmado en vivo: hasheo real, 2 servidores con 8+3 contenedores, monitoreo (4 targets Prometheus + Grafana + do-agent en ambos), firewall (UFW activo en ambos, sin bind a `0.0.0.0`, puerto interno inalcanzable desde fuera de VPC), JWT + rate limiting real (429 en el intento 6), SSL real de Let's Encrypt, balanceador repartiendo tráfico real, formularios validados, datos compartidos mobile/Web, 51 tablas reales en la BD, `API_HOST` apuntando a producción.

**Estado del bastion:** privado ya no aceptable por SSH directo desde internet (timeout confirmado), todo acceso real pasa por el público vía agent forwarding o `ProxyJump`. IP pública del privado **no se removió** — decisión explícita del usuario de esperar a que el patrón nuevo esté probado unos días antes de considerar ese paso adicional (defensa en profundidad, no imprescindible ya que UFW cierra todos los puertos ahí).
- Todos los cambios de esta sub-sesión: `scripts/verify_pi_requirements.sh` (test de rate limiting real), `docs/PI_REQUIREMENTS_VERIFICATION.md` (normalización de llave + texto actualizado sobre qué se prueba automatizado vs manual), `progress.md` (este registro). **Sin commitear todavía al cierre de esta sub-sección** — pendiente commit/push/pull en ambos droplets.

---

## Sesión 2026-08-04 — Push notifications (descartado) + Realtime sync: spec, plan, revisión exhaustiva, ejecución SDD Tasks 1-4

### A — Brainstorming + spec + plan para 2 features nuevas

Ciclo completo `brainstorming → writing-plans` a partir de una pregunta directa del usuario ("¿la app es realmente tiempo real?"). Se confirmó que "tiempo real" hoy es solo refetch en `useFocusEffect` al enfocar pantalla — dos dispositivos en la misma pantalla nunca se ven entre sí sin navegar fuera y volver. Se diseñaron 2 features relacionadas:

1. **Push notifications** (registro de token Expo + script de broadcast manual único, sin auto-triggers, sin endpoint admin).
2. **Realtime sync** (WebSocket + Redis pub/sub para avistamientos/eventos/especies, reemplazando el patrón de solo-refetch-en-focus).

Spec: `docs/superpowers/specs/2026-08-04-push-notifications-and-realtime-sync-design.md` (commit `3eaaada`).

### B — Push notifications: DESCARTADO POR COMPLETO, no implementado

Después de escribir el plan completo (`docs/superpowers/plans/2026-08-04-push-notifications.md`, ya revisado por especialista y con hallazgos corregidos), el usuario preguntó explícitamente si los planes consideraban que la app solo se prueba vía Expo Go. Investigación vía Context7/docs oficiales de Expo confirmó: **Expo Go en Android no soporta notificaciones push remotas desde el SDK 53** (este proyecto está en `~54.0.34`), y `getExpoPushTokenAsync()` requiere un `projectId` de EAS que este proyecto nunca configuró (sin `eas.json`, sin `extra.eas.projectId` en `app.json`). Verificar esto en el dispositivo real hubiera requerido un development build (EAS o build nativo local) — el usuario decidió explícitamente **no** agregar esa infraestructura y **descartar la feature completa** en vez de dejarla sin poder verificarse nunca.

- Plan borrado (`git rm docs/superpowers/plans/2026-08-04-push-notifications.md`).
- Spec actualizado marcando la Fase 1 como DROPPED, con la razón documentada in-line.
- El plan de realtime-sync se limpió de toda referencia cruzada a push-notifications (ya no depende de nada de esa fase).
- **Nada de código de push se escribió** — se quedó en fase de spec/plan únicamente.

### C — Realtime sync: revisión exhaustiva en 2 rondas antes de tocar código

**Ronda 1** (4 agentes en paralelo — Backend-API-Specialist, Application-Security-Specialist, QA-Testing-Engineer, DevOps-CI-CD-Engineer, Tech-lead) sobre el plan combinado, luego repetida tras el split en 2 archivos. Hallazgos reales corregidos: payload de `avistamiento_created` insuficiente (crasheaba el filtro de búsqueda de `SightingsScreen` con `undefined.toLowerCase()`), cobertura de tests incompleta (6/7 endpoints, no 7/7 como afirmaba el plan), instrucción de mirror a `docker-compose.yml` que hubiera roto ese archivo (sin bloque `networks:`, nombres `api_1`/`api_2`), `depends_on` sin `condition:` explícito, test de WebSocket con `time.sleep(0.2)` en vez de polling (race real), y el plan se separó en 2 archivos independientes (push-notifications / realtime-sync) por recomendación de tech-lead — fases genuinamente separables con gate ya existente.

**Ronda 2** (3 agentes — DevOps deploy-safety, QA local-test-first, Backend-API-Specialist rewrite-correctness) enfocada explícitamente en: probar todo local antes de tocar prod, y minimizar downtime. Hallazgos reales: `ALLOWED_TOKEN_TYPES` original permitía `("colaborador", "tienda")` pero su propio test esperaba que `tienda` fuera rechazado — contradicción que hubiera colgado el test — corregido a `("colaborador",)` únicamente; `realtimeMerge.js` mezclaba sintaxis ESM (`export function`) con test en CommonJS (`require()`) — hubiera lanzado `SyntaxError` real, corregido a `module.exports`; el gate cruzado entre planes no tenía ninguna verificación mecánica (luego irrelevante al descartarse push-notifications); sin chequeo de RAM libre antes de agregar Redis al droplet privado (documentado como ajustado de memoria) — agregado chequeo `free -h` con umbral; verificación cross-replica/idle-timeout del Task 8 iba directo a producción sin equivalente local — agregado dry-run local antes del deploy real.

Todos los hallazgos de ambas rondas fueron corregidos e incorporados al plan (`docs/superpowers/plans/2026-08-04-realtime-sync.md`, commits `3184aa1`, `d9c7e8c`, `e4ee21c`).

### D — Verificación read-only de ambos droplets antes de decidir ejecutar

Conexión SSH real (solo lectura, sin cambios) vía bastión al privado y directo al público para confirmar estado real antes de comprometerse al plan: privado con 1.0GB disponible (de 1.9GB, sobra margen real para el contenedor Redis de 64MB), público con 404MB disponible (irrelevante, no se despliega nada nuevo ahí), ambos con 33GB/19GB de disco libre, HAProxy 3.2.22 corriendo (soporta `timeout tunnel` sin problema), ambos droplets un poco atrás en git (`5873530`, esperado — nada de código nuevo pendiente de desplegar todavía).

### E — Ejecución `subagent-driven-development`, Tasks 1-4 de 8 completadas (todo local, cero contacto con droplets)

Worktree aislado creado manualmente (`.claude/worktrees/realtime-sync`, rama `worktree-realtime-sync`) — el tool nativo `EnterWorktree` con base `fresh` (default) hubiera ramificado desde `origin/master`, que en ese momento no tenía los 6 commits de esta sesión (incluyendo el propio plan a ejecutar); se resolvió pusheando `master` primero y luego sí usando `EnterWorktree` normalmente. Ledger: `.superpowers/sdd/2026-08-04-realtime-sync/progress.md`.

- **Task 1 (Redis infra):** servicio `redis` en ambos `docker-compose*.yml` (con `mem_limit: 64m`, cuidando la diferencia estructural entre archivos), `timeout tunnel 1h` en HAProxy, `redis>=5.0.0` en `requirements.txt`. Revisión limpia. El implementador arregló de paso un bug preexistente real (volumen `uploads_data` referenciado pero nunca declarado a nivel top-level en `docker-compose.yml`, hubiera fallado `docker compose config`).
- **Task 2 (publish helper):** `app/services/realtime_publish.py`, `publish_event()` best-effort (nunca lanza, todo swallowed+logged). Revisión limpia, test de fallo de Redis confirmado no-vacuo.
- **Task 3 (connection manager):** `app/realtime/manager.py`, `ConnectionManager` con tope de 500 conexiones (guardia contra DoS ya que `/api/ws` no tiene rate limiting propio). Revisión limpia.
- **Task 4 (WS endpoint + subscriber):** `app/routers/realtime.py` (auth por primer mensaje, nunca query string; `ALLOWED_TOKEN_TYPES = ("colaborador",)`; cierre 1013 al tope de conexiones; cierre 4001 en cualquier falla de auth) + `app/realtime/redis_bridge.py` (subscriber con loop de reconexión real). Revisión de seguridad exhaustiva: los 8 puntos verificados de forma independiente (no solo confiados del reporte), incluyendo que el canal/URL de Redis coincide carácter por carácter entre publisher y subscriber. El implementador detectó y corrigió correctamente un artefacto obsoleto del propio brief (línea de import de ejemplo incluía un router `push` que ya no existe tras descartar esa feature) — se corrigió también el texto del plan para no repetir el error en el futuro.
- **Incidente de proceso, ya resuelto:** el primer implementador (Task 1) trabajó por defecto en un worktree aislado propio distinto al de este plan — detectado, el commit se rescató con `cherry-pick` a la rama correcta, y los dispatches siguientes incluyeron instrucción explícita de `cd` a la ruta exacta del worktree del plan, sin que volviera a pasar.

**Sin pendientes reales abiertos de Tasks 1-4** — 2 hallazgos Minor quedaron en el ledger como aceptados (fix de volumen no pedido pero correcto; reconnect loop de Redis no cierra el cliente viejo antes de reintentar, mismo patrón que el propio brief).

### Pendiente para la próxima sesión

1. **Continuar `subagent-driven-development` desde Task 5** (de 8) del plan `docs/superpowers/plans/2026-08-04-realtime-sync.md`:
   - Task 5: wire `publish_event` en los 7 endpoints mutantes (avistamiento crear/eliminar, evento crear/eliminar, especie crear/actualizar/eliminar) + 8 tests.
   - Task 6: `RealtimeProvider` mobile (reconexión exponencial + resync).
   - Task 7: wiring de las 3 pantallas (`SightingsScreen`/`EventsScreen`/`CatalogScreen`) + extracción de `realtimeMerge.js` a funciones puras con test.
   - Review final de rama completa (modelo más capaz).
   - Retomar reentrando al worktree existente: `.claude/worktrees/realtime-sync` (rama `worktree-realtime-sync`) — **no crear uno nuevo**, ya tiene Tasks 1-4 commiteadas. Ledger completo en `.superpowers/sdd/2026-08-04-realtime-sync/progress.md` dentro de ese worktree.
2. **Task 8 (deploy a producción)** — explícitamente pendiente de aprobación separada del usuario antes de tocar los droplets reales, incluso después de que Tasks 5-7 estén listas y revisadas. No asumir luz verde automática.
3. ~~**Especial — explorar si el Redis ya agregado en Task 1 puede resolver también el bug ya documentado de rate limiting duplicado por réplica.**~~ ✅ **RESUELTO 2026-08-04** — ver sección siguiente.

---

## Sesión 2026-08-04 (continuación) — Tasks 5-7 + revisión final + rate limiting sobre Redis + Task 8 (deploy real a producción)

### Tasks 5-7 vía `subagent-driven-development`, continuando desde Task 4

Retomado el worktree existente (`worktree-realtime-sync`), sin recrear nada. Cada task con implementador + review independiente, fix loops normales.

- **Task 5** (wire `publish_event` en 7 endpoints mutantes): implementador hizo 3 cambios fuera del brief literal — `EspecieUpdate.id_estado_conservacion` pasó de requerido a opcional (siguiendo el propio test del brief), parsing de fecha/hora en `crear_evento`, seed de `Estatus` en `conftest.py`. Reviewer marcó el primero como Important-plan-mandated (riesgo real de pérdida de datos — cualquier caller que omita el campo ahora borraría el estado de conservación silenciosamente). Presentado al usuario: eligió mantenerlo requerido. Revertido + test corregido, fix loop 1/1, limpio. Los otros 2 cambios confirmados como fixes legítimos de bugs latentes (SQLite vs Postgres), aceptados.
- **Task 6** (`RealtimeProvider` móvil): implementación calzó con el brief carácter por carácter. Reviewer encontró un Important real: el timer de reconexión pendiente (`setTimeout`) nunca se guardaba ni limpiaba — un logout→login rápido podía dejar un socket duplicado sin rastrear. Fix loop 1/1, limpio.
- **Task 7** (wiring de 3 pantallas + `realtimeMerge.js`): spec compliant, sin desviaciones. Único hallazgo (ausencia de `.catch()` en los nuevos `.then()`) confirmado como literal del brief y consistente con el patrón ya existente en esos mismos archivos — usuario confirmó dejarlo así, parked sin fix.

### Review final de rama completa (opus) — 1 Critical + 4 Important + 1 Minor + 1 defecto de plan, todos bugs de integración cruzada invisibles para cualquier review por task

1. **Critical — `avistamiento_deleted` no hacía nada en otros dispositivos.** `SightingsScreen.js` normaliza ids a string (`String(a.id)`), pero el handler de delete pasaba el id numérico crudo del payload a `removeById`, que compara con `!==` estricto — `"5" !== 5` siempre verdadero, nunca se borraba nada. Invisible en el dispositivo que hace el borrado (usa refetch local), solo se manifestaba en *otros* dispositivos — exactamente el feature que se estaba construyendo. Fix de una línea + test de regresión con ids string.
2. **Important — socket rechazado (4001/1013) reseteaba el backoff y disparaba un resync storm, por siempre, a 1 Hz.** El endpoint WS acepta la conexión (`accept()`) antes de validar auth, así que `onopen` del cliente disparaba igual aunque el servidor fuera a rechazar. Cada 8 horas (expiración de JWT), cada cliente conectado entraba en un loop infinito de reconexión a 1 segundo, cada iteración disparando un resync que dispara refetch en 3 pantallas — ~180 peticiones/min contra un límite de `slowapi` de 100/min por IP. Fix: servidor manda un frame explícito `{"type":"auth_ok"}` solo tras éxito real de auth; cliente mueve el reset de backoff y el disparo de resync de `onopen` a ese mensaje específico.
3. **Important — actualizaciones en tiempo real ignoraban el filtro "Míos" en 2 pantallas.** `EventsScreen` era el peor caso — no es que le faltara el filtro, es que el handler en tiempo real reemplazaba la lista ya filtrada por la lista completa sin filtrar. Fix: `EventsScreen` espeja el patrón del efecto de foco (`getEventosMine` vs `getEventos` según el toggle); `SightingsScreen` usa guard-and-merge (salta el merge si "Míos" está activo y el email del evento no coincide con el del usuario logueado).
4. **Important — payload de `avistamiento_created` omitía `latitud`/`longitud`/`foto_url`**, violando la propia regla del plan (el payload debe bastar para reconstruir todo lo que la pantalla muestra) — las tarjetas merged mostraban "Sin coordenadas" hasta el siguiente refetch. Fix: agregados los 3 campos al payload.
5. **Important — `publish_event` hacía una llamada Redis síncrona bloqueante en el event loop async, sin timeout.** Un Redis "agujero negro" (partición de red, contenedor colgado) podía bloquear el event loop de uvicorn entero, no solo la mutación — convirtiendo un problema de Redis en una caída total de la API. Fix: `socket_connect_timeout=2, socket_timeout=2`.
6. **Minor + defecto de plan:** comentario engañoso en `realtime.py` sobre un keepalive del cliente que no existe; línea 1193 del plan afirmaba que `getEventos()` no tiene variante filtrada (falso — `getEventosMine` ya existía y ya se usaba en la misma pantalla), y encima instruía no corregir esa asimetría — corregido el texto del plan también.

Fix wave único (los 6 items + corrección del plan) + re-review acotado: los 7 hallazgos verificados `ADDRESSED`, sin breakage nuevo. Commit `7fb7257` en el worktree.

### Rate limiting migrado a Redis compartido (el pendiente especial de arriba)

Investigado y confirmado: `slowapi`/`limits` soporta Redis nativamente con el mismo paquete `redis` ya agregado en Task 1, namespacing de claves limpio (`LIMITS:*`, sin colisión con el canal `sway:events`). Implementado en `app/security/rate_limit.py` con `storage_options` (timeouts) e `in_memory_fallback_enabled=True`.

**Primer intento (`swallow_errors=True`) reveló un bug real de `slowapi`:** swallowea la excepción de conexión pero nunca fija `request.state.view_rate_limit`, y el middleware lo lee sin chequear después — crashea cada request con `AttributeError` apenas Redis no responde, exactamente lo opuesto a fail-open. Corregido usando `in_memory_fallback_enabled` en su lugar, que sí sigue el flujo normal.

**Probado en vivo, dos veces:** (1) 2 réplicas locales reales en puertos distintos compartiendo un Redis real — intento 6 de login da `429` correcto pese a que cada réplica solo recibió 3 peticiones (imposible con contadores aislados); clave Redis compartida confirmada con conteo 6. (2) Redis matado a mitad de ejecución — sin 500s, requests se siguen sirviendo (limitación conocida y aceptada: el fallback es una lista global única, no por ruta, así que durante un corte el límite específico de `/login` se afloja al default global).

Commit `ea26b13` en el worktree.

### Bug real encontrado durante testing local end-to-end — subscriber de Redis nunca arrancaba

Al levantar el stack completo localmente (2 réplicas + Redis + Postgres reales vía `docker compose`, no mockeado) para probar el relay cross-replica antes de tocar producción, **cero eventos llegaban a ninguno de los 2 clientes WS** pese a que el POST devolvía 200 y `publish_event` no tiraba ningún error. Log de ambas réplicas mostraba, justo al arrancar: `Task was destroyed but it is pending!` sobre la task de `start_subscriber()`.

**Causa raíz:** `asyncio.create_task(start_subscriber())` en `app/main.py` no guardaba el objeto `Task` retornado — el event loop de asyncio solo mantiene una referencia débil, así que sin ninguna referencia propia el garbage collector la recolectaba antes de que corriera su primer `await`. La review final ya había marcado este patrón como un riesgo (M2) pero lo daba por poco probable, asumiendo que la task solía estar suspendida dentro de `pubsub.listen()` — en la práctica nunca llegaba tan lejos. Ninguna prueba automatizada lo detectó porque ninguna ejercita dos procesos reales corriendo en paralelo durante tiempo real — solo un test end-to-end contra la app real corriendo lo hubiera atrapado, y por eso se insistió en probar así antes de tocar producción.

**Fix:** guardar la referencia en `app.state.realtime_subscriber_task`. Re-probado en vivo localmente: ambas réplicas reciben el evento correctamente. Commit `da40857` en el worktree.

**Hallazgo colateral durante el testing local:** el Postgres local reusado (contenedor de sesiones anteriores) no tenía la columna `foto_url` en `avistamientos` — schema drift preexistente de la feature de fotos (sesión 2026-08-01), sin relación con esta rama. Corregido solo en la BD local de desarrollo (`ALTER TABLE`), no en producción (que sí tiene la columna, verificado).

### Merge a `master` + fix adicional de validación de inputs (fuera del plan, pedido aparte por el usuario)

Antes del merge, el usuario pidió una auditoría rápida de validación de inputs en toda la API (pregunta directa: "¿algún endpoint acepta tipo de dato incorrecto?"). Encontrados y corregidos 4 gaps reales, directo en `master` (no en el worktree): `NewsletterSuscripcion.email`/`ContactoMensaje.email`/`DonacionCreate.contact_email` eran `str` planos en vez de `EmailStr`; `AvistamientoCreate.email_usuario` (usado por mobile) igual; `años_experiencia` aceptaba no-dígitos; `fecha_evento`/`hora_inicio`/`hora_fin` de eventos solo validaban longitud, no formato real. 8 tests nuevos (`test/test_input_validation.py`). Efecto colateral encontrado al arreglar el último: un bug preexistente en el handler 422 de `app/main.py` — crasheaba con `TypeError` al serializar un `ValueError` crudo que Pydantic v2 mete en `ctx` cuando un `field_validator` falla (afectaba a *cualquier* validador futuro, no solo estos). Corregido con `jsonable_encoder`. Commit `581e1e9` en `master`.

Merge no fast-forward (`master` había avanzado con el fix de validación mientras el worktree seguía su curso) — auto-merge limpio en los 2 archivos que ambas ramas tocaban (`app/main.py`, `app/routers/estadisticas.py`), 46/46 tests tras el merge. Commit `f5f984b`.

### Task 8 — deploy real a producción, supervisado en vivo, todos los pasos verificados con evidencia real

Ejecutado con el usuario mirando en vivo y aprobando cada acción real contra producción (varias quedaron bloqueadas por el clasificador de modo automático — SSH/curl mutando producción — aprobadas una por una en el momento).

- **RAM del droplet privado verificada antes de desplegar** (`free -h`): 1.0GB disponible, muy por encima del umbral de aborto (~150MB). 8 contenedores corriendo antes, Redis sería el 9no.
- **Droplet privado:** `git pull` + rebuild de `redis`/`api1`/`api2`. Sin warnings de `Task was destroyed`, sin tracebacks, Redis con `ping` `True` desde ambas réplicas.
- **Droplet público — restart de HAProxy para el `timeout tunnel`.** Config validada con `haproxy -c` antes del restart (conectado a la red real `sway_edge_network` para que resolviera los hostnames de los backends). Restart ejecutado, los 4 servicios (web1, portal, docs de la API, endpoint real de la API) confirmados `200` inmediatamente después — sin daño colateral del par de segundos de caída total.
- **Endpoint WS confirmado con upgrade real** (`101 Switching Protocols`) a través del dominio público con TLS real.
- **Relay cross-replica confirmado en producción real** — cuenta de colaborador de prueba registrada real, JWT real, 2 clientes WS conectados directo a `api1`/`api2` (bypaseando HAProxy, vía la VPC), POST real vía el dominio público. Primer intento dio falso negativo por un error propio (background de SSH sin `nohup`, el listener moría al cerrarse la sesión SSH) — corregido corriendo todo en una sola sesión SSH continua, ambas réplicas confirmaron recepción del evento con el payload enriquecido intacto.
- **Idle-timeout confirmado en producción real** — conexión autenticada sobrevivió 50s de inactividad (el límite viejo de HAProxy era 30s).
- **Limpieza post-verificación:** cuenta de colaborador de prueba desactivada vía `DELETE /api/colaboradores/perfil`, archivos temporales de prueba borrados de ambos droplets.
- **Documentación:** nueva sección 15 en `docs/PI_REQUIREMENTS_VERIFICATION.md` (funcionalidad más allá de los 14 puntos originales de la rúbrica), con los comandos reales de verificación y el bug del subscriber documentado como hallazgo real de la sesión.

**Estado final:** feature de realtime sync (WebSocket + Redis) corriendo en producción real, verificada extremo a extremo con evidencia reproducible en cada paso — no "debería funcionar", sino confirmado funcionando.

### Continuación misma sesión — re-corrida de la suite PI, simulación de carga sobre rate limiting, y bug real encontrado en testing manual de la app

- **Suite `scripts/verify_pi_requirements.sh` corrida de nuevo contra producción real, post-deploy de Task 8.** Resultado limpio: **26 pass, 0 fail, 1 skip** (mobile UX, manual por diseño) — sin regresiones tras el deploy del feature de realtime sync.
- **Simulación de ráfaga de carga (~DDoS) sobre el rate limiting, 300 peticiones concurrentes reales contra `POST /api/colaboradores/login` en producción.** Diseñada con cuidado antes de ejecutar (droplet privado de solo 1.9GB RAM, usuarios reales podrían estar usando el sistema): sanity check con 20 peticiones primero, luego escalado a 300. Resultado: 288/300 con `429` correcto, 0 logins filtrados, los 9 contenedores del droplet privado confirmados sanos (`docker stats` inmediatamente después — CPU/memoria de vuelta a niveles base, `sway_redis` en 11MiB de 64MiB). Los 12 restantes fueron timeouts de conexión/lectura del lado del cliente (apertura simultánea de 300 conexiones TLS nuevas desde una sola máquina), confirmado no relacionado con el servidor (`maxconn 4096` en HAProxy muy por encima de 300, logs de HAProxy sin rechazos en la ventana de la prueba). Documentado en `docs/PI_REQUIREMENTS_VERIFICATION.md` sección 5, reemplazando el párrafo de "limitación conocida/fix pendiente" que ya no aplicaba desde el fix de Redis compartido de esta misma sesión.
- **Doc `docs/DEPLOYMENT_2_DROPLETS.md` actualizado** — el conteo de contenedores esperados en el droplet privado (línea de verificación del runbook original) pasó de 8 a 9 para incluir `redis`, con nota de por qué se agregó y cuándo.

### Bug real reportado por el usuario en testing manual — Eventos: el selector de fecha solo permite año 1969, únicamente en iOS

Reportado durante uso real de la app (no encontrado por ningún test automatizado). Investigación por descarte, sin poder reproducir directamente (sin dispositivo/simulador iOS disponible en este entorno):

- Comparados los 2 usos de `DateField` para fecha "principal" en la app: `SightingsScreen.js` (funciona bien) siempre pasa `maximumDate={new Date()}` real (tiene sentido — no se puede reportar un avistamiento futuro); `EventsScreen.js` (roto) nunca pasa `maximumDate` (también correcto por diseño — los eventos son a futuro, no debe limitarse a "hoy").
- Confirmado con el usuario, por eliminación: el bug es específico de iOS (Android funciona bien) y específico de Eventos (Avistamientos funciona bien) — descartado que sea bundle de Metro viejo (usuario confirmó reload reciente) o problema de reloj del dispositivo (si fuera reloj del sistema, ambas pantallas fallarían igual, comparten el mismo componente).
- **Causa raíz identificada:** en `DateField.js`, el prop `maximumDate` se pasaba siempre como `maximumDate={maximumDate}` al `<DateTimePicker>` nativo, incluso cuando su valor era `undefined` — esto deja la llave del prop presente en el objeto de props aunque el valor sea `undefined`, distinto de nunca incluir la llave. Es un patrón de bug documentado en `@react-native-community/datetimepicker` específicamente en iOS: el puente nativo de iOS puede tratar un `maximumDate` presente-pero-undefined como una fecha real cercana al epoch Unix (~1969/1970) en vez de "sin límite" — el puente de Android maneja el mismo caso sin problema, lo que explica por qué es exclusivo de iOS.
- **Fix aplicado:** `DateField.js` ahora usa spread condicional (`{...(maximumDate ? { maximumDate } : {})}`) para que la llave del prop nunca llegue al componente nativo cuando el caller no la provee. **No verificado en dispositivo real todavía** — sin iOS disponible en este entorno, pendiente de confirmación del usuario antes de dar el bug por cerrado.

### Bug reportado en paralelo — foto de avistamiento no sobrevive reload / otros clientes no ven la imagen real (investigado, no reproducible en el deploy actual)

Investigación completa de la cadena de la feature de foto (sesión 2026-08-01): disco compartido entre `api1`/`api2` confirmado real (`docker inspect`, mismo volumen `sway_uploads_data` en ambos), endpoint `POST /avistamientos/{id}/foto` revisado línea por línea (guarda archivo + `db.commit()` correcto), columna `foto_url` confirmada en el schema real de producción, ambos endpoints GET (`/api/avistamientos` y `/api/colaboradores/avistamientos`) confirmados incluyendo `foto_url` en su respuesta, mapeo `mapAvistamientoFromApi` en el cliente móvil confirmado consistente en los 5 call-sites que lo usan (fetch inicial, toggle Míos, tras crear, merge de tiempo real, resync).

**Verificación en vivo con datos frescos:** mientras se investigaba, el usuario subió una foto real desde la app (avistamiento id 25) — confirmado en producción real: archivo en disco, `foto_url` en la fila de la BD, presente en la respuesta de `GET /api/avistamientos`, la URL final sirve la imagen real (`200`, `image/jpeg`, tamaño correcto) sin necesitar ningún header de autenticación (el mount estático `/api/uploads` no pasa por el gate de `x-api-key`, a diferencia del resto de la API — esto es correcto por diseño, la imagen debe ser públicamente visible). **Usuario confirmó que esa misma tarjeta (id 25) sí muestra la foto correctamente tras recargar la app.**

**Conclusión:** no se encontró ni reprodujo ningún bug real contra el código/deploy actual — toda la cadena (disco compartido → BD → GET → URL pública → cliente móvil) fue verificada funcionando de punta a punta con datos reales creados en el momento. El reporte original probablemente correspondía a una prueba hecha antes de que terminara el rebuild de `api1`/`api2` de Task 8, o a una carrera con el upload todavía en curso. Sin cambios de código — nada que corregir con la evidencia disponible.

### Nuevos pendientes (reportados por el usuario, NO implementados todavía — solo registrados)

1. **Registro de colaborador — feedback de validación genérico, no dice qué falta.** Al fallar la validación, la app solo muestra "Completa todos los campos necesarios" sin indicar cuál(es) campo(s) específico(s) faltan o están mal. Pedido: agregar `*` visible en cada campo obligatorio del formulario, y feedback visual real (no solo un alert genérico) señalando el/los campo(s) con error.
2. **Crear especie — mismo patrón de feedback genérico.** El formulario indica correctamente que algo falló ("Error al crear especie") pero no da ninguna pista de qué salió mal específicamente.

Ambos quedan como pendientes explícitos para una sesión futura — no se tocó código para esto en la sesión actual, a pedido directo del usuario.

3. **Bug — logro "Colaborador Aprobado" se dispara en cada login, no solo la primera vez.** Reportado por el usuario en testing manual. Probable causa (no investigada todavía): la lógica de desbloqueo de logros en `GamificationContext` probablemente no persiste el estado "ya visto"/"ya desbloqueado" de este logro específico entre sesiones, o la condición de chequeo se re-evalúa como verdadera en cada login en vez de solo la primera vez que el colaborador queda aprobado. Sin investigar todavía — solo registrado.

4. **Feature request — navegación por gestos estilo iOS nativo, junto al navbar de botones existente.** Pedido explícito del usuario: diseñar (con skill `ui-ux-pro-max`) e implementar un plan para gestos tipo iOS (swipe-back en bordes, swipe entre tabs) sin reemplazar el bottom-tab navbar actual. **Solo exploración inicial hecha, sin diseño ni plan todavía** — usuario pidió detener y solo guardar como pendiente.
   - Estructura real de navegación confirmada (`src/navigation/AppNavigator.js`): `createBottomTabNavigator` (5 tabs: Home/Catalog/Sightings/Events/Profile) anidado dentro de `createNativeStackNavigator` (maneja Notifications/MisAsistencias como pantallas empujadas, más el flujo de login/forgot-password separado).
   - **Dato relevante para cuando se retome:** `native-stack` ya envuelve `UINavigationController` nativo en iOS — el swipe-back en el borde para volver de Notifications/MisAsistencias probablemente **ya funciona gratis** sin código adicional; falta confirmar en dispositivo. El gap real es **swipe entre tabs**, que `bottom-tabs` no trae de fábrica.
   - `@react-navigation/material-top-tabs` (`^7.6.6`) ya está en `package.json` pero **no se usa en ningún lado del código** — dependencia instalada sin wiring, candidato natural para el swipe-entre-tabs si se decide usarla.
   - `react-native-gesture-handler` y `react-native-reanimated` — **no confirmados instalados** (chequeo interrumpido antes de terminar); `material-top-tabs` y cualquier gesto custom fluido normalmente los requieren como peer dependencies. Verificar esto es el primer paso real al retomar.

---

## Sesión 2026-08-04 (continuación 2) — Auditoría exhaustiva de validación de inputs (4 agentes paralelos), fixes reales, bug de logros v2, deploy completo, simulación de ataques

### A — Fixes rápidos de los pendientes registrados ayer (#1, #2 del bloque anterior)

- **Pendiente #3 de ayer (logro "Colaborador Aprobado" repetido) investigado con `systematic-debugging`.** Causa raíz real: `GamificationContext.js` reseteaba `counters` a `seed` en cada logout, lo que también borraba `prevUnlocked.current` (ref de insignias ya vistas) en la práctica — el siguiente login veía el badge "aprobado" como recién desbloqueado y volvía a celebrar. Extraída la lógica pura a `src/context/gamificationBadges.js` (`diffUnlockedBadges`), testeada con `node assert` (4 casos: primer login, logout no debe celebrar, re-login no debe re-celebrar, unlock real sí debe celebrar). Wireado en el context — fix v1 completo y testeado.
- **Pendientes #1/#2 (feedback genérico en registro de colaborador y crear especie)** resueltos vía 2 agentes `caveman:cavecrew-builder` en paralelo:
  - Registro: `validateRegisterForm()` cambia de devolver un solo string a un objeto `{campo: mensaje}`; `LoginScreen.js` ahora muestra asterisco en campos obligatorios + error inline por campo (incluye los duplicate-checks de email/cédula/orcid, que antes solo mostraban un alert genérico).
  - Crear especie: investigado — `buildErrorResult()` en `client.js` **ya parseaba** el detalle 422 de FastAPI campo por campo (no era un gap real, solo faltaban los asteriscos visuales). Agente correctamente redujo el alcance a solo agregar `*` en los labels obligatorios, sin tocar lo que ya funcionaba.

### B — Auditoría de validación de inputs, 3 agentes `Explore` en paralelo, solo lectura

A pedido del usuario, sin tocar código: verificar client+server validation y feedback de error en **todas** las pantallas mobile con formularios. Hallazgos reales priorizados:

**Alto (seguridad/integridad de datos):**
1. Avistamiento lat/lon sin bounds server-side.
2. Foto de avistamiento: content-type spoofable (servidor solo confiaba en el header, no en los bytes reales).
3. `terminos_aceptados` en crear evento — solo client-side, sin campo equivalente en el modelo backend.
4. `contacto` (email) en evento anónimo — validado solo cliente, se vuelve `Usuario.email` real sin validar formato server-side. **Excluido explícitamente por el usuario de esta ronda de fixes.**
5. `ForgotPasswordScreen` — completamente falso (alert de éxito sin backend, sin llamada a API, sin endpoint en ningún lado del código).
6. Login (3 endpoints: colaboradores/user/auth) usan `str` en vez de `EmailStr`.

**Medio:** foto de avistamiento — mensaje real del servidor descartado, se mostraba un string genérico hardcodeado; perfil profesional (años_experiencia/cédula/orcid) validado solo cliente en `PUT /perfil`; `id_tipo_evento`/`id_modalidad` sin chequeo de existencia (500 crudo en vez de 400 limpio); `fecha_avistamiento` sin validador de formato server-side.

**Minor:** `imagen_url` sin validación de formato; filtros de Reportes sin mensaje explícito "sin resultados"; `horaFin` no validado contra `horaInicio`.

Decisión del usuario sobre `ForgotPasswordScreen`: no construir backend real (ya decidido en sesión previa) — en cambio, cambiar el copy para no prometer un email que nunca llega.

### C — Fix de los gaps encontrados (excepto #4), 2 agentes en paralelo, todo verificado directo por el controlador (no solo confiado del reporte)

**Backend (`Backend-API-Specialist`, 7 fixes en `app/models/`+`app/routers/`):**
1. `latitud`/`longitud` con `Field(ge=-90,le=90)`/`Field(ge=-180,le=180)`.
2. Magic-number real (bytes `\xff\xd8\xff` / `\x89PNG...`) antes de aceptar una foto, además del check de `Content-Type` existente.
3. `terminos_aceptados: bool` agregado a `EventoCreate`, rechazado con 400 si no es `True`.
4. `EmailStr` en `ColaboradorLogin`, `UserLogin`, `AuthLogin`.
5. Revalidación server-side de perfil profesional (rango años_experiencia, patrón cédula 7-8 dígitos, patrón ORCID) en `PUT /perfil`.
6. `id_tipo_evento`/`id_modalidad` verificados contra la tabla real antes de insertar — 400 limpio en vez de 500 crudo.
7. `fecha_avistamiento` con el mismo validador de formato ISO que ya usaba `fecha_evento`.

11 tests nuevos en `test_input_validation.py`, suite completa **57→58 pass** tras merge con el fix de bug real de abajo, 0 fail (excluyendo los 2 archivos de test pre-existentes rotos y ya documentados, sin relación).

**Frontend (`caveman:cavecrew-builder`, 6 fixes en pantallas mobile):**
1. `ForgotPasswordScreen` — copy honesto ("contacta a un administrador"), sin llamada a API.
2. Foto de avistamiento — usa `fotoResult.message` real en vez de string genérico.
3. `imagen_url` — validación de formato `http(s)://` antes de enviar.
4. Reportes Global — distingue "sin datos" de "ningún resultado con estos filtros".
5. `horaFin <= horaInicio` — rechazado client-side antes de enviar.
6. `terminos_aceptados: eventForm.terminos` agregado al payload de `crearEvento` — coordinado en vivo con el agente de backend vía `SendMessage` para confirmar el nombre exacto del campo nuevo (coincidió con el adivinado).

Ambos verificados por el controlador leyendo el diff real (no solo el reporte del agente) antes de darlos por buenos — confirmado que `buildErrorResult`/asteriscos/estilos coinciden con el patrón ya existente en cada archivo.

### D — Feature: KPIs de Perfil en tiempo real (brainstorming corto → implementación directa, sin plan/SDD)

Usuario preguntó si los 3 KPIs de `ProfileScreen` (avistamientos/especies/eventos míos) podían wirearse a WebSocket como ya hacen Sightings/Events/Catalog — antes solo se fetcheaban una vez al montar. Brainstorming corto (una pregunta: refetch completo vs incremento local — usuario eligió refetch completo, mismo patrón ya usado en las otras 3 pantallas, evita los bugs de drift que esta misma sesión ya encontró en gamification). Evaluado explícitamente como "small change, no SDD" antes de ejecutar (1 archivo, patrón 3x ya probado, sin decisiones de diseño nuevas). Dispatch directo a `caveman:cavecrew-builder`, verificado por el controlador vía `git diff` — las 3 funciones de fetch extraídas y reusadas, un solo `useEffect` nuevo con `subscribe()`, sin lógica de ownership por payload (según lo pedido).

### E — Bug real reportado por el usuario en testing manual: overflow de `poblacion_estimada` al crear especie

Screenshot real del error crudo de Postgres (`psycopg.errors.NumericValueOutOfRange`) mostrando el SQL completo y los parámetros del formulario en un Alert. `systematic-debugging` completo:
- **Causa raíz #1:** `poblacion_estimada` tenía `ge=0` pero sin `le=` — cualquier entero de Python pasaba Pydantic, pero la columna real es `Integer` de Postgres (máx. 2,147,483,647). Fix: `le=2147483647` en `EspecieCreate` y `EspecieUpdate` (mismo gap en ambos, confirmado por el audit de la sección B). TDD real: test que reproduce el valor exacto del screenshot, confirmado en rojo primero (200 en vez de 422 — SQLite del test suite no tiene el límite de 32 bits que sí tiene Postgres, así que el bug solo se manifestaba contra el backend real), luego verde tras el fix.
- **Causa raíz #2, encontrada pero NO corregida todavía en esta sesión (solo diagnosticada y confirmada como sistémica):** el `except Exception as e: raise HTTPException(status_code=500, detail=str(e))` en `especies.py` filtra el string crudo de la excepción (incluye el SQL fallido completo) al cliente. Grep reveló el mismo patrón en **49 sitios** de 8 routers distintos (`especies`, `productos`, `pedidos`, `eventos`, `estadisticas`, `colaboradores`, `catalogos`, `direcciones`) — no es un bug puntual, es un patrón repetido en toda la API.

Usuario decidió explícitamente arreglarlo (no solo documentarlo) antes de desplegar, en un solo pase junto con el resto. Evaluado como "small change, no SDD" (patrón mecánico repetido, sin decisiones de diseño más allá del mensaje genérico y el helper compartido).

### F — Fix del error leak sistémico (agente `Backend-API-Specialist`, verificado directo)

`app/services/errors.py` nuevo con `safe_500(e, context)` — loguea `print(f"Error en {context}: {e}")` server-side (mismo estilo ya usado en el codebase, sin introducir el módulo `logging`), devuelve al cliente `detail="Ocurrió un error al procesar la solicitud."` genérico. Los 49 sitios (el agente re-grepeó y confirmó 49, no 48 como decía el brief inicial — números de línea habían cambiado por los fixes de la sección C) reemplazados. 2 sitios (`productos.py::get_productos`, `pedidos.py::crear_pedido`) mantuvieron su `print` con traceback completo en vez de pasar por `safe_500` — decisión del agente, justificada (diagnóstico server-side más rico, comportamiento client-facing idéntico), aceptada sin cambios. Verificado por el controlador: `grep detail=str(e)` → 0 resultados, `grep safe_500(` → 47 (más los 2 con traceback propio = 49 reales). Suite completa: **58 pass, 0 fail**, confirmado independientemente por el controlador (no solo el reporte del agente).

### G — Bug de logros v2: la fix de la sección A no cubría el reload de la app

Usuario probó en Expo Go (sesión ya logueada, solo recargar la app) y el popup de "Colaborador Aprobado" seguía apareciendo. `systematic-debugging` de nuevo:
- **Causa raíz:** al recargar la app con un token ya persistido, `isLoggedIn` se pone `true` *antes* de que el `Promise.all` de `GamificationContext` resuelva — el primer render de `badges` usa los datos `seed` (placeholder, todo bloqueado) mientras `isLoggedIn` ya es `true`. El efecto de diff de insignias corre sobre ese render falso y consume el "primera vez, no celebres" (el `prevUnlocked.current === null` inicial) con datos falsos. Cuando el fetch real resuelve un instante después y `approved` pasa a `true`, parece un desbloqueo nuevo genuino → celebra otra vez.
- **Fix:** guard `if (counters === seed) return;` al inicio del efecto de diff — comparación por identidad de referencia (el objeto `seed` es el mismo tanto en el estado inicial como en el reset de logout), así ningún render con datos placeholder participa nunca del baseline/diff.
- **No verificado en dispositivo real** (sin simulador en este entorno) — pendiente de que el usuario confirme recargando Expo Go con una cuenta aprobada.

### H — Commit, push, deploy real a ambos droplets con rebuild

29 archivos (26 modificados + 3 nuevos: `gamificationBadges.js`/`.test.js`, `app/services/errors.py`) commiteados (`cf83568`) y pusheados a `origin/master`. Confirmado antes de mergear que local y `origin/master` estaban exactamente sincronizados (sin riesgo de diverger).

Deploy real a ambos droplets, confirmado explícitamente con el usuario antes de tocar producción (pull-only vs pull+rebuild — usuario eligió pull+rebuild):
- Público: `git pull` (trajo también un commit de ayer que nunca se había desplegado ahí). Sin rebuild necesario (no corre código de la API).
- Privado: RAM verificada antes (996Mi disponibles), `git pull`, `docker compose -f docker-compose.private.yml up -d --build api1 api2` — rebuild real, contenedores recreados y confirmados `Up` sin errores.

### I — Suite PI extendida (sección 15 nueva) + simulación de ataques reales contra prod

- **`scripts/verify_pi_requirements.sh` ganó una sección 15** cubriendo en vivo, sin autenticación, los fixes de hoy: latitud fuera de rango, fecha de avistamiento malformada, evento sin aceptar términos, `tipo_evento` inexistente (confirma 400 limpio, no 500 crudo), login con email malformado. Corrida completa post-deploy: **31 pass, 0 fail, 1 skip** (mobile manual, sin cambios).
- **Simulación de ataques reales** (cuenta de colaborador temporal, creada y eliminada al final, contra `https://proyecto-sway.site` real): overflow de `poblacion_estimada` (bloqueado, 422), cédula/ORCID/años_experiencia malformados en `PUT /perfil` (bloqueados, 422), **inyección SQL real** en `nombre_comun` (`Robert'); DROP TABLE especies;--`) — guardado como texto literal, tabla intacta, confirma que el ORM parametriza correctamente y no hay vector de inyección; creación de especie sin token (401); JWT forjado con firma inválida (401); foto con `Content-Type: image/jpeg` pero bytes de texto plano (bloqueada, 400, magic-number real); foto con bytes JPEG reales (aceptada, confirma que el fix no rompió el caso válido). Todo limpiado después (especie, avistamiento, colaborador y usuario de prueba borrados vía SQL directo).
- **Simulación de saturación/DDoS**, repetida post-redeploy de hoy (ya se había hecho una vez en la sesión anterior, antes del rebuild): 300 requests concurrentes reales contra `/api/colaboradores/login`. Primer intento con bash lanzando 300 procesos `curl` en background localmente falló (solo 12 completaron, límite del entorno Git Bash/Windows, no del servidor) — repetido con un script Python (`ThreadPoolExecutor`, 100 workers) para una medición confiable: **300/300 bloqueados con 429** (mejor que el 288/300 de la vez anterior — el rate limiting compartido por Redis, ya fijado en sesión previa, sigue funcionando después del rebuild de hoy, sin ninguna filtración esta vez). Contenedores confirmados sanos después (`docker stats`, sin picos, `sway_postgres` healthy), endpoint legítimo confirmado respondiendo 200 inmediatamente después (usuarios reales no afectados).

### Pendientes reales al cierre de esta sesión

1. **Verificar en dispositivo real que el fix v2 del bug de logros (sección G) funciona** — recargar Expo Go con una cuenta ya aprobada y confirmar que el popup no vuelve a aparecer.
2. **`contacto` (email) en creación de evento anónimo sin `EmailStr` server-side** — gap real encontrado en la sección B, excluido explícitamente por el usuario de esta ronda de fixes. Sigue pendiente.
3. **Reportar resultados de esta sesión y guardar con `/ecc:save-session`** — en curso al momento de escribir este registro.
   - Nada implementado, ningún archivo tocado — pendiente de diseño (skill `ui-ux-pro-max`) + plan + implementación completos.
