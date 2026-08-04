# Push Notifications + Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real device push notifications (one-off broadcast script) and cross-device realtime sync (avistamientos/eventos/especies) for the SWAY POO mobile app, replacing today's "only fresh on next screen focus" behavior.

**Architecture:** Phase 1 adds a `push_tokens` table + registration endpoint + standalone Python broadcast script (no auto-triggers, no admin endpoint). Phase 2 adds a Redis pub/sub channel shared by `api1`/`api2`, a single `WS /api/ws` endpoint with first-message JWT auth, and mobile-side wiring (`RealtimeProvider` + per-screen merge) with reconnect-triggers-resync. Phase 1 ships and is verified before Phase 2 starts.

**Tech Stack:** FastAPI, SQLAlchemy, Postgres, `redis-py` (sync + `redis.asyncio`), Expo/React Native (`expo-notifications`, native `WebSocket`), HAProxy.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-push-notifications-and-realtime-sync-design.md` (all decisions below trace to it).
- No auto-triggered push notifications (event-created, RSVP reminders, activity feed) — manual broadcast only.
- No admin/authenticated broadcast endpoint — broadcast is a standalone one-off script with direct Postgres access.
- WS auth is **first-message JWT**, never a `?token=` query string (HAProxy logs full request lines).
- Every mutating endpoint touching avistamientos/eventos/especies must publish its typed event, including `DELETE /api/especies/{especie_id}` (`especie_deleted`) — easy to forget, explicitly in scope.
- Realtime is best-effort: a Redis/publish/subscribe failure must never fail or roll back the underlying REST mutation.
- Follow existing patterns: routers live in `app/routers/`, Pydantic schemas in `app/models/`, SQLAlchemy models in `app/data/models.py`, tests in `test/` using the sqlite-in-memory `conftest.py` override, dependency override for `get_current_colaborador` (not real JWTs) except where a task specifically needs a real token (the WS auth tests — no dependency-injection point exists there).

---

## Phase 1 — Push Notifications

### Task 1: `push_tokens` table + SQLAlchemy model

**Files:**
- Modify: `app/data/models.py` (add `PushToken` class after `Avistamiento`, ~line 341)
- Modify: `SWAY_PostgreSQL.sql` (add `CREATE TABLE PushTokens` after `CREATE TABLE Avistamientos`, ~line 300, matching this file's existing capitalization/style)
- Test: `test/test_push_tokens.py` (created in Task 2, this task only needs the model importable)

**Interfaces:**
- Produces: `PushToken` class with columns `id`, `id_usuario`, `expo_push_token`, `platform`, `created_at`, `updated_at`. `expo_push_token` has a unique constraint.

- [ ] **Step 1: Add the SQLAlchemy model**

In `app/data/models.py`, after the `Avistamiento` class (ends around line 340, right before the blank lines leading into the next class), add:

```python
class PushToken(Base):
    __tablename__ = "push_tokens"

    id = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    expo_push_token = Column(String(255), unique=True, nullable=False, index=True)
    platform = Column(String(20), nullable=False)
    created_at = Column(TIMESTAMP)
    updated_at = Column(TIMESTAMP)

    usuario = relationship("Usuario")
```

- [ ] **Step 2: Verify the model imports cleanly**

Run: `python -c "from app.data.models import PushToken; print(PushToken.__tablename__)"`
Expected: prints `push_tokens`, no import error.

- [ ] **Step 3: Add the production schema snippet**

In `SWAY_PostgreSQL.sql`, after the `CREATE TABLE Avistamientos (...)` block (ends around line 300), add:

```sql
CREATE TABLE PushTokens (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES Usuarios(id),
    expo_push_token VARCHAR(255) NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

This is the reference schema for a fresh install. Production deploy still needs the equivalent manual `CREATE TABLE` run against the live droplet's Postgres (same manual-migration pattern already used for `avistamientos.foto_url` — documented here, executed in Task 5's deploy step, not before).

- [ ] **Step 4: Commit**

```bash
git add app/data/models.py SWAY_PostgreSQL.sql
git commit -m "feat: agrega modelo y esquema de push_tokens"
```

---

### Task 2: `POST /api/push-tokens` endpoint

**Files:**
- Create: `app/models/push.py`
- Create: `app/routers/push.py`
- Modify: `app/main.py` (register router, ~line 46-53 alongside the other `app.include_router` calls)
- Test: `test/test_push_tokens.py`

**Interfaces:**
- Consumes: `PushToken` model (Task 1), `get_current_colaborador` from `app.security.auth` (existing).
- Produces: `POST /api/push-tokens` — auth required, body `{"expo_push_token": str, "platform": "ios"|"android"}`, response `{"success": true, "id": <int>}`. Idempotent upsert keyed on `expo_push_token`.

- [ ] **Step 1: Write the failing tests**

Create `test/test_push_tokens.py`:

```python
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.data.models import Usuario
from app.security.auth import get_current_colaborador
from conftest import TestSession

client = TestClient(app)


def _seed_usuario(email):
    db = TestSession()
    usuario = Usuario(nombre="Test", apellido_paterno="User", email=email, activo=True)
    db.add(usuario)
    db.commit()
    usuario_id = usuario.id
    db.close()
    return usuario_id


def _override_user(user_id):
    app.dependency_overrides[get_current_colaborador] = lambda: {
        "sub": str(user_id), "email": "push.test@demo-sway.com", "token_type": "colaborador"
    }


def test_register_push_token_requires_auth():
    app.dependency_overrides.pop(get_current_colaborador, None)
    resp = client.post("/api/push-tokens", json={"expo_push_token": "ExponentPushToken[abc]", "platform": "ios"})
    assert resp.status_code == 401


def test_register_push_token_creates_row():
    user_id = _seed_usuario("push.create@demo-sway.com")
    _override_user(user_id)
    resp = client.post("/api/push-tokens", json={"expo_push_token": "ExponentPushToken[create1]", "platform": "ios"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["id"], int)


def test_register_push_token_upsert_same_token_same_user():
    user_id = _seed_usuario("push.upsert@demo-sway.com")
    _override_user(user_id)
    first = client.post("/api/push-tokens", json={"expo_push_token": "ExponentPushToken[upsert1]", "platform": "android"})
    second = client.post("/api/push-tokens", json={"expo_push_token": "ExponentPushToken[upsert1]", "platform": "android"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]


def test_register_push_token_reassigns_on_new_user():
    user_a = _seed_usuario("push.owner_a@demo-sway.com")
    user_b = _seed_usuario("push.owner_b@demo-sway.com")

    _override_user(user_a)
    first = client.post("/api/push-tokens", json={"expo_push_token": "ExponentPushToken[shared1]", "platform": "ios"})
    assert first.json()["success"] is True

    _override_user(user_b)
    second = client.post("/api/push-tokens", json={"expo_push_token": "ExponentPushToken[shared1]", "platform": "ios"})
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
```

