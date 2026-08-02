# Event Attendance (RSVP) — Design

**Date:** 2026-08-01
**Status:** Approved, ready for implementation plan

## Problem

`RegistroEvento` exists in the schema (`id_evento`, `id_usuario`, `fecha_registro`, `asistio`) but nothing in the app ever writes to it — no endpoint, no client function, no UI. "Voluntario activo" and "Primer evento" badges were redefined earlier this session to count events *organized* (`getEventosMine`) specifically because no real attendance data existed. This feature builds the real thing, so those badges revert to their originally-intended meaning.

## Decisions

- **Scope: RSVP only** (intent to attend), not a post-event attendance check-in. `asistio` stays `NULL` on every row this feature creates — it represents "signed up", not "confirmed attended". Confirming actual attendance is a separate, later feature.
- **Capacity enforced.** `capacidad_maxima` already exists on every event; RSVP is rejected once the real count of `RegistroEvento` rows for that event reaches it.
- **UI placement**: RSVP action lives in the existing event detail modal (`EventsScreen.js`), not a separate screen. The new screen is a personal list of events already RSVP'd to.
- **New screen name: "Voy a asistir"** — deliberately not "Mis Eventos", to avoid colliding with the existing "Míos" toggle (which filters events *you organized*, via `Organizador.id_usuario` — a completely different concept from events you're attending). Registered as a `Stack.Screen` (like `NotificationsScreen`), not a new bottom tab.
- **Badges revert to real attendance.** "Voluntario activo" (goal 3) and "Primer evento" (goal 1) switch their data source from `getEventosMine()` (organized) to the new `getMisEventosRegistrados()` (attended). Organizing an event no longer moves these badges — attending one does.
- **Bundled UI fix** (unrelated to attendance, requested alongside): the entire event card becomes tappable to open the detail modal, replacing the separate "Ver" button.

## Architecture

### 1. Backend — `app/routers/eventos.py`

- `POST /api/eventos/{evento_id}/registrar` — `Depends(get_current_colaborador)` (same auth bar as `DELETE /api/eventos/{id}`, not the optional/anonymous dependency `crear_evento` uses — RSVP requires a real logged-in colaborador). Checks, in order: event exists (`404` if not) → not already registered by this user for this event (`400`, "Ya confirmaste tu asistencia a este evento") → real registered count for this event `< capacidad_maxima` (`400`, "Cupo lleno" if not). Inserts `RegistroEvento(id_evento, id_usuario, fecha_registro=now(), asistio=None)`.
- `DELETE /api/eventos/{evento_id}/registrar` — same auth. Deletes the current user's `RegistroEvento` row for that event; `404` if none exists.
- `GET /api/eventos/mis-registros` — same auth. Same response shape as `GET /api/eventos` (reuses the existing mapping/joins), filtered to events the current user has a `RegistroEvento` row for.
- `GET /api/eventos` (existing) gains a `registrados` field per event — a count of `RegistroEvento` rows for that event, computed alongside the existing joins. Powers the "12/30" capacity display and the full/not-full state client-side.

### 2. Mobile client — `client.js`

- `registrarAsistencia(eventoId)` → `POST`, returns `{success, message?}`.
- `cancelarAsistencia(eventoId)` → `DELETE`, returns `{success, message?}`.
- `getMisEventosRegistrados()` → `GET`, returns `{success, eventos}` (same shape `getEventos`/`getEventosMine` already return).

### 3. `EventsScreen.js`

- Detail modal gains an "Asistiré" button when the viewed event is `UPCOMING` and the user isn't already registered for it, or "Cancelar asistencia" if they are. Registration state determined by fetching `getMisEventosRegistrados()` alongside the main events list (same `useFocusEffect` already added this session) and checking event-id membership.
- `incrementEventAttended()` (already exists in `GamificationContext`, name was already correct) moves from `handleCreateEvent`'s success path to the RSVP success path — organizing no longer credits this counter, attending does.
- A small "Voy a asistir" link added near the existing "Míos" filter chip, navigating to the new screen.

### 4. New `MisAsistenciasScreen.js` ("Voy a asistir")

- Fetches `getMisEventosRegistrados()` on focus, renders using the same card visual pattern as `EventsScreen.js` (tap-to-open-detail, per the bundled UI fix), with a "Cancelar asistencia" action per card instead of "Eliminar".
- Registered in `AppNavigator.js` as a `Stack.Screen`, reached via the new link in `EventsScreen.js`.

### 5. `GamificationContext.js`

- Replace the `getEventosMine()` call in the real-data-seeding effect with `getMisEventosRegistrados()`. Counter renamed `eventsOrganized` → `eventsAttended` for clarity (it was already semantically "attended" in the badge labels, just wired to the wrong source).

## Error handling

- RSVP: already registered → `400`; capacity full → `400`; event not found → `404`; not logged in → `401`.
- Cancel: not registered → `404`; not logged in → `401`.
- Mobile: `Alert.alert` on any failure (existing app-wide pattern), refetch registration state + event list on success.

## Testing

- Backend: `pytest` covering the 3 new endpoints — auth required, duplicate RSVP rejected, capacity enforced (register up to the cap, confirm the next one is rejected), cancel works, `mis-registros` returns exactly the right set. Uses the shared `test/conftest.py` engine already established this session.
- Mobile: manual Expo Go verification only — no automated screen-level tests exist anywhere in this repo (established pattern all session).

## Out of scope

- Confirming actual attendance (`asistio` flipping to `true`) — a real post-event check-in feature, separate from this.
- Organizer-side attendee list/management.
- Waitlisting once an event is full.
