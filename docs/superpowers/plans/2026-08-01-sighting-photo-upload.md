# Sighting Photo Upload, Persist & Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a sighting photo captured on-device survive past the form, persist to the backend, show as a thumbnail in the sightings list/detail, and appear inside the existing share-card image.

**Architecture:** Two-step flow — sighting creation stays JSON as today; a new small multipart endpoint attaches a photo afterward. Files land on a Docker volume shared by both API replicas (so either one can serve any file), referenced from Postgres only by URL string. Mobile reads the local camera file as binary and posts it as-is (no base64).

**Tech Stack:** FastAPI (`UploadFile`, `StaticFiles`), SQLAlchemy, PostgreSQL (manual `ALTER TABLE`, no migration framework in this repo), React Native / Expo (`FormData`, `Image`), `react-native-view-shot` (already used for share-card capture, untouched).

## Global Constraints

- Photo persists to the backend (not local-device-only) — spec decision.
- Storage is local disk on the private droplet via a **shared Docker volume** across `api1`/`api2` — HAProxy round-robins `/api` between them (`haproxy.cfg:23,30,40-41`), so per-container disk would 404 intermittently.
- Upload is **two-step**: `POST /api/reportar-avistamiento` (JSON) stays as-is; new `POST /api/avistamientos/{id}/foto` (multipart) attaches the photo. Sighting creation must never fail because of a photo problem.
- New photo-attach endpoint requires auth via `get_current_colaborador` — same dependency the existing `DELETE /api/avistamientos/{id}` uses (`app/routers/estadisticas.py:209`).
- Content-type allow-list: `image/jpeg`, `image/png` only → else `400`. Size cap 5MB enforced server-side → else `413`. Server generates the filename (`uuid4().hex`); never trust the client's filename.
- Binary storage throughout — camera file → `FormData` → `UploadFile` → raw bytes to disk. DB stores only the URL string. No base64 anywhere in this flow.
- List/detail view shows a thumbnail, not just the share card (explicit user decision during brainstorming).
- Out of scope: replacing/deleting an existing photo (re-upload just overwrites `foto_url`, orphaned file on disk is acceptable), multiple photos per sighting, server-side image resizing.

---

### Task 1: `foto_url` column + read/write wiring

**Files:**
- Modify: `app/data/models.py:327-339` (`Avistamiento` class — add column)
- Modify: `app/routers/estadisticas.py:85-133` (`get_avistamientos` — add field to response dict)
- Modify: `app/routers/estadisticas.py:149-203` (`reportar_avistamiento` — return new `id`)
- Modify: `app/routers/colaboradores.py:453-491` (`get_colaborador_avistamientos` — add field to response dict)
- Test: `test/test_avistamiento_foto_url.py` (new)

