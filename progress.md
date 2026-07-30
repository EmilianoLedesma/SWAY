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
3. **Walkthrough real en dispositivo — parcial, no completo.** Durante la discusión posterior al cierre de las 3 features SÍ se probaron varias cosas en dispositivo real (cambio de contraseña, desactivación de cuenta, apertura del tab Reportes) y eso fue justo lo que sacó a la luz los bugs #5/#6 de abajo. Lo que sigue sin probarse en dispositivo real: el flujo completo de biometric login (enable → force-close → reopen → desbloqueo), y el registro de colaborador end-to-end (solo se verificó el contrato del backend vía curl).
~~4. **Avistamientos y Eventos: el submit no existe, es más profundo que Pending #1/#2 — corregido el registro de esta discrepancia.** La sesión de date-pickers (2026-07-28) había documentado Pending #1 (avistamiento necesita nombre/email de sesión) y Pending #2 (evento necesita catálogo de tipo/modalidad por ID) **asumiendo que el POST ya existía** y solo le faltaban/sobraban campos. La investigación de hoy (solo lectura, sin cambios de código) encontró que el problema es más básico: **el POST nunca se conectó, ni bien ni mal.**
   - **Avistamientos** (`SightingsScreen.js:132`, `handleReportSighting`): solo hace `setSightings(prev => [...])`, mutación de estado local — cero `fetch`/API. `client.js` no tiene ninguna función de creación de avistamiento, solo GETs (`getAvistamientosMine`, `getAvistamientosAll`).
   - **Eventos** (`EventsScreen.js`): mismo patrón — sin handler de submit ni `fetch`. `client.js` solo tiene `getEventos()` (GET).
   - **Referencia real que funciona (web1, `assets/js/eventos.js`):** `POST /api/eventos/crear` (no `/api/eventos`, que es solo listado). Payload: `{titulo, descripcion, fecha_evento, hora_inicio, hora_fin, id_tipo_evento, id_modalidad, url_evento, capacidad_maxima, costo, contacto}`. Catálogos vía `GET /api/tipos-evento` y `GET /api/modalidades` (`{success, tipos/modalidades: [{id, nombre, descripcion}]}`). Web1 no manda token de auth ni saca datos personales de sesión (`contacto` es texto libre, tampoco manda `nombre_organizador`).
   - **Decisiones tomadas hoy (acordadas, no implementadas):**
     - Avistamientos: `nombre_usuario`/`email_usuario` se sacan del usuario activo (sesión) — esto **reemplaza** a Pending #1 original, ya no es "corregir campos de un POST existente", es parte del wire completo.
     - Eventos: `nombre_organizador` (campo opcional del backend, que web1 ni siquiera manda) también se saca del usuario activo en mobile — decisión mobile-específica, diverge de web1 (que no vincula el evento a ningún usuario). Esto **extiende** a Pending #2 original (catálogo por ID sigue aplicando, más este dato de sesión).
     - Wire completo de POST para ambas vistas queda pendiente — no se implementa todavía. Cuando se retome: para eventos, replicar `POST /api/eventos/crear` + catálogos `tipos-evento`/`modalidades` (mismo endpoint que ya funciona en web1), cambiando los chips de tipo/modalidad para guardar `id` en vez del label del array hardcodeado actual (`TIPOS_EVENTO`/`MODALIDADES`); para avistamientos, crear la función de cliente que falta y sourcear identidad de sesión.
   - **Pending #1/#2 del spec de reportes-filtering quedan obsoletos como items independientes** — su contenido vive ahora dentro de este punto único.~~ ✅ **RESUELTO 2026-07-30** — plan [2026-07-30-avistamientos-eventos-post](docs/superpowers/plans/2026-07-30-avistamientos-eventos-post.md): ambos POST endpoints (`/api/reportar-avistamiento` y `/api/eventos/crear`) ahora funcionan end-to-end desde mobile (`SightingsScreen.js` y `EventsScreen.js`); backend bug encontrado y corregido (crear_evento no reconocía tokens de colaborador — `app/security/auth.py` get_optional_organizador_user, commit fa26cf1).
