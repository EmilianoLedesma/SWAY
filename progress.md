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

1. **Commitear `HomeScreen.js` y `CatalogScreen.js`** (sesión A, ver arriba) — siguen sin commit en `master` ahora mismo.
2. **3 worktrees `agent-a*` obsoletos** (mismo commit `56dfd7f`, sucios solo en `.claude/settings.local.json`, uno con `MockupsSwayMobile/` sin trackear) — nunca se limpiaron, probablemente scratch de alguna herramienta de tareas. Investigar y podar.
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
5. **Los filtros de Reportes no funcionan en el dispositivo real — confirmado con evidencia dura vía logs de docker.** El tab sí se abre en el dispositivo (se ven en el log múltiples `GET /api/estados-conservacion`, `GET /api/habitats`, `GET /api/especies/estadisticas` y `GET /api/avistamientos` sin parámetros — el catálogo carga). Pero revisando **todo** el historial de `docker logs sway_api` no aparece ni un solo request con `estado=`, `habitat=`, `especie_id=`, `fecha_desde=` o `fecha_hasta=` — nunca se manda un request filtrado. No es "no se probó", es "tocar un chip no dispara el fetch esperado". Hay que diagnosticar en `ProfileScreen.js` por qué el cambio de `filtros` (Tasks 6-8) no está disparando el `useEffect` correspondiente, o por qué el chip no está actualizando el estado — antes de asumir que la feature mergeada hoy está realmente operativa.
6. **"Actividad reciente" en Home es un placeholder, no datos reales** — reportado por el usuario. No muestra últimos eventos/avistamientos reales del colaborador, es contenido de mockup fijo. Necesita wiring real contra el backend (probablemente `getAvistamientosMine()`/`getEventos()` ya existentes en `client.js`, ordenados por fecha).
7. **Cambio de contraseña no cierra sesión, aunque el mensaje lo promete** — confirmado (investigado, no arreglado): `handleChangePassword` en `ProfileScreen.js` (~línea 374-387), en su rama de éxito, solo limpia el form y muestra `Alert.alert('Contraseña actualizada', 'Vuelve a iniciar sesión.')` — nunca llama `logout()`/`setIsLoggedIn(false)`. Comparar con `handleDeactivate` (línea ~405-413), que sí hace `await logout(); setIsLoggedIn(false);` correctamente tras éxito. Fix trivial cuando se retome: agregar esas dos líneas al final de la rama de éxito de `handleChangePassword`. (El flujo en sí funciona — se confirmó vía log de Postgres un `UPDATE usuarios SET password_hash=...` real; el bug es solo la falta de logout forzado.)
8. **"¿Olvidaste tu contraseña?" es un botón muerto** — confirmado: `LoginScreen.js:522`, el `TouchableOpacity` no tiene `onPress` en absoluto. Gap de punta a punta, no solo de UI: no existe ningún endpoint de recuperación/reset de contraseña en `app/routers/` — hay que diseñar el flujo completo (probablemente token de reset vía email, o algún mecanismo alterno) antes de wirear la UI.
9. **ORCID sin auto-formato en el registro** — la validación de formato ya existe y funciona (ver "Lo que funcionó bien" abajo); lo que falta es la UX: que conforme se escriban los dígitos, el campo se vaya acomodando solo al patrón `0000-0000-0000-0000` (auto-insertar guiones), en vez de exigir que el usuario los escriba manualmente. Es un `onChangeText` con máscara sobre el `TextInput` de ORCID en `LoginScreen.js` (sección de registro).
10. **Conectar Expo Go a la API en DigitalOcean — investigación de conectividad ya hecha, falta ejecutar el paso a paso.** Hoy `API_HOST` en `client.js` se arma dinámicamente desde el `hostUri` de Metro (`devHost`, fallback `localhost:8000`), apuntando siempre al backend local (docker o uvicorn en la misma red). Verificado desde este entorno (solo lectura, sin cambios):
    - `http://165.232.146.240/docs` → 200, Swagger accesible directo por IP.
    - `http://165.232.146.240/api/estadisticas` → 200, datos reales de la BD de producción (16 especies catalogadas, distinto del conteo de la BD local de dev).
    - `http://proyecto-sway.site/` → bloqueado (403, "Web Site Blocked", SonicWall CFS marcándolo como posible phishing) **desde este sandbox** — el usuario confirmó que el dominio sí es accesible desde su teléfono, así que el bloqueo es solo de este entorno, no del dominio en sí.
    - **Plan acordado, no implementado:** hardcodear temporalmente `API_HOST` en `client.js` a `http://proyecto-sway.site` (o la IP `http://165.232.146.240` como respaldo si el dominio da problemas), con comentario claro de que es temporal para probar contra producción, y revertir a la lógica dinámica de Metro después. Queda pendiente ejecutarlo guiado paso a paso con el usuario.

## Lo que funcionó bien hoy

- **3 worktrees en paralelo sobre el mismo checkout, sin colisión real** — cada sesión aisló su trabajo, git resolvió los conflictos de merge (todos aditivos: líneas de import) sin perder nada de ninguna de las 3 features.
- El patrón `brainstorming → spec → plan → subagent-driven-development → review final` se usó de punta a punta en las 3 sesiones, con reviews reales que encontraron bugs genuinos (no solo trámite) en las 3.
- **Desactivación de cuenta (soft-delete) confirmada funcionando en producción real** — usuario creó cuenta "Juan Rulfo" (`usuarios.id=39`), la eliminó desde la app, verificado vía `psql`: `usuarios.activo=f`, `colaboradores.activo=f`, `estado_solicitud=inactivo`. Soft-delete correcto, no borra la fila.
- **Correo de bienvenida al registrar colaborador (SMTP roto, ver investigación anterior) no es un bug** — confirmado por el usuario: por diseño, esa notificación es exclusiva de web, la app mobile no debería mandarla. Descartado de pendientes.
- **Validación de formato de ORCID confirmada correcta** — `collaboratorValidation.js:9`, `ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/` (formato ORCID real, último carácter dígito o X). Campo opcional respetado (`validateOrcid` retorna `null` si está vacío), pero si se llena, exige el patrón exacto. Wireado correctamente: `LoginScreen.js:136` llama `validateRegisterForm()` en el submit del registro, que incluye esta validación. No es un pendiente — solo falta la UX de auto-formato mientras se escribe (ver pendiente #9).
