# Push Notifications + Realtime Sync — Design

**Date:** 2026-08-04
**Status:** Phase 2 (realtime sync) approved, plan written and reviewed, ready for execution. Phase 1 (push notifications) DROPPED 2026-08-04 — see note under "Phase 1 — Push Notifications" below.

## Motivation

Two gaps found this session while auditing "real-time" claims in the mobile app:

1. **No push infrastructure exists.** `NotificationsScreen.js` derives its list client-side from the logged-in user's own `GET` calls (`useNotifications.js`), computed once on mount. There are no stored notification rows, no device push tokens, no way to reach a user who isn't looking at the app.
2. **"Real-time" today means "fresh on next screen focus."** Every list (`SightingsScreen`, `EventsScreen`, `CatalogScreen`) uses `useFocusEffect` to refetch on navigation focus. Two devices sitting on the same screen at the same time never see each other's changes until one of them navigates away and back.

This spec originally covered both as one design with two independent implementation phases:
- **Phase 1 — Push notifications:** device token registration + a one-off manual broadcast script (no auto-triggers, no admin endpoint — confirmed explicitly with the user, single use). **Dropped 2026-08-04** — see the note under its section below; Expo Go (this project's only test environment) can't verify remote push, and adding development-build tooling was explicitly ruled out.
- **Phase 2 — Realtime sync:** WebSocket channel + Redis pub/sub so avistamientos, eventos, and especies changes propagate live to other connected devices. This is the only phase being implemented; see `docs/superpowers/plans/2026-08-04-realtime-sync.md`.

## Infra constraint driving this design

`api1`/`api2` are two separate FastAPI containers behind HAProxy (`balance roundrobin`, per-connection). There is no shared state between them today beyond Postgres. This matters for Phase 2: a client's WebSocket lands on exactly one replica; a mutation handled by the *other* replica has no way to reach it without a shared broadcast channel. Redis pub/sub is the fix (new container, phase 2 only — not reused for the already-documented rate-limiting-per-replica gap in this pass, that stays a separate pending item).

---

## Phase 1 — Push Notifications

**DROPPED (2026-08-04), after the implementation plan was written and reviewed but before execution.** Root cause: this project's only test environment is Expo Go via `npx expo start` (no EAS project, no development-build tooling, and none is being added). Expo's own documentation confirms remote push notifications have been unavailable in Expo Go on Android since SDK 53; this project pins Expo SDK `~54.0.34`. A development build (`eas build --profile development` or a local `expo run:android`/`run:ios`) would be required to verify push delivery at all, and the user explicitly ruled that out — running only via Expo Go's dev server is a hard project constraint, not a preference. Rather than ship push-notification code that can never be verified in this project's actual environment, the feature was cut entirely: the implementation plan (`docs/superpowers/plans/2026-08-04-push-notifications.md`) was deleted, and Phase 2 (below) no longer depends on it. The architecture/design content below is kept for the record, not as something to implement.

### Architecture (historical — not being implemented)

- New table `push_tokens`: `id` (PK), `id_usuario` (FK → `usuarios.id`), `expo_push_token` (text), `platform` (text: `ios`/`android`), `created_at`, `updated_at`. Unique constraint on `expo_push_token` (upsert on conflict) — one physical device token maps to at most one row, reassigned to whichever user last logged in from it.
- Mobile: `expo-notifications` added. On successful login (not on app boot — avoids prompting before the user has a session), request notification permission → get Expo push token → `POST /api/push-tokens` with the token, authenticated with the existing JWT.
- Backend: only the storage endpoint (`POST /api/push-tokens`) is new. No admin/broadcast endpoint — user explicitly wants a standalone script since the broadcast is single-use, not a recurring feature.
- Script: `scripts/send_broadcast.py`, run manually, once. Connects to Postgres directly (same SSH-tunnel-to-prod pattern already established this project — temp file for any payload with special characters, per existing session convention). Reads all rows from `push_tokens`, batches up to 100 tokens per request (Expo's documented batch limit), POSTs to `https://exp.host/--/api/v2/push/send` with a title/body passed as script arguments. Not committed with any embedded credentials — connection string via env var or CLI arg at run time.

### Data flow

Mobile login → permission prompt → Expo push token obtained → `POST /api/push-tokens` → row upserted (by `expo_push_token`, updating `id_usuario` if the device changed accounts).

Later, whenever the user wants to broadcast: `python scripts/send_broadcast.py --title "..." --body "..."` → reads `push_tokens` from Postgres (via tunnel) → calls Expo push API in batches → Expo relays to APNs/FCM → OS delivers notification to each device, independent of whether the app is open, backgrounded, or the phone is off the dev network entirely.

### Error handling

- `POST /api/push-tokens` is idempotent: same token submitted twice is a no-op update, not a duplicate row (enforced by the unique constraint + upsert).
- Script does not retry indefinitely on delivery errors. Expo's response includes per-token status (`ok`/`error`, e.g. `DeviceNotRegistered`); the script logs failures and continues — a stale/uninstalled token doesn't block the rest of the batch.
- No token stored yet (permission denied, or registration request failed) → user simply doesn't receive the broadcast. Not treated as an app error, no retry loop on the client.
- **Accepted, not fixed:** no row is removed from `push_tokens` on logout or app uninstall. A device keeps receiving future one-off broadcasts indefinitely after the user who registered it has logged out. Acceptable for a genuinely single-use script; revisit if this becomes a recurring feature.
- **Accepted, not fixed:** `expo_push_token` is trusted client input with no ownership/format validation — any authenticated user can `POST` an arbitrary string, in theory reassigning a row's `id_usuario` via the upsert if two accounts submit the same token value. No exploitable impact today since the broadcast script reads all rows undifferentiated by user, but this becomes a real account-conflation vector the moment a future phase adds per-user targeting. Flagged here so it isn't rediscovered later as a surprise.

### Testing

- pytest for `POST /api/push-tokens`: create new row, upsert same token twice (same user), upsert same token with a different `id_usuario` (verify reassignment behavior — exact rule finalized in the plan).
- Script tested against local Postgres with fake token rows inserted directly; the Expo push HTTP call itself is not exercised in automated tests (would actually send). Manual verification: one real device with a real Expo push token, script run against local DB pointed at that one row, confirm the notification arrives.

---

## Phase 2 — Realtime Sync

### Architecture

- New `redis:alpine` container added to `docker-compose.private.yml`, on the existing private network, no port published outside the compose network. Both `api1` and `api2` get a `REDIS_URL` env var.
- One WebSocket endpoint: `WS /api/ws`. **Auth via first-message, not query string** — the client connects, then sends `{"type": "auth", "token": "<jwt>"}` as its first frame; the server validates it with the existing JWT logic before treating the socket as authenticated, and closes it if the first frame isn't a valid auth message within a short timeout. A `?token=<jwt>` query string was the original plan but was dropped: `haproxy.cfg` has `option httplog` on the public-facing frontend, which logs the full request line including query string by default, and this project's JWTs are 8h-lived with no revocation/blacklist mechanism — a token captured in a log file would be a valid 8-hour bearer credential. First-message auth keeps the token out of any URL/log path entirely.
- **HAProxy needs a `timeout tunnel` added**, not just the existing `timeout client 30s` / `timeout server 30s`. Without it, HAProxy treats an idle WebSocket the same as an idle HTTP connection and drops it after 30s of no traffic on either leg — which would look exactly like "flaky mobile network" to the reconnect logic below, when it's actually a load-balancer config gap. Add `timeout tunnel <long value, e.g. 1h>` to `defaults` or the relevant backend, and have the mobile client send a lightweight ping frame periodically to keep the tunnel counted as active.
- Single channel, typed JSON messages: `{"type": "avistamiento_created" | "avistamiento_deleted" | "evento_created" | "evento_updated" | "evento_deleted" | "especie_created" | "especie_updated" | "especie_deleted", "payload": {...}}`. Payload shape matches the existing REST response shape for that resource (e.g. `avistamiento_created`'s payload is the same object `reportar_avistamiento` already returns) so mobile can merge it into existing state without a new mapper. **`especie_deleted` is included explicitly** — `DELETE /api/especies/{especie_id}` exists in `app/routers/especies.py`, and by this spec's own scope rule (every create/update/delete touching these 3 resources) it must publish too, or a deleted especie would keep showing live on other devices until their next focus-refetch.
- On each of the mutating REST endpoints already in the codebase (`reportar_avistamiento`, `crear_evento`, `eliminar_evento`, `crear_especie`, `actualizar_especie`, `DELETE /api/especies/{especie_id}`, and any other create/update/delete touching these 3 resources), the handler publishes the typed message to a Redis channel **after** the DB commit succeeds (never before — a rollback must not have already announced the change).
- Each API replica runs a background subscriber task on the same Redis channel; on receipt, it relays the message to every WebSocket currently connected to *that* replica. This is what makes cross-replica delivery work — Device A's write handled by `api1` still reaches Device B's socket connected to `api2`, via Redis as the shared relay. **The subscriber task itself needs a reconnect loop** — if its Redis connection drops (Redis restart, brief network blip between the API and Redis containers) and it doesn't reconnect, that replica's sockets stay open and look healthy to their clients (no close code, no error surfaced anywhere) but silently stop receiving any events until the API process itself restarts. This is worse than a visible failure, so the subscriber must retry with backoff and log when it's down, not fail silent.

### Mobile integration

- New hook `useRealtimeSync`, socket opened once at the top level (inside `AuthProvider`, after login, closed on logout) rather than per-screen — avoids reconnect churn from screen navigation.
- `SightingsScreen`, `EventsScreen`, `CatalogScreen` each subscribe to the event types they care about and merge incoming items into their existing local state (prepend/remove/update by id), same shape REST already returns.
- Reconnect on unexpected drop with exponential backoff (mobile networks flap constantly — confirmed pattern needed from this session's SSH/network debugging). Socket failure is silently non-fatal: existing `useFocusEffect` refetch remains as-is and still fires on screen focus, so a broken socket degrades to today's behavior, never breaks the screen.
- **Reconnect triggers a one-time refetch, not just future messages.** Redis pub/sub has no replay or persistence — anything published while a socket was disconnected is gone permanently once it reconnects, and a plain reconnect only resumes *future* messages. Without this, the realistic failure mode is: user sits on `EventsScreen`, network flaps for 20s, socket reconnects fine, screen never regains focus during that window, and the user silently never learns what changed — reintroducing the exact staleness bug Phase 2 exists to fix. So `useRealtimeSync` must fire a resync (either a lightweight refetch of the current screen's data, or a lighter "you may be stale, refetch if you care" signal) on every successful reconnect, independent of navigation focus.

### Error handling

- Redis unreachable at publish time: wrapped in try/except in the backend, logged, and does **not** fail the REST mutation — the write to Postgres already succeeded and is the source of truth; realtime delivery is best-effort only (same non-blocking principle already used for photo upload not blocking avistamiento creation in an earlier session).
- Socket auth failure (bad/expired JWT) vs. network drop are handled differently on the client: auth failure does not trigger a reconnect loop (would hammer the server with a token that will never become valid mid-session); network drop does retry with backoff.

### Testing

- pytest per mutating endpoint: mock the Redis publish call, assert it's invoked with the correct `type`/`payload` after a successful create/update/delete, and assert it's **not** invoked when the underlying DB operation fails/rolls back.
- Cross-replica delivery (the actual point of Redis) cannot be meaningfully unit-tested — requires two running API containers + Redis + two socket clients. This is called out in the plan as a manual verification step, same category as the existing HAProxy traffic-split verification already in `scripts/verify_pi_requirements.sh`.

---

## Explicitly out of scope (this spec)

- Auto-triggered push notifications (new event created, RSVP reminders, avistamiento activity) — user confirmed manual-only for now.
- Admin/authenticated broadcast endpoint — user confirmed standalone one-off script instead.
- Reusing Redis for the already-documented per-replica rate-limiting gap — separate pending item, not bundled into this work even though the same technology would fix both.
- Realtime sync for the push-notification inbox itself (`NotificationsScreen`) — user did not select this in scoping; it continues to use its existing on-mount fetch.
