# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real device push notifications (one-off broadcast script) for the SWAY POO mobile app.

**Architecture:** A `push_tokens` table + registration endpoint + standalone Python broadcast script. No auto-triggers, no admin endpoint — a device registers its Expo push token on login, and a script (run manually, once) reads all tokens and sends a broadcast via Expo's push API.

**Tech Stack:** FastAPI, SQLAlchemy, Postgres, Expo/React Native (`expo-notifications`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-push-notifications-and-realtime-sync-design.md` (Phase 1 section — this plan covers Phase 1 only; Phase 2/realtime sync is a separate plan, `docs/superpowers/plans/2026-08-04-realtime-sync.md`, and depends on this one shipping first).
- No auto-triggered push notifications (event-created, RSVP reminders, activity feed) — manual broadcast only.
- No admin/authenticated broadcast endpoint — broadcast is a standalone one-off script with direct Postgres access.
- Follow existing patterns: routers live in `app/routers/`, Pydantic schemas in `app/models/`, SQLAlchemy models in `app/data/models.py`, tests in `test/` using the sqlite-in-memory `conftest.py` override, dependency override for `get_current_colaborador` (not real JWTs).
- **Server health is the priority over speed.** Tasks 1-4 only touch local code/tests/local Postgres — never the real droplets. Only Task 5 deploys, and only after Tasks 1-4 are green.
- **Bastion access to the private droplet**, needed for Task 5's deploy/verification steps: the private droplet no longer accepts direct SSH from the internet (confirmed timeout, sesión 2026-08-02). All access goes through the public droplet as jump host, key `sway_deploy`:
  ```bash
  ssh -i ~/.ssh/sway_deploy -o ProxyCommand="ssh -i ~/.ssh/sway_deploy -W %h:%p root@146.190.136.236" root@10.124.0.3
  ```
  (`-J`/ProxyJump on the command line does not inherit `-i` for the intermediate hop — use `ProxyCommand` as above, not `-J`.) UFW on the private droplet only accepts port 22 from the public droplet's VPC IP (`10.124.0.2`); password auth is disabled there.
- **Rollback is trivial for this phase**: this plan adds one new table (`push_tokens`) that nothing else depends on and one new route. Reverting the API containers to the pre-this-phase commit and re-running `docker compose up -d --build api1 api2` is safe — the old code simply never queries `push_tokens`, no schema conflict either direction.

---

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
- Produces: `POST /api/push-tokens` — auth required, body `{"expo_push_token": str, "platform": "ios"|"android"}`, response `{"success": true, "id": <int>}`. Idempotent upsert keyed on `expo_push_token`, done atomically at the SQL level (not check-then-act) so it's safe under concurrent requests.

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


def test_register_push_token_rejects_empty_token():
    user_id = _seed_usuario("push.empty@demo-sway.com")
    _override_user(user_id)
    resp = client.post("/api/push-tokens", json={"expo_push_token": "", "platform": "ios"})
    assert resp.status_code == 422
```

This locks in the reassignment rule the spec left open: same token, different user, upserts to the new owner (same physical device, different account logged in) rather than rejecting — matches how `expo_push_token` is a device identity, not a user identity. The last test confirms the Pydantic `min_length=1` constraint actually rejects an empty token, not just claimed by the field definition.

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
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.data.database import get_db
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
        now = datetime.utcnow()

        result = db.execute(
            text(
                """
                INSERT INTO push_tokens (id_usuario, expo_push_token, platform, created_at, updated_at)
                VALUES (:id_usuario, :expo_push_token, :platform, :now, :now)
                ON CONFLICT (expo_push_token) DO UPDATE
                    SET id_usuario = EXCLUDED.id_usuario,
                        platform = EXCLUDED.platform,
                        updated_at = EXCLUDED.updated_at
                RETURNING id
                """
            ),
            {"id_usuario": user_id, "expo_push_token": data.expo_push_token, "platform": data.platform, "now": now},
        )
        token_id = result.scalar_one()
        db.commit()
        return {"success": True, "id": token_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en register_push_token: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**This uses a real `INSERT ... ON CONFLICT (expo_push_token) DO UPDATE` (Postgres upsert), not a check-then-write.** A naive `db.query(PushToken).filter(...).first()` followed by an `INSERT` or `UPDATE` has a real race: two near-simultaneous requests registering the same brand-new token (a device logging in twice quickly, or a client retry after a slow response) can both see no existing row and both attempt an `INSERT`, and the second one crashes on the unique constraint with a raw 500 instead of the idempotent behavior the spec promises. `ON CONFLICT DO UPDATE` pushes the check-and-write into a single atomic statement that Postgres itself serializes — this is real, not hypothetical, since sqlite's global lock in this project's test setup would silently mask the exact race that hits Postgres in production, so relying on the ORM's `db.query().first()` pattern here specifically (unlike every other router in this codebase, which is fine with it) would ship a latent prod bug that no test in this project's suite could ever catch.

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
Expected: PASS — 5/5.

- [ ] **Step 7: Commit**

```bash
git add app/models/push.py app/routers/push.py app/main.py test/test_push_tokens.py
git commit -m "feat: endpoint POST /api/push-tokens con upsert atomico por token"
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

In `MockupsSwayMobile/src/api/client.js`, add near the other simple authenticated POST functions (after `deleteEspecie`, using `apiFetch` — not a bare `fetch` — since this route is registered behind the api-key dependency like every other REST route in this file):

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
    DATABASE_URL="postgresql://user:pass@host:port/db" python scripts/send_broadcast.py \
        --title "Titulo" --body "Mensaje"

Requiere tunel SSH activo si se corre contra produccion (mismo patron ya usado
en el proyecto: tunel a localhost, DATABASE_URL apuntando a localhost:<puerto-local>).

La cadena de conexion se lee de la variable de entorno DATABASE_URL, NO de un
flag de linea de comandos — un argumento --db-url quedaria visible en texto
plano en `ps aux`/`/proc/<pid>/cmdline` para cualquier otro usuario local
mientras el script corre, y grabado en el historial de shell de forma
persistente. La contraseña real de Postgres de produccion no debe pasar por
ninguno de esos dos lugares.
"""
import json
import os
import sys
from argparse import ArgumentParser

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
    parser = ArgumentParser(description="Broadcast push notification (one-off, manual)")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Falta la variable de entorno DATABASE_URL.", file=sys.stderr)
        return 1

    tokens = fetch_tokens(db_url)
    if not tokens:
        print("No hay tokens registrados en push_tokens. Nada que enviar.")
        return 0

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
    return 0


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
DATABASE_URL="postgresql://sway_app:sway123@localhost:5433/sway" python scripts/send_broadcast.py --title "Prueba" --body "Mensaje de prueba"
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

SSH to the private droplet (via the bastion pattern in Global Constraints above), then:

```bash
docker exec -i sway_postgres psql -U sway_app -d sway -c "CREATE TABLE PushTokens (id SERIAL PRIMARY KEY, id_usuario INTEGER NOT NULL REFERENCES Usuarios(id), expo_push_token VARCHAR(255) NOT NULL UNIQUE, platform VARCHAR(20) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
```

- [ ] **Step 2: Deploy the new code**

```bash
git push origin master
```

Then on the private droplet: `git pull && docker compose -f docker-compose.private.yml up -d --build api1 api2`. This is the existing accepted deploy pattern for this project (whole `api1`/`api2` stack restarts together, no rolling-restart tooling exists here) — a brief full outage of the API is expected and already normal for this project's deploys, not a new risk introduced by this task.

- [ ] **Step 3: Verify the endpoint exists in production**

```bash
curl -X POST https://proyecto-sway.site/api/push-tokens -H "x-api-key: <real key>" -H "Content-Type: application/json" -d '{"expo_push_token":"x","platform":"ios"}'
```

Expected: `401` (no auth token — confirms the route exists and the auth dependency runs, not a `404`).

- [ ] **Step 4: Real device test**

On a real device with Expo Go pointed at production (already the case per `API_HOST` in `client.js`): log in, accept the permission prompt, then run `scripts/send_broadcast.py` against production (via the SSH tunnel pattern, `DATABASE_URL` pointing at the tunneled local port) with a real title/body. Confirm the notification actually arrives on the device — this is the one step in Phase 1 that cannot be automated.

---

## Self-Review Notes

- **Spec coverage:** every Phase 1 architecture bullet from the spec maps to a task above — `push_tokens` table (Task 1), registration endpoint (Task 2), mobile registration (Task 3), standalone script (Task 4), production migration + deploy (Task 5).
- **No placeholders:** every step above contains complete, runnable code.
- **Split from the original combined plan:** this file was split out of a single Phase 1 + Phase 2 plan document (`docs/superpowers/plans/2026-08-04-push-notifications-and-realtime-sync.md`, superseded by this file and `2026-08-04-realtime-sync.md`) on tech-lead review recommendation — the two phases are genuinely separable subsystems with a hard gate already built in (Task 5 must ship and run cleanly in prod before the realtime-sync plan's Task 1 starts), and keeping them in one file meant a future rework of Phase 2 would bury Phase 1's already-shipped status under an unrelated task list.
- **Specialist review findings folded in (multiple review rounds):** (1) Task 2's upsert now uses a real `INSERT ... ON CONFLICT DO UPDATE` instead of a check-then-write that races under Postgres concurrency and previously would have raised a raw 500 on the second of two near-simultaneous registrations of the same new token; (2) Task 2 gained a test asserting empty tokens are rejected (422), closing a stated-but-unverified Pydantic constraint; (3) Task 4's script now reads its Postgres connection string from `DATABASE_URL` (an environment variable) instead of a `--db-url` CLI flag, since a command-line argument is visible in `ps aux`/`/proc/<pid>/cmdline` to any other local user and is written to shell history — a real exposure path for production's actual database password, not a theoretical one, given this script's documented real-world usage against prod in Task 5.
