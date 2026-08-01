# Sighting Photo Upload, Persist & Share — Design

**Date:** 2026-08-01
**Status:** Approved, ready for implementation plan

## Problem

`SightingsScreen.js` already lets a user capture a photo via camera (`expo-image-picker`, `fotoUri` field, `Con foto` toggle) when reporting a sighting. That photo is currently local-only and ephemeral — it's held in component state and discarded once the form closes. It's never sent to the backend, never shown in the sightings list/detail, and never included when a sighting is shared via `ShareCard.js` (which today renders text-only and is captured as a PNG via `react-native-view-shot`'s `captureRef`).

This design wires the photo through: upload, persist, display in list, and include in the share card.

## Decisions

- **Persist to backend**, not local-device-only. Other users viewing the same sighting should see the photo, and it must survive app reinstall.
- **Storage: local disk on the private droplet**, not DigitalOcean Spaces. No extra monthly cost, fits the project's existing infra (no other object storage in use).
- **Upload timing: two-step**, not a single multipart request folded into sighting creation. `POST /api/reportar-avistamiento` stays JSON, unchanged for the common case (photo is optional — the "Con foto" toggle already exists). A new, separate `POST /api/avistamientos/{id}/foto` handles the photo, only exercised when one exists. If the photo upload fails, the sighting itself is already safely saved — user can retry just the photo.
- **List/detail view also shows a thumbnail**, not just the share card.
- **Binary storage, not base64.** Bytes go from camera file → `FormData` multipart → `UploadFile` → written straight to disk. DB stores only the resulting URL string. Base64 would only be justified if the image needed to travel embedded inside a JSON payload — nothing in this flow needs that, and it costs ~33% size bloat for no benefit.

## Architecture

### 1. Data model

Add nullable `foto_url` (`Text`) column to `avistamientos` (`app/data/models.py`, `Avistamiento` class). Applied via raw `ALTER TABLE` over SSH against the real DB — this project has no migration framework (Alembic etc.), schema changes are manual SQL, consistent with prior sessions.

Stores a relative path, e.g. `/api/uploads/avistamientos/{uuid}.jpg` — never raw image bytes.

### 2. Storage — shared volume across both API replicas

`docker-compose.private.yml` runs two API containers (`api1`, `api2`), load-balanced round-robin by HAProxy for all `/api` traffic (`haproxy.cfg:23,30,40-41`). If each container wrote to its own local filesystem, a photo saved via `api1` would 404 roughly half the time when a later request happens to hit `api2`.

Fix: define one named Docker volume (e.g. `uploads_data`) and mount it at the same path (e.g. `/app/uploads`) in **both** `api1` and `api2` service blocks. Both containers run on the same droplet, so this is free and requires no object storage — just a shared mount. This is the same class of bug as the earlier per-replica rate-limit issue (documented in `docs/PI_REQUIREMENTS_VERIFICATION.md`), caught here before it ships.

### 3. Backend endpoint

New `POST /api/avistamientos/{id}/foto` in `app/routers/estadisticas.py`, alongside the existing `DELETE /api/avistamientos/{avistamiento_id}`.

- Multipart `UploadFile` param.
- **Auth required**: `Depends(get_current_colaborador)` — same dependency the delete endpoint already uses. (Creating a sighting stays anonymous-allowed as today; attaching/overwriting a photo on any sighting requires a real session.)
- Validation: `content_type` must be `image/jpeg` or `image/png` → else `400`. Size cap 5MB, enforced server-side even though the client already compresses to `quality: 0.7` — this is a trust boundary, never rely on client-side limits alone. Oversize → `413`.
- Filename generated server-side (`uuid4().hex + extension`) — never trust the client-supplied filename.
- Writes bytes to `/app/uploads/avistamientos/{generated_name}` on the shared volume, sets `avistamiento.foto_url`, commits.
- Write failure → `500`; the sighting row itself is untouched either way.

### 4. Static serving

FastAPI `StaticFiles` mounted at `/api/uploads` in `app/main.py`, pointing at the same shared volume path used above. HAProxy already routes every `/api`-prefixed path to `api_back` (`haproxy.cfg:23,30`) — no HAProxy config change needed, and since the volume is shared, either replica can correctly serve any file.

### 5. Mobile upload flow

`client.js`: new `uploadAvistamientoFoto(id, fotoUri)` — builds `FormData` with the file at `fotoUri` (real device file path, read as binary, not base64), POSTs multipart to the new endpoint.

`SightingsScreen.js`: after `reportar-avistamiento` succeeds, if `sightingForm.fotoUri` is set, immediately call `uploadAvistamientoFoto(newId, fotoUri)`. On failure, non-blocking toast ("avistamiento guardado, foto no se pudo subir") — do not roll back or block on the sighting, which already saved successfully.

**Required backend response change**: `reportar-avistamiento` currently returns only `{"success": True, "message": ...}` (`estadisticas.py:197`) — no id. Must add `"id": nuevo_avistamiento.id` to that response so the mobile client has something to attach the photo to.

### 6. Mobile display

- **List/detail card** (`SightingsScreen.js` render item): if `foto_url` present, render a fixed-size `<Image>` thumbnail (e.g. 60×60, `resizeMode: 'cover'`) alongside the existing text content.
- **`ShareCard.js`**: add optional `photoUrl` prop. When present, render an `<Image>` inside the card (in place of, or alongside, the existing icon circle); falls back to the current icon-only look when absent. No changes needed to the share mechanism itself — `captureRef` already composites whatever the card renders into the shared PNG.

### 7. Error handling

- Upload: bad content-type → `400`; oversize → `413`; missing/invalid auth → `401` (existing dependency behavior); disk write failure → `500`.
- Display: broken or missing image URL → `<Image>`'s `onError` swaps to a placeholder icon rather than a broken-image glyph or crash.

### 8. Testing

One `pytest` for the new endpoint, matching existing test conventions: requires auth, rejects wrong content-type, accepts a valid JPEG, sets `foto_url` correctly. No new mobile automated tests — this codebase has none at the screen level; screen-level verification has been manual/live-device throughout prior sessions, and this follows that pattern.

## Out of scope

- Deleting/replacing an existing photo (re-uploading just overwrites `foto_url` and orphans the old file on disk — acceptable for now, cleanup not addressed here).
- Multiple photos per sighting (one `foto_url` column, single photo).
- Image resizing/thumbnailing server-side (client already downsamples via `quality: 0.7`; no server-side variant generation).