**Interfaces:**
- Produces: `Avistamiento.foto_url` (nullable `Text` column, `None` until Task 2's endpoint sets it). Both avistamiento-list endpoints (`GET /api/avistamientos`, `GET /api/colaboradores/avistamientos`) include `"foto_url"` in each item. `POST /api/reportar-avistamiento` response gains `"id"` (int) alongside existing `"success"`/`"message"`.
- Consumes: nothing new — pure additive wiring to existing model/endpoints.

- [ ] **Step 1: Write the failing test**

Create `test/test_avistamiento_foto_url.py`:

```python
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.data.database import get_db, Base
from app.security.api_key import require_api_key
from app.data.models import EstadoConservacion, Especie

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_api_key] = lambda: True

client = TestClient(app)


def _seed_especie():
    db = TestSession()
    estado = EstadoConservacion(nombre="En Peligro")
    db.add(estado)
    db.commit()
    especie = Especie(nombre_comun="Tortuga", nombre_cientifico="Chelonia mydas",
                       id_estado_conservacion=estado.id)
    db.add(especie)
    db.commit()
    especie_id = especie.id
    db.close()
    return especie_id


def test_reportar_avistamiento_returns_id_and_foto_url_starts_null():
    especie_id = _seed_especie()
    payload = {
        "id_especie": especie_id,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 10.5,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "foto.test@demo-sway.com",
        "notas": "prueba",
    }
    resp = client.post("/api/reportar-avistamiento", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["id"], int)

    listado = client.get("/api/avistamientos")
    assert listado.status_code == 200
    items = listado.json()["avistamientos"]
    creado = next(i for i in items if i["id"] == body["id"])
    assert creado["foto_url"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest test/test_avistamiento_foto_url.py -v`
Expected: FAIL — `KeyError: 'id'` (response has no `id` yet) or `KeyError: 'foto_url'`.

- [ ] **Step 3: Add the column to the model**

In `app/data/models.py`, inside `class Avistamiento(Base):` (around line 335, right after `id_usuario`):

```python
    id_usuario = Column(Integer, ForeignKey("usuarios.id"))
    foto_url = Column(Text, nullable=True)
```

- [ ] **Step 4: Return `id` from `reportar_avistamiento`**

In `app/routers/estadisticas.py`, replace line 197:

```python
        return {"success": True, "message": "Avistamiento reportado exitosamente"}
```

with:

```python
        return {"success": True, "message": "Avistamiento reportado exitosamente", "id": nuevo_avistamiento.id}
```

- [ ] **Step 5: Include `foto_url` in `get_avistamientos`**

In `app/routers/estadisticas.py`, inside the loop building the response (around line 117-126), add the field:

```python
            avistamientos.append({
                "id": avistamiento.id,
                "fecha": avistamiento.fecha.isoformat() if avistamiento.fecha else None,
                "latitud": float(avistamiento.latitud) if avistamiento.latitud else None,
                "longitud": float(avistamiento.longitud) if avistamiento.longitud else None,
                "notas": avistamiento.notas,
                "especie_nombre": especie.nombre_comun,
                "especie_cientifica": especie.nombre_cientifico,
                "email_usuario": usuario.email,
                "foto_url": avistamiento.foto_url
            })
```

- [ ] **Step 6: Include `foto_url` in `get_colaborador_avistamientos`**

In `app/routers/colaboradores.py`, inside its response loop (around line 474-484):

```python
            avistamientos.append({
                "id": avistamiento.id,
                "fecha": avistamiento.fecha.isoformat() if avistamiento.fecha else None,
                "latitud": float(avistamiento.latitud) if avistamiento.latitud else None,
                "longitud": float(avistamiento.longitud) if avistamiento.longitud else None,
                "notas": avistamiento.notas,
                "especie_nombre": especie.nombre_comun,
                "especie_cientifica": especie.nombre_cientifico,
                "reportado_por": nombre_completo or None,
                "email_usuario": usuario.email,
                "foto_url": avistamiento.foto_url
            })
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pytest test/test_avistamiento_foto_url.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/data/models.py app/routers/estadisticas.py app/routers/colaboradores.py test/test_avistamiento_foto_url.py
git commit -m "feat: add foto_url column to avistamientos, wire into list/create endpoints"
```

- [ ] **Step 9: Record the production migration (manual, not automated)**

This repo has no migration framework — schema changes are applied by hand over SSH, same pattern as prior sessions. Once this task is merged, run against the real production DB (do not run automatically, this is a deployment step for whoever ships this):

```bash
ssh -i ~/.ssh/sway_deploy root@<private-droplet-ip> \
  "docker exec -i sway_postgres psql -U sway_app -d sway -c \"ALTER TABLE avistamientos ADD COLUMN foto_url TEXT;\""
```

---

### Task 2: Photo upload endpoint + shared storage

**Files:**
- Create: `app/config.py`
- Modify: `app/main.py` (mount static file serving)
- Modify: `app/routers/estadisticas.py` (new endpoint)
- Modify: `requirements.txt` (add `python-multipart`, required by FastAPI for `UploadFile`/form parsing — not currently listed)
- Modify: `docker-compose.private.yml:21-59` (`api1`/`api2` — shared named volume)
- Modify: `.gitignore` (ignore local `uploads/` dir used by dev/test runs)
- Test: `test/test_subir_foto_avistamiento.py` (new)

**Interfaces:**
- Consumes: `Avistamiento.foto_url` column, `get_db`, `get_current_colaborador` (all from Task 1 / existing `app/security/auth.py`).
- Produces: `POST /api/avistamientos/{avistamiento_id}/foto` (multipart, field name `foto`, requires `Authorization: Bearer <token>`) → `{"success": true, "foto_url": "/api/uploads/avistamientos/<uuid>.<ext>"}`. Files served back at `GET /api/uploads/avistamientos/<filename>` (no auth — same trust level as the API key already embedded client-side, per spec). `app.config.UPLOAD_DIR` / `AVISTAMIENTOS_UPLOAD_DIR` — shared constants used by both the mount and the endpoint so they always agree on the path.

- [ ] **Step 1: Write the failing test**

Create `test/test_subir_foto_avistamiento.py`:

```python
import io
import os
import shutil

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.data.database import get_db, Base
from app.security.api_key import require_api_key
from app.security.auth import get_current_colaborador
from app.data.models import EstadoConservacion, Especie, Avistamiento, Usuario

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_api_key] = lambda: True
app.dependency_overrides[get_current_colaborador] = lambda: {"email": "foto.test@demo-sway.com", "token_type": "colaborador"}

client = TestClient(app)


def _seed_avistamiento():
    db = TestSession()
    estado = EstadoConservacion(nombre="En Peligro")
    db.add(estado)
    db.commit()
    especie = Especie(nombre_comun="Tortuga", nombre_cientifico="Chelonia mydas",
                       id_estado_conservacion=estado.id)
    usuario = Usuario(nombre="Test", apellido_paterno="Usuario", email="foto.test@demo-sway.com", activo=True)
    db.add_all([especie, usuario])
    db.commit()
    avistamiento = Avistamiento(id_especie=especie.id, id_usuario=usuario.id, notas="prueba")
    db.add(avistamiento)
    db.commit()
    avistamiento_id = avistamiento.id
    db.close()
    return avistamiento_id


@pytest.fixture(autouse=True)
def _clean_uploads():
    from app.config import UPLOAD_DIR
    yield
    if os.path.isdir(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR)


def test_upload_requires_auth():
    app.dependency_overrides.pop(get_current_colaborador, None)
    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.jpg", b"fake-bytes", "image/jpeg")},
    )
    assert resp.status_code == 401
    app.dependency_overrides[get_current_colaborador] = lambda: {"email": "foto.test@demo-sway.com", "token_type": "colaborador"}


def test_upload_rejects_bad_content_type():
    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.txt", b"not-an-image", "text/plain")},
    )
    assert resp.status_code == 400


def test_upload_accepts_valid_jpeg_and_sets_foto_url():
    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["foto_url"].startswith("/api/uploads/avistamientos/")
    assert body["foto_url"].endswith(".jpg")

    db = TestSession()
    avistamiento = db.query(Avistamiento).filter(Avistamiento.id == avistamiento_id).first()
    assert avistamiento.foto_url == body["foto_url"]
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest test/test_subir_foto_avistamiento.py -v`
Expected: FAIL — `404 Not Found` (endpoint doesn't exist), and `ModuleNotFoundError: No module named 'app.config'`.

- [ ] **Step 3: Add `python-multipart` to requirements**

In `requirements.txt`, in the FastAPI section (after line 12 `email-validator>=2.0.0`):

```
python-multipart>=0.0.9
```

Install locally: `pip install python-multipart>=0.0.9`

- [ ] **Step 4: Create `app/config.py`**

```python
import os

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
AVISTAMIENTOS_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "avistamientos")

os.makedirs(AVISTAMIENTOS_UPLOAD_DIR, exist_ok=True)
```

`UPLOAD_DIR` defaults to a relative `uploads/` dir (resolves under the container's `/app` workdir in production, under the repo root for local dev/tests on any OS) and can be overridden via the `UPLOAD_DIR` env var. The `os.makedirs` runs once at import time so both the static mount (Step 5) and the upload endpoint (Step 6) can rely on the directory already existing.

- [ ] **Step 5: Mount static file serving in `app/main.py`**

Add import near the top (after the other `fastapi` imports, around line 11):

```python
from fastapi.staticfiles import StaticFiles
from app.config import UPLOAD_DIR
```

Add the mount after the router includes (after line 55, before `def custom_openapi():`):

```python
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
```

Note: this mount is intentionally outside `_api_key_dep` — uploaded sighting photos are served without the `x-api-key` header, matching the spec decision (React Native's `<Image>` can't easily attach custom headers, and the API key is already public/embedded client-side by design per `docs/PI_REQUIREMENTS_VERIFICATION.md`).

- [ ] **Step 6: Add the upload endpoint to `app/routers/estadisticas.py`**

Update the `fastapi` import at the top (line 1):

```python
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
```

Add near the top, after the existing imports (after line 13 `from datetime import datetime`):

```python
import uuid
from app.config import AVISTAMIENTOS_UPLOAD_DIR
from app.security.auth import get_current_colaborador

ALLOWED_FOTO_CONTENT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png"}
MAX_FOTO_SIZE = 5 * 1024 * 1024  # 5MB
```

Add the endpoint after `eliminar_avistamiento` (after line 226, before `@router.get("/reportes/especies")`):

```python
@router.post("/avistamientos/{avistamiento_id}/foto")
async def subir_foto_avistamiento(
    avistamiento_id: int,
    foto: UploadFile = File(...),
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db)
):
    try:
        avistamiento = db.query(Avistamiento).filter(Avistamiento.id == avistamiento_id).first()
        if not avistamiento:
            raise HTTPException(status_code=404, detail="Avistamiento no encontrado")

        extension = ALLOWED_FOTO_CONTENT_TYPES.get(foto.content_type)
        if not extension:
            raise HTTPException(status_code=400, detail="Formato de imagen no soportado (usa JPEG o PNG)")

        contenido = await foto.read()
        if len(contenido) > MAX_FOTO_SIZE:
            raise HTTPException(status_code=413, detail="La imagen supera el límite de 5MB")

        nombre_archivo = f"{uuid.uuid4().hex}{extension}"
        ruta_absoluta = os.path.join(AVISTAMIENTOS_UPLOAD_DIR, nombre_archivo)
        with open(ruta_absoluta, "wb") as f:
            f.write(contenido)

        avistamiento.foto_url = f"/api/uploads/avistamientos/{nombre_archivo}"
        db.commit()

        return {"success": True, "foto_url": avistamiento.foto_url}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en subir_foto_avistamiento: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

Also add `import os` to the top of `app/routers/estadisticas.py` if not already present (check line 1-14 — it currently is not imported at module level, only used inline via `from datetime import datetime as dt` locally).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pytest test/test_subir_foto_avistamiento.py -v`
Expected: PASS (all 3 tests)

Also re-run Task 1's test to make sure nothing broke:

Run: `pytest test/test_avistamiento_foto_url.py -v`
Expected: PASS

- [ ] **Step 8: Ignore local upload artifacts**

Add to `.gitignore`:

```
uploads/
```

- [ ] **Step 9: Shared volume for `api1`/`api2` in `docker-compose.private.yml`**

Add a named volume mount to both `api1` (lines 21-39) and `api2` (lines 41-59):

```yaml
  api1:
    build: .
    container_name: sway_api1
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="10.124.0.3"
    env_file:
      - path: .env
        required: false
    environment:
      DATABASE_URL: postgresql+psycopg://${DB_USER:-sway_app}:${DB_PASSWORD:-sway123}@postgres:5432/${DB_NAME:-sway}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5000,http://localhost:5173}
      UPLOAD_DIR: /app/uploads
    volumes:
      - uploads_data:/app/uploads
    ports:
      - "10.124.0.3:8001:8000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_network
      - data_network

  api2:
    build: .
    container_name: sway_api2
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="10.124.0.3"
    env_file:
      - path: .env
        required: false
    environment:
      DATABASE_URL: postgresql+psycopg://${DB_USER:-sway_app}:${DB_PASSWORD:-sway123}@postgres:5432/${DB_NAME:-sway}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5000,http://localhost:5173}
      UPLOAD_DIR: /app/uploads
    volumes:
      - uploads_data:/app/uploads
    ports:
      - "10.124.0.3:8002:8000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_network
      - data_network
```

And register the named volume in the `volumes:` block at the bottom (currently lines 155-157):

```yaml
volumes:
  postgres_data:
  prometheus_data:
  uploads_data:
```

- [ ] **Step 10: Commit**

```bash
git add app/config.py app/main.py app/routers/estadisticas.py requirements.txt docker-compose.private.yml .gitignore test/test_subir_foto_avistamiento.py
git commit -m "feat: add sighting photo upload endpoint with shared volume storage"
```

---

### Task 3: Mobile — upload client + wire into submit flow

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js` (new function)
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:39-50, 165-222` (`mapAvistamientoFromApi`, `handleReportSighting`)

**Interfaces:**
- Consumes: `POST /api/avistamientos/{id}/foto` (Task 2), `crearAvistamiento` response now including `id` (Task 1).
- Produces: `uploadAvistamientoFoto(id, fotoUri)` in `client.js` → `Promise<{success: boolean, foto_url?: string, message?: string}>`. `mapAvistamientoFromApi` now sets `hasPhoto`/`photoUrl` from real `foto_url` instead of the hardcoded `false`.

- [ ] **Step 1: Add `uploadAvistamientoFoto` to `client.js`**

Add after `crearAvistamiento` (after the block starting at line 281):

```javascript
export async function uploadAvistamientoFoto(avistamientoId, fotoUri) {
  try {
    const formData = new FormData();
    formData.append('foto', {
      uri: fotoUri,
      name: 'sighting.jpg',
      type: 'image/jpeg',
    });
    const res = await fetch(`${API_HOST}/api/avistamientos/${avistamientoId}/foto`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'x-api-key': SWAY_API_KEY },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al subir la foto');
    return data;
  } catch (error) {
    console.error('Error en uploadAvistamientoFoto:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}
```

Note: this deliberately does **not** use the `apiFetch` helper (`client.js:14-16`) — `apiFetch` sets no `Content-Type`, which is correct for `FormData` (the browser/RN runtime sets the multipart boundary automatically), but it also doesn't merge in `Authorization`, which this endpoint requires. Built manually here since it's the only multipart+auth call in the file.

- [ ] **Step 2: Import it in `SightingsScreen.js`**

Update the import on line 29:

```javascript
import { getAvistamientosAll, getAvistamientosMine, getProfile, crearAvistamiento, uploadAvistamientoFoto, deleteAvistamiento, getEspecies } from '../api/client';
```

- [ ] **Step 3: Map `foto_url` in `mapAvistamientoFromApi`**

Replace lines 39-50:

```javascript
function mapAvistamientoFromApi(a) {
  return {
    id: String(a.id),
    species: a.especie_nombre,
    reporter: a.reportado_por || a.email_usuario,
    date: a.fecha ? a.fecha.slice(0, 10) : '',
    location: a.latitud != null && a.longitud != null ? `${a.latitud}, ${a.longitud}` : 'Sin coordenadas',
    status: 'PENDING',
    notes: a.notas || '',
    hasPhoto: !!a.foto_url,
    photoUrl: a.foto_url ? `${API_HOST}${a.foto_url}` : null,
  };
}
```

This needs `API_HOST` in scope — it's already exported from `client.js` and imported below; add it to the existing import list from Step 2:

```javascript
import { API_HOST, getAvistamientosAll, getAvistamientosMine, getProfile, crearAvistamiento, uploadAvistamientoFoto, deleteAvistamiento, getEspecies } from '../api/client';
```

- [ ] **Step 4: Upload the photo after a successful sighting creation**

In `handleReportSighting` (around line 197-222), after the existing success handling and before `incrementSightings`, insert the upload call. Replace:

```javascript
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo reportar el avistamiento.');
      return;
    }
    const refreshed = await (showMineOnly ? getAvistamientosMine() : getAvistamientosAll());
    if (refreshed?.avistamientos) {
      setSightings(refreshed.avistamientos.map(mapAvistamientoFromApi));
    }
    incrementSightings(false, !!sightingForm.fotoUri);
    bumpStreak();
    setSightingForm(initialSightingForm);
    setNewModal(false);
```

with:

```javascript
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo reportar el avistamiento.');
      return;
    }
    if (sightingForm.fotoUri && result.id) {
      const fotoResult = await uploadAvistamientoFoto(result.id, sightingForm.fotoUri);
      if (!fotoResult.success) {
        Alert.alert('Avistamiento guardado', 'El avistamiento se reportó, pero la foto no se pudo subir. Puedes intentarlo de nuevo más tarde.');
      }
    }
    const refreshed = await (showMineOnly ? getAvistamientosMine() : getAvistamientosAll());
    if (refreshed?.avistamientos) {
      setSightings(refreshed.avistamientos.map(mapAvistamientoFromApi));
    }
    incrementSightings(false, !!sightingForm.fotoUri);
    bumpStreak();
    setSightingForm(initialSightingForm);
    setNewModal(false);
```

This matches the spec: sighting save is never blocked or rolled back by a photo failure, and the refreshed list fetch (which now happens after the photo upload) will pick up the new `foto_url` in the same round-trip.

- [ ] **Step 5: Manual verification (no mobile test harness in this repo)**

This repo has no screen-level automated tests (confirmed during brainstorming — `Glob` for `tests/**/*.py` under `MockupsSwayMobile` found nothing, all prior mobile verification in this project has been manual/live-device). Verify via Expo Go against a local or prod API:
1. Report a sighting with "Con foto" toggled on and a real camera capture.
2. Confirm the app doesn't error and the modal closes.
3. Check the new row exists: `curl https://proyecto-sway.site/api/avistamientos | grep foto_url` (or against your dev API) — the newest entry's `foto_url` should be a non-null `/api/uploads/avistamientos/...` path.

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/api/client.js MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "feat: upload sighting photo after creation, map foto_url from API"
```

---

### Task 4: Mobile — list thumbnail + detail modal photo

**Files:**
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:263-330` (`renderTimelineItem`)
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:437-444` (detail modal)
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js` (styles, near `cardIcon`/`detailPhoto` definitions)

**Interfaces:**
- Consumes: `item.photoUrl` / `item.hasPhoto` from Task 3's `mapAvistamientoFromApi`.
- Produces: nothing consumed elsewhere — this is purely display.

- [ ] **Step 1: Show a thumbnail in the timeline card icon slot**

In `renderTimelineItem` (around line 275-279), replace the fixed icon:

```javascript
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIcon}>
                <Ionicons name="camera" size={16} color={colors.ocean} />
              </View>
```

with:

```javascript
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIcon}>
                {item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={styles.cardThumbnail}
                    onError={() => {}}
                  />
                ) : (
                  <Ionicons name="camera" size={16} color={colors.ocean} />
                )}
              </View>
```

`onError={() => {}}` is a no-op handler — its only job is to stop RN from throwing/logging on a broken URL; the `<View style={styles.cardIcon}>` wrapper still renders (just empty) if the image fails to load, so nothing crashes.

- [ ] **Step 2: Add the `cardThumbnail` style**

Right after the existing `cardIcon` style block (around line 771-778):

```javascript
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.oceanLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbnail: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
```

- [ ] **Step 3: Show the real photo in the detail modal**

Replace the fixed icon block (lines 442-444):

```javascript
                <View style={styles.detailPhoto}>
                  <Ionicons name="camera" size={48} color={colors.oceanDark} />
                </View>
```

with:

```javascript
                <View style={styles.detailPhoto}>
                  {detailSighting.photoUrl ? (
                    <Image
                      source={{ uri: detailSighting.photoUrl }}
                      style={styles.detailPhotoImage}
                      onError={() => {}}
                    />
                  ) : (
                    <Ionicons name="camera" size={48} color={colors.oceanDark} />
                  )}
                </View>
```

- [ ] **Step 4: Add the `detailPhotoImage` style**

Right after the existing `detailPhoto` style block (around line 890-897):

```javascript
  detailPhoto: {
    height: 140,
    backgroundColor: '#dceeff',
    borderRadius: radii.r16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailPhotoImage: {
    width: '100%',
    height: '100%',
    borderRadius: radii.r16,
  },
```

- [ ] **Step 5: Manual verification**

Via Expo Go: open Avistamientos, confirm a sighting with a photo shows a real thumbnail (not the camera icon) in both the list card and its detail view; confirm a sighting without a photo still shows the camera icon in both places, with no broken-image glyph or crash.

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "feat: show sighting photo thumbnail in list and detail view"
```

---

### Task 5: Mobile — photo in `ShareCard`

**Files:**
- Modify: `MockupsSwayMobile/src/components/ShareCard.js`
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:653-665` (`ShareCard` usage in `handleShare` render)

**Interfaces:**
- Consumes: `shareTarget.photoUrl` (from Task 3's `mapAvistamientoFromApi`, already present on any `item` passed to `handleShare`).
- Produces: `ShareCard` gains an optional `photoUrl` prop; no signature change to any other prop, existing callers (if any elsewhere) keep working unchanged since it's optional.

- [ ] **Step 1: Add `Image` import and `photoUrl` prop to `ShareCard.js`**

Update line 1:

```javascript
import { View, Text, Image, StyleSheet } from 'react-native';
```

Update the function signature (line 7):

```javascript
export default function ShareCard({ icon, title, subtitle, badge, badgeColor, badgeBg, lines, photoUrl }) {
```

- [ ] **Step 2: Render the photo when present, replacing the icon circle**

Replace the icon block (lines 15-17):

```javascript
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={44} color={colors.oceanDark} />
      </View>
```

with:

```javascript
      <View style={styles.iconWrap}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photoImage} onError={() => {}} />
        ) : (
          <Ionicons name={icon} size={44} color={colors.oceanDark} />
        )}
      </View>
```

- [ ] **Step 3: Add the `photoImage` style**

After the `iconWrap` style block (lines 69-77):

```javascript
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.oceanLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
```

- [ ] **Step 4: Pass `photoUrl` from `SightingsScreen.js`**

Update the `ShareCard` usage inside `handleShare`'s render (lines 655-665):

```javascript
          <ShareCard
            icon="camera"
            title={shareTarget.species}
            photoUrl={shareTarget.photoUrl}
            lines={[
              { icon: 'calendar-outline', text: shareTarget.date },
              { icon: 'location-outline', text: shareTarget.location },
              ...(shareTarget.reporter
                ? [{ icon: 'person-outline', text: `Reportado por ${shareTarget.reporter}` }]
                : []),
            ]}
          />
```

No changes needed to `handleShare` itself or the `captureRef` call — the existing capture-and-share mechanism (`SightingsScreen.js:115-127`) composites whatever `ShareCard` renders, so once the prop is wired the photo appears in the shared PNG automatically.

- [ ] **Step 5: Manual verification**

Via Expo Go: share a sighting that has a photo, confirm the generated/shared image shows the real photo in place of the icon circle; share a sighting without a photo, confirm it still looks like today (icon circle, no visual regression).

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/components/ShareCard.js MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "feat: include sighting photo in share card"
```

---

## Deployment note (not part of any task's automated steps)

After all 5 tasks are merged, deploying this to the real droplets requires, in order:
1. Run the `ALTER TABLE avistamientos ADD COLUMN foto_url TEXT;` migration (Task 1, Step 9) against production.
2. `git pull` on the private droplet, `docker compose -f docker-compose.private.yml up -d --build api1 api2` (picks up the new `uploads_data` volume and `UPLOAD_DIR` env var).
3. No changes needed on the public droplet or HAProxy config — `/api/uploads/*` already matches the existing `path_api` ACL (`haproxy.cfg:24,30`).