5. **Los filtros de Reportes no funcionan en el dispositivo real — confirmado con evidencia dura vía logs de docker.** ⚠️ **Investigado 2026-07-30, NO resuelto** — código revisado a fondo (`useEffect`, chips, `buildQuery`) sin encontrar bug; sospecha es bundle Metro viejo en el dispositivo probado, no un bug de código. Necesita retest en vivo antes de tocar código de nuevo (ver sección de sesión 2026-07-30 abajo). El tab sí se abre en el dispositivo (se ven en el log múltiples `GET /api/estados-conservacion`, `GET /api/habitats`, `GET /api/especies/estadisticas` y `GET /api/avistamientos` sin parámetros — el catálogo carga). Pero revisando **todo** el historial de `docker logs sway_api` no aparece ni un solo request con `estado=`, `habitat=`, `especie_id=`, `fecha_desde=` o `fecha_hasta=` — nunca se manda un request filtrado. No es "no se probó", es "tocar un chip no dispara el fetch esperado". Hay que diagnosticar en `ProfileScreen.js` por qué el cambio de `filtros` (Tasks 6-8) no está disparando el `useEffect` correspondiente, o por qué el chip no está actualizando el estado — antes de asumir que la feature mergeada hoy está realmente operativa.
6. ~~**"Actividad reciente" en Home es un placeholder, no datos reales**~~ — ✅ **RESUELTO 2026-07-30**, wireado a `getAvistamientosMine()` (ver sección de sesión 2026-07-30 abajo).
7. ~~**Cambio de contraseña no cierra sesión, aunque el mensaje lo promete**~~ — ✅ **RESUELTO 2026-07-30**, `handleChangePassword` ahora fuerza logout tras éxito (ver sección de sesión 2026-07-30 abajo).
8. **"¿Olvidaste tu contraseña?" es un botón muerto** — confirmado: `LoginScreen.js:522`, el `TouchableOpacity` no tiene `onPress` en absoluto. Gap de punta a punta, no solo de UI: no existe ningún endpoint de recuperación/reset de contraseña en `app/routers/` — hay que diseñar el flujo completo (probablemente token de reset vía email, o algún mecanismo alterno) antes de wirear la UI.
9. ~~**ORCID sin auto-formato en el registro**~~ — ✅ **RESUELTO 2026-07-30**, `formatOrcidInput()` wireado en el `onChangeText` (ver sección de sesión 2026-07-30 abajo).
10. **Conectar Expo Go a la API en DigitalOcean — investigación de conectividad ya hecha, falta ejecutar el paso a paso.** Hoy `API_HOST` en `client.js` se arma dinámicamente desde el `hostUri` de Metro (`devHost`, fallback `localhost:8000`), apuntando siempre al backend local (docker o uvicorn en la misma red). Verificado desde este entorno (solo lectura, sin cambios):
    - `http://165.232.146.240/docs` → 200, Swagger accesible directo por IP.
    - `http://165.232.146.240/api/estadisticas` → 200, datos reales de la BD de producción (16 especies catalogadas, distinto del conteo de la BD local de dev).
    - `http://proyecto-sway.site/` → bloqueado (403, "Web Site Blocked", SonicWall CFS marcándolo como posible phishing) **desde este sandbox** — el usuario confirmó que el dominio sí es accesible desde su teléfono, así que el bloqueo es solo de este entorno, no del dominio en sí.
    - **Plan acordado, no implementado:** hardcodear temporalmente `API_HOST` en `client.js` a `http://proyecto-sway.site` (o la IP `http://165.232.146.240` como respaldo si el dominio da problemas), con comentario claro de que es temporal para probar contra producción, y revertir a la lógica dinámica de Metro después. Queda pendiente ejecutarlo guiado paso a paso con el usuario.

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