This locks in the reassignment rule the spec left open: same token, different user, upserts to the new owner (same physical device, different account logged in) rather than rejecting — matches how `expo_push_token` is a device identity, not a user identity.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest test/test_push_tokens.py -v`
Expected: FAIL — `404 Not Found` (route doesn't exist yet) or `ImportError`.

- [ ] **Step 3: Write the Pydantic schema**

Create `app/models/push.py`:

```python
from pydantic import BaseModel, Field


class PushTokenRegister(BaseModel):
    expo_push_token: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(..., pattern="^(ios|android)$")
```

- [ ] **Step 4: Write the router**

Create `app/routers/push.py`:

```python
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.data.models import PushToken
from app.models.push import PushTokenRegister
from app.security.auth import get_current_colaborador

router = APIRouter(prefix="/api", tags=["push"])


@router.post("/push-tokens")
async def register_push_token(
    data: PushTokenRegister,
    current_user: dict = Depends(get_current_colaborador),
    db: Session = Depends(get_db),
):
    try:
        user_id = int(current_user["sub"])
        existing = db.query(PushToken).filter(PushToken.expo_push_token == data.expo_push_token).first()

        if existing:
            existing.id_usuario = user_id
            existing.platform = data.platform
            existing.updated_at = datetime.utcnow()
            db.commit()
            return {"success": True, "id": existing.id}

        token_row = PushToken(
            id_usuario=user_id,
            expo_push_token=data.expo_push_token,
            platform=data.platform,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(token_row)
        db.commit()
        db.refresh(token_row)
        return {"success": True, "id": token_row.id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en register_push_token: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 5: Register the router in `app/main.py`**

In `app/main.py`, add the import alongside the existing router imports (line ~15):

```python
from app.routers import auth, colaboradores, especies, productos, pedidos, eventos, estadisticas, direcciones, catalogos, push
```

And add its registration alongside the other `app.include_router(...)` calls (line ~53):

```python
app.include_router(push.router, dependencies=_api_key_dep)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest test/test_push_tokens.py -v`
Expected: PASS — 4/4.

- [ ] **Step 7: Commit**

```bash
git add app/models/push.py app/routers/push.py app/main.py test/test_push_tokens.py
git commit -m "feat: endpoint POST /api/push-tokens con upsert por token"
```

---

### Task 3: Mobile push token registration

**Files:**
- Modify: `MockupsSwayMobile/package.json` (via `npx expo install`)
- Modify: `MockupsSwayMobile/src/api/client.js` (add `registerPushToken`, near the other simple POST functions, after `deleteEspecie` around line 182-196 is a good reference point for the pattern)
- Modify: `MockupsSwayMobile/src/navigation/AppNavigator.js` (wire into the `onLogin` callback, line ~132)
- Create: `MockupsSwayMobile/src/utils/pushNotifications.js`

**Interfaces:**
- Consumes: `authHeaders()` and `apiFetch`/`API_HOST` pattern already in `client.js`.
- Produces: `registerPushToken(expoPushToken, platform)` in `client.js` (same shape as other client functions: returns `{success, ...}` or `{success:false, message}`); `requestAndRegisterPushToken()` in `pushNotifications.js` that does permission + token fetch + calls `registerPushToken`.

- [ ] **Step 1: Install expo-notifications**

Run: `cd MockupsSwayMobile && npx expo install expo-notifications`
Expected: adds `expo-notifications` to `package.json` at the version matching this project's Expo SDK (`~54.0.34`), same install pattern already used for `expo-video` this session.

- [ ] **Step 2: Add `registerPushToken` to the API client**

In `MockupsSwayMobile/src/api/client.js`, add near the other simple authenticated POST functions (after `deleteEspecie`, following the exact same try/catch/`buildErrorResult` shape used throughout the file):

```javascript
export async function registerPushToken(expoPushToken, platform) {
  try {
    const res = await fetch(`${API_HOST}/api/push-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ expo_push_token: expoPushToken, platform }),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'No se pudo registrar el dispositivo.');
    return data;
  } catch {
    return { success: false, message: 'Error de conexión al registrar el dispositivo.' };
  }
}
```

This is missing the `x-api-key` header that `apiFetch` adds — check `apiFetch`'s definition (top of `client.js`, ~line 15) and use it instead of a bare `fetch`, matching every other authenticated call in this file. Corrected version:

```javascript
export async function registerPushToken(expoPushToken, platform) {
  try {
    const res = await apiFetch(`${API_HOST}/api/push-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ expo_push_token: expoPushToken, platform }),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'No se pudo registrar el dispositivo.');
    return data;
  } catch {
    return { success: false, message: 'Error de conexión al registrar el dispositivo.' };
  }
}
```

- [ ] **Step 3: Write the permission + registration helper**

Create `MockupsSwayMobile/src/utils/pushNotifications.js`:

```javascript
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '../api/client';

export async function requestAndRegisterPushToken() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const expoPushToken = tokenResponse.data;
    if (!expoPushToken) return;

    await registerPushToken(expoPushToken, Platform.OS);
  } catch (e) {
    console.warn('No se pudo registrar el push token:', e);
  }
}
```

Registration failures are swallowed (logged only) — a user who denies notification permission or has a registration hiccup should never see an error blocking login, matching the spec's error-handling section.

- [ ] **Step 4: Wire it into the login success path**

In `MockupsSwayMobile/src/navigation/AppNavigator.js`, find the existing line (~132):

```javascript
{(props) => <LoginScreen {...props} onLogin={() => setIsLoggedIn(true)} />}
```

Replace with:

```javascript
{(props) => <LoginScreen {...props} onLogin={() => { setIsLoggedIn(true); requestAndRegisterPushToken(); }} />}
```

Add the import at the top of `AppNavigator.js`:

```javascript
import { requestAndRegisterPushToken } from '../utils/pushNotifications';
```

This is the single wiring point for all 3 of `LoginScreen`'s `onLogin()` call sites (biometric success, password login, register+auto-login) — `onLogin` is already the shared callback for all three, so no need to touch `LoginScreen.js` itself.

- [ ] **Step 5: Manual verification (no automated test for actual push delivery)**

On a real device with Expo Go: log in, confirm the OS permission prompt appears, accept it, then confirm (via `psql` against local Postgres, same tunnel pattern used all session) that a row now exists in `push_tokens` with a token starting `ExponentPushToken[`.

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/package.json MockupsSwayMobile/package-lock.json MockupsSwayMobile/src/api/client.js MockupsSwayMobile/src/utils/pushNotifications.js MockupsSwayMobile/src/navigation/AppNavigator.js
git commit -m "feat: registro de push token en login (expo-notifications)"
```

---

### Task 4: Standalone broadcast script

**Files:**
- Create: `scripts/send_broadcast.py`

**Interfaces:**
- Consumes: `push_tokens` table (Task 1), Expo's push API (`https://exp.host/--/api/v2/push/send`).
- Produces: a CLI script, no importable interface needed by other tasks.

- [ ] **Step 1: Write the script**

Create `scripts/send_broadcast.py`:

```python
#!/usr/bin/env python3
"""
Envia una notificacion push unica a todos los dispositivos registrados en push_tokens.
Uso:
    python scripts/send_broadcast.py --db-url "postgresql://user:pass@host:port/db" \
        --title "Titulo" --body "Mensaje"

Requiere tunel SSH activo si se corre contra produccion (mismo patron ya usado
en el proyecto: tunel a localhost, --db-url apuntando a localhost:<puerto-local>).
"""
import argparse
import json
import sys

import psycopg
import requests

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH_SIZE = 100


def fetch_tokens(db_url):
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT expo_push_token FROM push_tokens")
            return [row[0] for row in cur.fetchall()]


def send_batch(tokens, title, body):
    messages = [{"to": t, "title": title, "body": body} for t in tokens]
    resp = requests.post(
        EXPO_PUSH_URL,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        data=json.dumps(messages),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Broadcast push notification (one-off, manual)")
    parser.add_argument("--db-url", required=True, help="Postgres conninfo, e.g. postgresql://user:pass@host:port/db")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    args = parser.parse_args()

    tokens = fetch_tokens(args.db_url)
    if not tokens:
        print("No hay tokens registrados en push_tokens. Nada que enviar.")
        return

    print(f"Enviando a {len(tokens)} dispositivo(s)...")
    sent = 0
    errors = 0
    for i in range(0, len(tokens), BATCH_SIZE):
        batch = tokens[i:i + BATCH_SIZE]
        result = send_batch(batch, args.title, args.body)
        for ticket in result.get("data", []):
            if ticket.get("status") == "ok":
                sent += 1
            else:
                errors += 1
                print(f"  error: {ticket.get('message', ticket)}")

    print(f"Listo: {sent} enviados, {errors} con error.")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Add `requests` to `requirements.txt`**

`requests` is already transitively available in this environment (used by `test/test_orm.py`) but isn't declared. Add it explicitly so the script works in any environment, not just this one by luck.

In `requirements.txt`, add a line near the other top-level deps:

```
requests>=2.31.0
```

- [ ] **Step 3: Test against local Postgres with a fake token (no real Expo send)**

Run locally (assuming local Postgres from `docker-compose.yml` is up on `localhost:5433`, same pattern used all session):

```bash
psql postgresql://sway_app:sway123@localhost:5433/sway -c "INSERT INTO push_tokens (id_usuario, expo_push_token, platform, created_at, updated_at) VALUES (1, 'ExponentPushToken[test-fake-token]', 'ios', now(), now())"
python scripts/send_broadcast.py --db-url "postgresql://sway_app:sway123@localhost:5433/sway" --title "Prueba" --body "Mensaje de prueba"
```

Expected: script prints `Enviando a 1 dispositivo(s)...`, then reports 1 error (fake token rejected by Expo — this confirms the script's plumbing works end-to-end without needing a real device for this automated-ish check). Clean up the fake row afterward: `psql ... -c "DELETE FROM push_tokens WHERE expo_push_token = 'ExponentPushToken[test-fake-token]'"`.

- [ ] **Step 4: Commit**

```bash
git add scripts/send_broadcast.py requirements.txt
git commit -m "feat: script standalone de broadcast push (uso unico)"
```

---

### Task 5: Phase 1 production deploy + verification

**Files:** none (infra/ops task, no code changes)

- [ ] **Step 1: Run the manual migration on the private droplet**

SSH to the private droplet (via the bastion pattern from the previous session — public droplet as jump host, `ProxyCommand` with `sway_deploy` key), then:

```bash
docker exec -i sway_postgres psql -U sway_app -d sway -c "CREATE TABLE PushTokens (id SERIAL PRIMARY KEY, id_usuario INTEGER NOT NULL REFERENCES Usuarios(id), expo_push_token VARCHAR(255) NOT NULL UNIQUE, platform VARCHAR(20) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
```

- [ ] **Step 2: Deploy the new code**

```bash
git push origin master
```

Then on the private droplet: `git pull && docker compose -f docker-compose.private.yml up -d --build api1 api2`.

- [ ] **Step 3: Verify the endpoint exists in production**

```bash
curl -X POST https://proyecto-sway.site/api/push-tokens -H "x-api-key: <real key>" -H "Content-Type: application/json" -d '{"expo_push_token":"x","platform":"ios"}'
```

Expected: `401` (no auth token — confirms the route exists and the auth dependency runs, not a `404`).

- [ ] **Step 4: Real device test**

On a real device with Expo Go pointed at production (already the case per `API_HOST` in `client.js`): log in, accept the permission prompt, then run `scripts/send_broadcast.py` against production (via the SSH tunnel pattern, `--db-url` pointing at the tunneled local port) with a real title/body. Confirm the notification actually arrives on the device — this is the one step in Phase 1 that cannot be automated.

---

## Phase 2 — Realtime Sync

### Task 6: Redis infrastructure

**Files:**
- Modify: `docker-compose.private.yml` (add `redis` service, both `api1`/`api2` get `REDIS_URL`)
- Modify: `docker-compose.yml` (reference/local file — add the same `redis` service for local dev parity, matching how `uploads_data` was added to both compose files previously)
- Modify: `requirements.txt`
- Modify: `haproxy/haproxy.cfg` (add `timeout tunnel`)

**Interfaces:**
- Produces: a running `redis` container reachable at `redis://redis:6379` from both API containers; `REDIS_URL` env var available to `app/services/realtime_publish.py` and `app/realtime/redis_bridge.py` (Tasks 7-9).

- [ ] **Step 1: Add `redis` to `requirements.txt`**

```
redis>=5.0.0
```

- [ ] **Step 2: Add the Redis service to `docker-compose.private.yml`**

After the `postgres` service block, add:

```yaml
  redis:
    image: redis:alpine
    container_name: sway_redis
    restart: unless-stopped
    networks:
      - data_network
```

And add `REDIS_URL: redis://redis:6379` to both `api1` and `api2`'s `environment:` blocks (alongside the existing `DATABASE_URL`/`CORS_ORIGINS`/`UPLOAD_DIR`), and add `depends_on: redis:` (in addition to the existing `postgres: condition: service_healthy`) to both.

- [ ] **Step 3: Mirror the same service in `docker-compose.yml`**

Add the equivalent `redis` service block to the local reference `docker-compose.yml`, same pattern, so local Postgres+Redis testing (the established pattern from the RSVP/photo-upload sessions) works without touching prod.

- [ ] **Step 4: Add `timeout tunnel` to HAProxy**

In `haproxy/haproxy.cfg`, in the `defaults` section, after `timeout server 30s`, add:

```
    timeout tunnel 1h
```

Without this, HAProxy drops any WebSocket idle for 30s (falls back to `timeout client`/`timeout server`), which Task 9-12 will otherwise mask as "flaky mobile network."

- [ ] **Step 5: Validate HAProxy config syntax**

Run (from the droplet, or locally if HAProxy is installed): `haproxy -c -f haproxy/haproxy.cfg`
Expected: `Configuration file is valid`.

- [ ] **Step 6: Start Redis locally and verify connectivity**

```bash
docker compose up -d redis
docker exec -it sway_redis redis-cli ping
```

Expected: `PONG`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.private.yml docker-compose.yml requirements.txt haproxy/haproxy.cfg
git commit -m "feat: agrega Redis para pub/sub y timeout tunnel de HAProxy para websockets"
```

---

### Task 7: Backend publish helper

**Files:**
- Create: `app/services/realtime_publish.py`
- Test: `test/test_realtime_publish.py`

**Interfaces:**
- Produces: `publish_event(event_type: str, payload: dict) -> None`. Never raises — failures are logged and swallowed.

- [ ] **Step 1: Write the failing test**

Create `test/test_realtime_publish.py`:

```python
from unittest.mock import MagicMock, patch

from app.services import realtime_publish


def test_publish_event_calls_redis_publish_with_json():
    fake_client = MagicMock()
    with patch.object(realtime_publish, "_get_client", return_value=fake_client):
        realtime_publish.publish_event("avistamiento_created", {"id": 1})

    assert fake_client.publish.call_count == 1
    channel, message = fake_client.publish.call_args[0]
    assert channel == realtime_publish.CHANNEL
    assert '"type": "avistamiento_created"' in message or '"type":"avistamiento_created"' in message
    assert '"id": 1' in message or '"id":1' in message


def test_publish_event_does_not_raise_when_redis_unavailable():
    with patch.object(realtime_publish, "_get_client", side_effect=Exception("connection refused")):
        realtime_publish.publish_event("avistamiento_created", {"id": 1})  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest test/test_realtime_publish.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.realtime_publish'`.

- [ ] **Step 3: Write the implementation**

Create `app/services/realtime_publish.py`:

```python
import json
import os

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
CHANNEL = "sway:events"

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL)
    return _client


def publish_event(event_type: str, payload: dict) -> None:
    try:
        client = _get_client()
        client.publish(CHANNEL, json.dumps({"type": event_type, "payload": payload}))
    except Exception as e:
        print(f"[realtime] publish failed for {event_type}: {e}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest test/test_realtime_publish.py -v`
Expected: PASS — 2/2.

- [ ] **Step 5: Commit**

```bash
git add app/services/realtime_publish.py test/test_realtime_publish.py
git commit -m "feat: helper publish_event best-effort sobre Redis pub/sub"
```

---

### Task 8: WebSocket connection manager

**Files:**
- Create: `app/realtime/__init__.py` (empty)
- Create: `app/realtime/manager.py`
- Test: `test/test_realtime_manager.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `manager` (singleton `ConnectionManager` instance) with `connect(websocket)`, `disconnect(websocket)`, `async broadcast(message: dict)`. Used by Task 9's subscriber and Task 10's WS endpoint.

- [ ] **Step 1: Write the failing test**

Create `test/test_realtime_manager.py`:

```python
import asyncio
from unittest.mock import AsyncMock

from app.realtime.manager import ConnectionManager


def test_broadcast_sends_to_all_connected():
    async def run():
        mgr = ConnectionManager()
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        mgr.connect(ws1)
        mgr.connect(ws2)

        await mgr.broadcast({"type": "avistamiento_created", "payload": {"id": 1}})

        ws1.send_json.assert_awaited_once_with({"type": "avistamiento_created", "payload": {"id": 1}})
        ws2.send_json.assert_awaited_once_with({"type": "avistamiento_created", "payload": {"id": 1}})

    asyncio.run(run())


def test_broadcast_drops_dead_connections_without_raising():
    async def run():
        mgr = ConnectionManager()
        healthy = AsyncMock()
        dead = AsyncMock()
        dead.send_json.side_effect = Exception("connection closed")
        mgr.connect(healthy)
        mgr.connect(dead)

        await mgr.broadcast({"type": "evento_created", "payload": {}})  # must not raise

        assert dead not in mgr.active
        assert healthy in mgr.active

    asyncio.run(run())


def test_disconnect_removes_connection():
    mgr = ConnectionManager()
    ws = AsyncMock()
    mgr.connect(ws)
    mgr.disconnect(ws)
    assert ws not in mgr.active
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest test/test_realtime_manager.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.realtime'`.

- [ ] **Step 3: Write the implementation**

Create `app/realtime/__init__.py` (empty file).

Create `app/realtime/manager.py`:

```python
class ConnectionManager:
    def __init__(self):
        self.active = set()

    def connect(self, websocket):
        self.active.add(websocket)

    def disconnect(self, websocket):
        self.active.discard(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for websocket in list(self.active):
            try:
                await websocket.send_json(message)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.active.discard(websocket)


manager = ConnectionManager()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest test/test_realtime_manager.py -v`
Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add app/realtime/__init__.py app/realtime/manager.py test/test_realtime_manager.py
git commit -m "feat: ConnectionManager para relay local de eventos websocket"
```

---

### Task 9: Redis subscriber bridge + WebSocket endpoint

**Files:**
- Create: `app/realtime/redis_bridge.py`
- Create: `app/routers/realtime.py`
- Modify: `app/main.py` (register the WS router without the API-key dependency, start the subscriber task on startup)
- Test: `test/test_realtime_ws.py`

**Interfaces:**
- Consumes: `manager` (Task 8), `decode_token` from `app.security.auth` (existing).
- Produces: `WS /api/ws` endpoint; `start_subscriber()` coroutine registered as a background task on app startup.

- [ ] **Step 1: Write the failing test**

Create `test/test_realtime_ws.py`:

```python
from fastapi.testclient import TestClient

from app.main import app
from app.data.models import Usuario
from app.security.auth import create_token
from conftest import TestSession
from app.realtime.manager import manager

client = TestClient(app)


def _seed_usuario_and_token():
    db = TestSession()
    usuario = Usuario(nombre="WS", apellido_paterno="Test", email="ws.test@demo-sway.com", activo=True)
    db.add(usuario)
    db.commit()
    usuario_id = usuario.id
    db.close()
    token = create_token({"sub": str(usuario_id), "token_type": "colaborador"})
    return token


def test_ws_closes_without_auth_message():
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "not_auth"})
        try:
            ws.receive_text()
            assert False, "expected connection to close"
        except Exception:
            pass
    assert len(manager.active) == 0


def test_ws_closes_with_invalid_token():
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": "not-a-real-token"})
        try:
            ws.receive_text()
            assert False, "expected connection to close"
        except Exception:
            pass
    assert len(manager.active) == 0


def test_ws_accepts_valid_token_and_registers_connection():
    token = _seed_usuario_and_token()
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        # Give the server a moment to process the auth message and register the connection.
        import time
        time.sleep(0.2)
        assert len(manager.active) == 1
    assert len(manager.active) == 0  # cleaned up after the context manager closes the socket
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest test/test_realtime_ws.py -v`
Expected: FAIL — `404 Not Found` (route doesn't exist).

- [ ] **Step 3: Write the subscriber bridge**

Create `app/realtime/redis_bridge.py`:

```python
import asyncio
import json
import os

import redis.asyncio as aioredis

from app.realtime.manager import manager

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
CHANNEL = "sway:events"


async def start_subscriber():
    while True:
        try:
            client = aioredis.from_url(REDIS_URL)
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                await manager.broadcast(data)
        except Exception as e:
            print(f"[realtime] subscriber error, retrying in 5s: {e}")
            await asyncio.sleep(5)
```

The `while True` + `except`+`sleep(5)` wrapper is the subscriber-side reconnect loop the spec calls out — without it, a Redis blip silently and permanently stops that replica's relay until the process restarts.

- [ ] **Step 4: Write the WebSocket endpoint**

Create `app/routers/realtime.py`:

```python
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.realtime.manager import manager
from app.security.auth import decode_token

router = APIRouter(prefix="/api", tags=["realtime"])

AUTH_TIMEOUT_SECONDS = 10


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        first_message = await asyncio.wait_for(websocket.receive_json(), timeout=AUTH_TIMEOUT_SECONDS)
    except Exception:
        await websocket.close(code=4001)
        return

    if first_message.get("type") != "auth" or not first_message.get("token"):
        await websocket.close(code=4001)
        return

    try:
        decode_token(first_message["token"])
    except Exception:
        await websocket.close(code=4001)
        return

    manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # client pings to keep the tunnel alive; ignored
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
```

Auth is validated once at connect time via first-message JWT (never a `?token=` query string, per the spec's HAProxy-log finding). `decode_token` raising `HTTPException` on an invalid/expired token is caught here as a generic `Exception` and treated as an auth failure close — the websocket protocol can't return an HTTP status code mid-handshake, so a close code (`4001`) is the equivalent signal.

- [ ] **Step 5: Register the router and startup task in `app/main.py`**

Add the import (line ~15, alongside the other router imports):

```python
from app.routers import auth, colaboradores, especies, productos, pedidos, eventos, estadisticas, direcciones, catalogos, push, realtime
```

Register the router **without** `dependencies=_api_key_dep` (React Native's native `WebSocket` can't reliably send the custom `x-api-key` header this project's REST clients use — auth here is the first-message JWT instead):

```python
app.include_router(realtime.router)
```

Add the subscriber startup hook (after the router registrations, before `app.mount(...)`):

```python
from app.realtime.redis_bridge import start_subscriber

@app.on_event("startup")
async def _start_realtime_subscriber():
    asyncio.create_task(start_subscriber())
```

Add `import asyncio` at the top of `app/main.py` if not already present.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest test/test_realtime_ws.py -v`
Expected: PASS — 3/3.

- [ ] **Step 7: Run the full backend test suite to confirm no regressions**

Run: `pytest test/ -v`
Expected: all pre-existing tests still pass (same count as before this task, plus the new ones from Tasks 2, 7, 8, 9).

- [ ] **Step 8: Commit**

```bash
git add app/realtime/redis_bridge.py app/routers/realtime.py app/main.py test/test_realtime_ws.py
git commit -m "feat: endpoint WS /api/ws con auth por primer mensaje + subscriber Redis con reconexion"
```

---

### Task 10: Wire `publish_event` into the mutating endpoints

**Files:**
- Modify: `app/routers/estadisticas.py` (`reportar_avistamiento` line ~157, `eliminar_avistamiento` line ~214)
- Modify: `app/routers/eventos.py` (`crear_evento` line ~125, `eliminar_evento` line ~200)
- Modify: `app/routers/especies.py` (`create_especie` line ~384, `update_especie` line ~480, `delete_especie` line ~575)
- Test: `test/test_realtime_publish_wiring.py`

**Interfaces:**
- Consumes: `publish_event` (Task 7).

- [ ] **Step 1: Write the failing tests**

Create `test/test_realtime_publish_wiring.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.data.models import EstadoConservacion, Especie
from conftest import TestSession

client = TestClient(app)


def _seed_especie():
    db = TestSession()
    estado = EstadoConservacion(nombre="En Peligro")
    db.add(estado)
    db.commit()
    especie = Especie(nombre_comun="Delfin", nombre_cientifico="Delphinus delphis",
                       id_estado_conservacion=estado.id)
    db.add(especie)
    db.commit()
    especie_id = especie.id
    db.close()
    return especie_id


def test_reportar_avistamiento_publishes_event():
    especie_id = _seed_especie()
    payload = {
        "id_especie": especie_id,
        "fecha_avistamiento": "2026-08-01T10:00:00",
        "latitud": 10.5,
        "longitud": -20.5,
        "nombre_usuario": "Test Usuario",
        "email_usuario": "realtime.wiring@demo-sway.com",
        "notas": "prueba realtime",
    }
    with patch("app.routers.estadisticas.publish_event") as mock_publish:
        resp = client.post("/api/reportar-avistamiento", json=payload)
    assert resp.status_code == 200
    mock_publish.assert_called_once()
    event_type, event_payload = mock_publish.call_args[0]
    assert event_type == "avistamiento_created"
    assert event_payload["id"] == resp.json()["id"]


def test_reportar_avistamiento_does_not_publish_on_validation_error():
    with patch("app.routers.estadisticas.publish_event") as mock_publish:
        resp = client.post("/api/reportar-avistamiento", json={
            "id_especie": 999999,
            "fecha_avistamiento": "2026-08-01T10:00:00",
            "latitud": 10.5,
            "longitud": -20.5,
            "nombre_usuario": "Test",
            "email_usuario": "realtime.fail@demo-sway.com",
        })
    assert resp.status_code == 400
    mock_publish.assert_not_called()


def test_delete_especie_publishes_especie_deleted():
    from app.security.auth import get_current_colaborador
    especie_id = _seed_especie()
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    try:
        with patch("app.routers.especies.publish_event") as mock_publish:
            resp = client.delete(f"/api/especies/{especie_id}")
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("especie_deleted", {"id": especie_id})
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest test/test_realtime_publish_wiring.py -v`
Expected: FAIL — `AssertionError: Expected 'mock' to have been called once. Called 0 times.` (import of `publish_event` doesn't exist in these router modules yet, so `patch(...)` will actually raise `AttributeError` first — either failure mode confirms the wiring isn't there yet).

- [ ] **Step 3: Wire `app/routers/estadisticas.py`**

Add the import near the top (after the existing `from app.config import ...` line):

```python
from app.services.realtime_publish import publish_event
```

In `reportar_avistamiento`, right after `db.refresh(nuevo_avistamiento)` and before the `return` (currently ~line 205):

```python
        publish_event("avistamiento_created", {
            "id": nuevo_avistamiento.id,
            "id_especie": nuevo_avistamiento.id_especie,
            "fecha": nuevo_avistamiento.fecha.isoformat(),
            "notas": nuevo_avistamiento.notas,
        })
```

In `eliminar_avistamiento`, right after `db.commit()` and before the `return` (currently ~line 226):

```python
        publish_event("avistamiento_deleted", {"id": avistamiento_id})
```

- [ ] **Step 4: Wire `app/routers/eventos.py`**

Add the import near the top:

```python
from app.services.realtime_publish import publish_event
```

In `crear_evento`, right after `db.refresh(nuevo_evento)` and before the `return` (currently ~line 190):

```python
        publish_event("evento_created", {"id": nuevo_evento.id, "titulo": nuevo_evento.titulo})
```

In `eliminar_evento`, right after `db.commit()` and before the `return` (currently ~line 214):

```python
        publish_event("evento_deleted", {"id": evento_id})
```

- [ ] **Step 5: Wire `app/routers/especies.py`**

Add the import near the top:

```python
from app.services.realtime_publish import publish_event
```

In `create_especie`, right before the final `return {"success": True, "especie_id": especie_id, ...}` (currently ~line 466):

```python
        publish_event("especie_created", {"id": especie_id, "nombre_comun": nueva_especie.nombre_comun})
```

In `update_especie`, right before the final `return {"success": True, "message": "Especie actualizada correctamente"}` (currently ~line 559):

```python
        publish_event("especie_updated", {"id": especie_id, "nombre_comun": especie.nombre_comun})
```

In `delete_especie`, right before the final `return {"success": True, "message": f'Especie "{nombre}" eliminada exitosamente'}` (currently ~line 595):

```python
        publish_event("especie_deleted", {"id": especie_id})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest test/test_realtime_publish_wiring.py -v`
Expected: PASS — 3/3.

- [ ] **Step 7: Run the full backend suite**

Run: `pytest test/ -v`
Expected: all tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add app/routers/estadisticas.py app/routers/eventos.py app/routers/especies.py test/test_realtime_publish_wiring.py
git commit -m "feat: publica eventos realtime en creacion/eliminacion de avistamientos, eventos y especies"
```

---

### Task 11: Mobile `RealtimeProvider` + reconnect/resync hook

**Files:**
- Create: `MockupsSwayMobile/src/context/RealtimeContext.js`
- Modify: `MockupsSwayMobile/App.js` (wrap with `RealtimeProvider`, inside `AuthProvider`)

**Interfaces:**
- Consumes: `useAuth()` (existing, for `isLoggedIn`), `API_HOST` (existing, from `client.js`), the stored JWT (`SecureStore`, same key `sway_colab_token` used internally by `client.js`'s `authHeaders()` — this hook needs the raw token, not just the header, so it reads `SecureStore` directly).
- Produces: `useRealtime()` hook returning `{ subscribe }`, where `subscribe(callback)` registers `callback(message)` for every typed event received and returns an unsubscribe function. Also fires `callback({ type: "resync" })` on every reconnect after the first successful connection (screens treat this as "refetch now, you may be stale").

- [ ] **Step 1: Write the provider + hook**

Create `MockupsSwayMobile/src/context/RealtimeContext.js`:

```javascript
import { createContext, useContext, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { API_HOST } from '../api/client';
import { useAuth } from './AuthContext';

const TOKEN_KEY = 'sway_colab_token';
const RealtimeContext = createContext({ subscribe: () => () => {} });

function wsUrl() {
  return API_HOST.replace(/^http/, 'ws') + '/api/ws';
}

export function RealtimeProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const listenersRef = useRef(new Set());
  const socketRef = useRef(null);
  const hasConnectedBeforeRef = useRef(false);
  const retryDelayRef = useRef(1000);
  const closedByUsRef = useRef(false);

  const notify = (message) => {
    listenersRef.current.forEach((cb) => cb(message));
  };

  useEffect(() => {
    if (!isLoggedIn) {
      closedByUsRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
      hasConnectedBeforeRef.current = false;
      retryDelayRef.current = 1000;
      return;
    }

    closedByUsRef.current = false;

    const connect = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token || closedByUsRef.current) return;

      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
        retryDelayRef.current = 1000;
        if (hasConnectedBeforeRef.current) {
          notify({ type: 'resync' });
        }
        hasConnectedBeforeRef.current = true;
      };

      socket.onmessage = (event) => {
        try {
          notify(JSON.parse(event.data));
        } catch {
          // ignore malformed message
        }
      };

      socket.onclose = () => {
        if (closedByUsRef.current) return;
        setTimeout(connect, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [isLoggedIn]);

  const subscribe = (callback) => {
    listenersRef.current.add(callback);
    return () => listenersRef.current.delete(callback);
  };

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
```

Notes on this implementation, tracing directly to the spec's findings: reconnect uses exponential backoff capped at 30s (`retryDelayRef`); `hasConnectedBeforeRef` ensures the `resync` signal fires on every reconnect but not on the very first connection (screens already fetch on their own mount, firing resync there too would just be a redundant duplicate fetch); auth is sent as the first frame after `onopen`, never in the URL.

- [ ] **Step 2: Wrap the app with `RealtimeProvider`**

In `MockupsSwayMobile/App.js`, add the import:

```javascript
import { RealtimeProvider } from './src/context/RealtimeContext';
```

And wrap `GamificationProvider` with it (must be inside `AuthProvider` since it consumes `useAuth()`):

```javascript
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RealtimeProvider>
          <GamificationProvider>
            <StatusBar style="dark" />
            <AppNavigator />
            <CelebrationOverlay />
          </GamificationProvider>
        </RealtimeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 3: Manual verification**

Run `npx expo start` in `MockupsSwayMobile/`, log in on a real device/simulator, and use React Native's debugger/console (`console.log` temporarily added to `onopen`/`onmessage` if needed) to confirm the socket connects after login and closes on logout. No automated test — this is a live network component with no existing test harness in this project for WebSocket behavior (same category as the HAProxy balance test, called out in the spec as manual-only).

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/context/RealtimeContext.js MockupsSwayMobile/App.js
git commit -m "feat: RealtimeProvider con reconexion exponencial y resync en reconnect"
```

---

### Task 12: Wire screens to merge realtime events

**Files:**
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js` (fetch effect is at line ~92-100)
- Modify: `MockupsSwayMobile/src/screens/EventsScreen.js` (uses `useFocusEffect`, line ~114)
- Modify: `MockupsSwayMobile/src/screens/CatalogScreen.js` (fetch effect is at line ~120)

**Interfaces:**
- Consumes: `useRealtime()` (Task 11), each screen's existing `mapAvistamientoFromApi`/`mapEventoFromApi`/`mapEspecieFromApi` functions (already defined in each file) and existing fetch functions (`getAvistamientosMine`/`getAvistamientosAll`, `getEventos`/`getEventosMine`, `getEspecies`).

- [ ] **Step 1: Wire `SightingsScreen.js`**

Add the import:

```javascript
import { useRealtime } from '../context/RealtimeContext';
```

After the existing sightings-fetch `useEffect` (the one keyed on `[showMineOnly]`, ends ~line 100), add a new effect:

```javascript
  const { subscribe } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'resync') {
        const fetchSightings = showMineOnly ? getAvistamientosMine : getAvistamientosAll;
        fetchSightings().then((data) => {
          setSightings(data?.avistamientos ? data.avistamientos.map(mapAvistamientoFromApi) : []);
        });
        return;
      }
      if (message.type === 'avistamiento_created') {
        setSightings((prev) => {
          if (prev.some((s) => s.id === message.payload.id)) return prev;
          return [mapAvistamientoFromApi(message.payload), ...prev];
        });
      }
      if (message.type === 'avistamiento_deleted') {
        setSightings((prev) => prev.filter((s) => s.id !== message.payload.id));
      }
    });
    return unsubscribe;
  }, [showMineOnly]);
```

This mirrors the existing focus-refetch's `showMineOnly` dependency (a `resync` after reconnect should refetch honoring whichever toggle is currently active, same as the existing effect already does). `mapAvistamientoFromApi` expects the same shape the REST list endpoints return; the realtime payload from Task 10 (`id`, `id_especie`, `fecha`, `notas`) is a subset of that — check `mapAvistamientoFromApi`'s definition (top of this file) for which fields it reads and only rely on the ones present; if it reads `especie_nombre` (which the realtime payload does not include), leave that field absent/undefined rather than fabricating it, and note this as a known minor gap (the live card may show a blank species name until the next full refetch) rather than silently guessing a value.

- [ ] **Step 2: Wire `EventsScreen.js`**

Add the import:

```javascript
import { useRealtime } from '../context/RealtimeContext';
```

Near the existing `useFocusEffect` (line ~114), add a separate `useEffect`:

```javascript
  const { subscribe } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'resync' || message.type === 'evento_created' || message.type === 'evento_deleted') {
        getEventos().then((data) => {
          if (data?.success) setEvents(sortEventos(data.eventos.map(mapEventoFromApi)));
        });
      }
    });
    return unsubscribe;
  }, []);
```

A full refetch (rather than a manual splice) is used here deliberately: `_serializar_eventos` computes `registrados`/`es_gratuito`/status server-side, and this screen already has a `sortEventos` helper expecting the full mapped shape — reconstructing that client-side from the smaller realtime payload would duplicate server logic and risk drifting from it. This is the simpler, correct choice for this screen's already-more-complex derived state (unlike Sightings, which merges directly).

- [ ] **Step 3: Wire `CatalogScreen.js`**

Add the import:

```javascript
import { useRealtime } from '../context/RealtimeContext';
```

After the existing catalog-fetch `useEffect` (line ~120), add:

```javascript
  const { subscribe } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (['resync', 'especie_created', 'especie_updated', 'especie_deleted'].includes(message.type)) {
        getEspecies().then((data) => {
          if (data?.success && Array.isArray(data.especies)) {
            setSpecies(data.especies.map(mapEspecieFromApi));
          }
        });
      }
    });
    return unsubscribe;
  }, []);
```

Same reasoning as `EventsScreen`: full refetch on any catalog-affecting event, simplest correct option given the catalog's existing fetch already returns the full mapped list.

- [ ] **Step 4: Manual verification — two-device test**

With the backend running locally (Postgres + Redis + `uvicorn`), open the app on two devices/simulators logged in as different (or the same) collaborator. On Device A, report an avistamiento. Confirm it appears on Device B's `SightingsScreen` without navigating away and back. Repeat for creating an event (Device B's `EventsScreen`) and creating/editing a species via `CatalogScreen`'s existing form (Device B's `CatalogScreen`).

- [ ] **Step 5: Commit**

```bash
git add MockupsSwayMobile/src/screens/SightingsScreen.js MockupsSwayMobile/src/screens/EventsScreen.js MockupsSwayMobile/src/screens/CatalogScreen.js
git commit -m "feat: pantallas de avistamientos/eventos/especies se actualizan en vivo via websocket"
```

---

### Task 13: Phase 2 production deploy + cross-replica verification

**Files:** none (infra/ops task, no code changes)

- [ ] **Step 1: Deploy Redis + updated HAProxy config**

On the private droplet: `git pull && docker compose -f docker-compose.private.yml up -d redis api1 api2`.
On the public droplet (HAProxy runs here per the existing 2-droplet architecture): `git pull`, then reload HAProxy with the new `timeout tunnel` — check `docs/DEPLOYMENT_2_DROPLETS.md` for the exact reload command already documented for this project (HAProxy config changes need a restart of the `haproxy` container, not a hot reload, per this project's existing deploy pattern).

- [ ] **Step 2: Verify Redis is reachable from both API containers**

```bash
docker exec sway_api1 python -c "import redis; r = redis.from_url('redis://redis:6379'); print(r.ping())"
docker exec sway_api2 python -c "import redis; r = redis.from_url('redis://redis:6379'); print(r.ping())"
```

Expected: `True` from both.

- [ ] **Step 3: Verify the WS endpoint exists**

```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://proyecto-sway.site/api/ws
```

Expected: `HTTP/1.1 101 Switching Protocols` (confirms the route + HAProxy upgrade handling both work in prod).

- [ ] **Step 4: Cross-replica delivery test — the actual point of Redis**

Using two separate WS clients pinned to different replicas directly (bypassing HAProxy, same pattern already used for the rate-limiting test in `scripts/verify_pi_requirements.sh`): connect one client directly to `api1` (`ws://10.124.0.3:8001/api/ws`) and another directly to `api2` (`ws://10.124.0.3:8002/api/ws`), both with valid auth. Trigger a real avistamiento creation via `curl` against the public domain (goes through HAProxy, lands on whichever replica). Confirm **both** directly-connected clients receive the `avistamiento_created` message — this is the only way to prove the Redis relay actually crosses replicas, since a test through HAProxy alone can't guarantee which replica handled the request.

- [ ] **Step 5: Idle-timeout verification**

Open one WS client (through the real `https://proyecto-sway.site/api/ws` path, through HAProxy) and leave it idle (no ping) for at least 45 seconds. Confirm it's still open (proves `timeout tunnel` is actually taking effect, not just present in the config file) — before this task's Task 6 fix, this would have dropped at 30s.

- [ ] **Step 6: Add this feature to `docs/PI_REQUIREMENTS_VERIFICATION.md`**

This is new functionality beyond the original 14-point rubric — add a short new section documenting what was built (push registration + broadcast script, realtime sync architecture) and how to verify it, following this doc's existing style (file:line references, copy-paste `curl`/`psql` commands). Commit alongside `progress.md` updates once this phase is confirmed working end-to-end.

---

## Self-Review Notes

- **Spec coverage:** every architecture bullet from both phases of the spec maps to a task above — `push_tokens` table (Task 1), registration endpoint (Task 2), mobile registration (Task 3), standalone script (Task 4), production migration (Task 5), Redis container + `timeout tunnel` (Task 6), publish helper (Task 7), connection manager (Task 8), first-message-auth WS endpoint + subscriber reconnect loop (Task 9), all 7 message types including `especie_deleted` wired into every mutating endpoint (Task 10), mobile provider with reconnect + resync-on-reconnect (Task 11), per-screen merge (Task 12), cross-replica + idle-timeout verification (Task 13). The two "accepted, not fixed" items from spec review (no token cleanup, no token-ownership validation) are deliberately **not** tasks — the spec documents them as accepted tradeoffs, not defects to fix.
- **Type consistency check:** `publish_event(event_type: str, payload: dict)` signature (Task 7) matches every call site in Task 10. `manager.broadcast(message: dict)` (Task 8) matches how `redis_bridge.py` (Task 9) calls it (`await manager.broadcast(data)` where `data` is the parsed JSON, a dict). Mobile `subscribe(callback)` (Task 11) matches every screen's usage in Task 12 (`const unsubscribe = subscribe((message) => {...})`).
- **No placeholders:** every step above contains complete, runnable code — no "add appropriate error handling" or "similar to Task N" shortcuts.
