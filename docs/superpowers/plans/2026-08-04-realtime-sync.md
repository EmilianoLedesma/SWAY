# Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-device realtime sync (avistamientos/eventos/especies) for the SWAY POO mobile app, replacing today's "only fresh on next screen focus" behavior.

**Architecture:** A Redis pub/sub channel shared by `api1`/`api2`, a single `WS /api/ws` endpoint with first-message JWT auth, and mobile-side wiring (`RealtimeProvider` + per-screen merge) with reconnect-triggers-resync.

**Tech Stack:** FastAPI, `redis-py` (sync + `redis.asyncio`), Expo/React Native (native `WebSocket`), HAProxy.

**Prerequisite:** the push-notifications plan (`docs/superpowers/plans/2026-08-04-push-notifications.md`) must be fully shipped and verified in production before starting Task 1 here — not a code dependency, but a project-priority gate: server health takes priority over speed, and this plan's own scope (a new shared-infra container, a new unauthenticated-by-api-key endpoint) is enough new surface area on its own without also being the first time Phase 1 gets proven in prod.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-push-notifications-and-realtime-sync-design.md` (Phase 2 section).
- WS auth is **first-message JWT**, never a `?token=` query string (HAProxy logs full request lines).
- Every mutating endpoint touching avistamientos/eventos/especies must publish its typed event, including `DELETE /api/especies/{especie_id}` (`especie_deleted`) and `DELETE /api/avistamientos/{avistamiento_id}` (`avistamiento_deleted`) — both easy to forget, both explicitly in scope, both must have their own test (see Task 5).
- Realtime is best-effort: a Redis/publish/subscribe failure must never fail or roll back the underlying REST mutation.
- **Mobile merge-vs-refetch rule (codified, not per-screen improvisation):** a screen may do an in-place merge of a realtime payload into local state ONLY when that payload alone is sufficient to reconstruct what the screen displays. Where the screen depends on server-computed derived fields not present in the (deliberately thin) realtime payload — `EventsScreen`'s `registrados`/`es_gratuito`/status, `CatalogScreen`'s catalog-side derived fields — it must do a full refetch instead. `SightingsScreen` merges because Task 5 enriches its payload to include everything `mapAvistamientoFromApi` needs; `EventsScreen`/`CatalogScreen` refetch because enriching their payloads to the same degree would mean duplicating `_serializar_eventos`-style server logic client-side, with real drift risk. This is a deliberate rule, not an inconsistency — apply it the same way if a 4th screen is ever wired to this system.
- Follow existing patterns: routers live in `app/routers/`, tests in `test/` using the sqlite-in-memory `conftest.py` override.
- **Server health is the priority over speed.** Tasks 1-7 only touch local code/tests/local `docker-compose.yml` — never the real droplets. Only Task 8 deploys, and only after Tasks 1-7 are green.
- **Bastion access to the private droplet**, needed for Task 8's deploy/verification steps: the private droplet no longer accepts direct SSH from the internet (confirmed timeout, sesión 2026-08-02). All access goes through the public droplet as jump host, key `sway_deploy`:
  ```bash
  ssh -i ~/.ssh/sway_deploy -o ProxyCommand="ssh -i ~/.ssh/sway_deploy -W %h:%p root@146.190.136.236" root@10.124.0.3
  ```
  (`-J`/ProxyJump on the command line does not inherit `-i` for the intermediate hop — use `ProxyCommand` as above, not `-J`.) UFW on the private droplet only accepts port 22 from the public droplet's VPC IP (`10.124.0.2`); password auth is disabled there.
- **Rollback for this phase**: Task 8's deploy adds zero DB schema changes (unlike the push-notifications plan, this one adds no tables). Reverting `api1`/`api2` to the pre-Redis commit and re-running `docker compose up -d --build api1 api2` is safe either direction — old code doesn't know about Redis/`/api/ws` either way. Cleanup beyond that (optional, not required for safety): stop/remove the `redis` container; leaving `timeout tunnel` in `haproxy.cfg` is harmless if reverted code no longer uses websockets.

---

### Task 1: Redis infrastructure

**Files:**
- Modify: `docker-compose.private.yml` (add `redis` service, both `api1`/`api2` get `REDIS_URL`)
- Modify: `docker-compose.yml` (reference/local file — add the same `redis` service for local dev parity, matching how `uploads_data` was added to both compose files previously)
- Modify: `requirements.txt`
- Modify: `haproxy/haproxy.cfg` (add `timeout tunnel`)

**Interfaces:**
- Produces: a running `redis` container reachable at `redis://redis:6379` from both API containers; `REDIS_URL` env var available to `app/services/realtime_publish.py` and `app/realtime/redis_bridge.py` (Tasks 2-4).

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
    mem_limit: 64m
    networks:
      - data_network
```

`mem_limit: 64m` is a cheap guardrail specific to this service: the private droplet is documented elsewhere in this project (`docs/PI_REQUIREMENTS_VERIFICATION.md`) as RAM-tight (~1.9GB total, `cadvisor` was dropped from monitoring for exactly this reason), and unlike Postgres/the API containers, Redis pub/sub with slow or no subscribers can in theory buffer messages unboundedly — it has no natural memory ceiling of its own the way a fixed dataset does. No other service in this file has a memory limit; this is the first genuinely open-ended one.

And add `REDIS_URL: redis://redis:6379` to both `api1` and `api2`'s `environment:` blocks (alongside the existing `DATABASE_URL`/`CORS_ORIGINS`/`UPLOAD_DIR`), and add to both containers' `depends_on:` (in addition to the existing `postgres:` entry):

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
```

`service_started` only confirms the Redis container process started, not that Redis is accepting connections yet — this is a real but harmless gap given how Task 2/Task 4's code is written: both the publish helper and the subscriber connect lazily and retry/swallow failures rather than crashing on a not-yet-ready Redis, so a cold-start race here never cascades into an API outage.

- [ ] **Step 3: Mirror the same service in `docker-compose.yml` — NOT a verbatim copy**

`docker-compose.yml` (the local reference file) is structured differently from `docker-compose.private.yml`: it has **no top-level `networks:` block** (plain default bridge network) and its API services are named `api_1`/`api_2` (underscore, not `api1`/`api2`). Copying Step 2's redis block as-is — including `networks: - data_network` — fails compose validation here, since `data_network` doesn't exist in this file.

Add this reduced block instead (no `networks:` key):

```yaml
  redis:
    image: redis:alpine
    container_name: sway_redis
    restart: unless-stopped
    mem_limit: 64m
```

And add `REDIS_URL: redis://redis:6379` + `depends_on: redis: condition: service_started` to `api_1`/`api_2` in this file, matching their actual service names.

- [ ] **Step 4: Add `timeout tunnel` to HAProxy**

In `haproxy/haproxy.cfg`, in the `defaults` section, after `timeout server 30s`, add:

```
    timeout tunnel 1h
```

Without this, HAProxy drops any WebSocket idle for 30s (falls back to `timeout client`/`timeout server`), which Task 4/Task 6 will otherwise mask as "flaky mobile network."

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

### Task 2: Backend publish helper

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

### Task 3: WebSocket connection manager

**Files:**
- Create: `app/realtime/__init__.py` (empty)
- Create: `app/realtime/manager.py`
- Test: `test/test_realtime_manager.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `manager` (singleton `ConnectionManager` instance) with `connect(websocket) -> bool`, `disconnect(websocket)`, `async broadcast(message: dict)`. `connect()` returns `False` (and does not register the socket) if the connection cap is already reached. Used by Task 4's subscriber and WS endpoint.

**Note on the connection cap:** this is here, not deferred, because of a real finding from security review: `/api/ws` is deliberately registered without this project's usual api-key gate (Task 4), and Starlette's `BaseHTTPMiddleware` — which is how `slowapi`'s rate limiter is wired into this app — does not intercept the `"websocket"` ASGI scope at all, only `"http"`. That means every other route in this API gets a 100/minute-per-IP floor "for free"; `/api/ws` gets none of it unless this task adds one. Combined with self-registration being open to anyone (a free JWT in seconds) and an otherwise-unbounded `set()` of connections, a single account could open unlimited concurrent sockets and hold them open indefinitely, which both exhausts server file descriptors/memory and makes every subsequent `broadcast()` call slower (it iterates the whole flooded set). A hard cap in the manager itself is the simplest fix that doesn't require re-plumbing `slowapi` into the websocket scope.

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


def test_connect_rejects_past_the_cap():
    mgr = ConnectionManager(max_connections=2)
    ws1, ws2, ws3 = AsyncMock(), AsyncMock(), AsyncMock()
    assert mgr.connect(ws1) is True
    assert mgr.connect(ws2) is True
    assert mgr.connect(ws3) is False
    assert ws3 not in mgr.active
    assert len(mgr.active) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest test/test_realtime_manager.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.realtime'`.

- [ ] **Step 3: Write the implementation**

Create `app/realtime/__init__.py` (empty file).

Create `app/realtime/manager.py`:

```python
DEFAULT_MAX_CONNECTIONS = 500


class ConnectionManager:
    def __init__(self, max_connections: int = DEFAULT_MAX_CONNECTIONS):
        self.active = set()
        self.max_connections = max_connections

    def connect(self, websocket) -> bool:
        if len(self.active) >= self.max_connections:
            return False
        self.active.add(websocket)
        return True

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

`DEFAULT_MAX_CONNECTIONS = 500` is a generous cap for this project's actual scale (a handful of collaborators, not a high-traffic system) — high enough to never bother a real user, low enough to bound the worst case from a single compromised or malicious account.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest test/test_realtime_manager.py -v`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add app/realtime/__init__.py app/realtime/manager.py test/test_realtime_manager.py
git commit -m "feat: ConnectionManager con tope de conexiones para relay local de eventos websocket"
```

---

### Task 4: Redis subscriber bridge + WebSocket endpoint

**Files:**
- Create: `app/realtime/redis_bridge.py`
- Create: `app/routers/realtime.py`
- Modify: `app/main.py` (register the WS router without the API-key dependency, start the subscriber task on startup)
- Test: `test/test_realtime_ws.py`

**Interfaces:**
- Consumes: `manager` (Task 3), `decode_token` from `app.security.auth` (existing).
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


def _seed_usuario_and_token(token_type="colaborador"):
    db = TestSession()
    usuario = Usuario(nombre="WS", apellido_paterno="Test", email=f"ws.test.{token_type}@demo-sway.com", activo=True)
    db.add(usuario)
    db.commit()
    usuario_id = usuario.id
    db.close()
    token = create_token({"sub": str(usuario_id), "token_type": token_type})
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


def test_ws_closes_with_wrong_token_type():
    token = _seed_usuario_and_token(token_type="tienda")
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        try:
            ws.receive_text()
            assert False, "expected connection to close"
        except Exception:
            pass
    assert len(manager.active) == 0


def test_ws_accepts_valid_colaborador_token_and_registers_connection():
    import time
    token = _seed_usuario_and_token(token_type="colaborador")
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        # send_json only enqueues the message — poll instead of a fixed sleep, since
        # nothing guarantees the server coroutine has processed it within any fixed window.
        for _ in range(40):
            if manager.active:
                break
            time.sleep(0.05)
        assert len(manager.active) == 1
    assert len(manager.active) == 0  # cleaned up after the context manager closes the socket
```

Note: `manager` is a process-wide singleton shared across every test in this file and in `test/test_realtime_manager.py` (Task 3). None of these tests reset it between runs — safe under default sequential `pytest`, but not safe under parallel execution (`pytest-xdist`) or a partial/selective test run, since a prior failing test could leave a stale connection that trips a later exact-count assertion. Run this suite sequentially.

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
ALLOWED_TOKEN_TYPES = ("colaborador", "tienda")


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
        payload = decode_token(first_message["token"])
    except Exception:
        await websocket.close(code=4001)
        return

    if payload.get("token_type") not in ALLOWED_TOKEN_TYPES:
        await websocket.close(code=4001)
        return

    if not manager.connect(websocket):
        await websocket.close(code=1013)  # 1013 = "Try Again Later" (RFC 6455)
        return

    try:
        while True:
            await websocket.receive_text()  # client pings to keep the tunnel alive; ignored
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
```

Two things added here beyond the base auth flow, both tracing to security review findings: (1) `payload.get("token_type") not in ALLOWED_TOKEN_TYPES` — without this, `decode_token` alone doesn't distinguish which kind of account authenticated the socket, unlike every REST endpoint in this codebase (`get_current_colaborador`/`get_current_tienda_user` both filter by type); leaving it unchecked would mean any valid JWT of any type gets the realtime feed, which is more permissive than the rest of the API and cheapens the cost of the connection-flood risk in Task 3; (2) `manager.connect(websocket)` returning `False` past the cap closes with code `1013` (RFC 6455's "try again later") rather than silently accepting an unbounded number of sockets.

Auth is validated once at connect time via first-message JWT (never a `?token=` query string, per the spec's HAProxy-log finding). `decode_token` raising `HTTPException` on an invalid/expired token is caught here as a generic `Exception` and treated as an auth failure close — the websocket protocol can't return an HTTP status code mid-handshake, so a close code (`4001`) is the equivalent signal.

- [ ] **Step 5: Register the router and startup task in `app/main.py`**

Add the import (line ~15, alongside the other router imports):

```python
from app.routers import auth, colaboradores, especies, productos, pedidos, eventos, estadisticas, direcciones, catalogos, push, realtime
```

Register the router **without** `dependencies=_api_key_dep` (React Native's native `WebSocket` can't reliably send the custom `x-api-key` header this project's REST clients use — auth here is the first-message JWT instead, now including a token-type check, per Step 4 above):

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
Expected: PASS — 4/4.

- [ ] **Step 7: Run the full backend test suite to confirm no regressions**

Run: `pytest test/ -v`
Expected: all pre-existing tests still pass (same count as before this task, plus the new ones from Tasks 2, 3, 4).

- [ ] **Step 8: Commit**

```bash
git add app/realtime/redis_bridge.py app/routers/realtime.py app/main.py test/test_realtime_ws.py
git commit -m "feat: endpoint WS /api/ws con auth por primer mensaje, tope de conexiones y subscriber Redis con reconexion"
```

---

### Task 5: Wire `publish_event` into the mutating endpoints

**Files:**
- Modify: `app/routers/estadisticas.py` (`reportar_avistamiento` line ~157, `eliminar_avistamiento` line ~214)
- Modify: `app/routers/eventos.py` (`crear_evento` line ~125, `eliminar_evento` line ~200)
- Modify: `app/routers/especies.py` (`create_especie` line ~384, `update_especie` line ~480, `delete_especie` line ~575)
- Test: `test/test_realtime_publish_wiring.py`

**Interfaces:**
- Consumes: `publish_event` (Task 2).

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


def test_eliminar_avistamiento_publishes_avistamiento_deleted():
    from app.security.auth import get_current_colaborador
    especie_id = _seed_especie()
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    try:
        create_resp = client.post("/api/reportar-avistamiento", json={
            "id_especie": especie_id,
            "fecha_avistamiento": "2026-08-01T10:00:00",
            "latitud": 10.5,
            "longitud": -20.5,
            "nombre_usuario": "Test Usuario",
            "email_usuario": "realtime.delete@demo-sway.com",
        })
        avistamiento_id = create_resp.json()["id"]

        with patch("app.routers.estadisticas.publish_event") as mock_publish:
            resp = client.delete(f"/api/avistamientos/{avistamiento_id}")
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("avistamiento_deleted", {"id": avistamiento_id})
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


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


def test_create_especie_publishes_especie_created():
    from app.security.auth import get_current_colaborador
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    db = TestSession()
    estado = EstadoConservacion(nombre="Vulnerable")
    db.add(estado)
    db.commit()
    estado_id = estado.id
    db.close()
    try:
        with patch("app.routers.especies.publish_event") as mock_publish:
            resp = client.post("/api/especies", json={
                "nombre_comun": "Ballena Jorobada",
                "nombre_cientifico": "Megaptera novaeangliae",
                "id_estado_conservacion": estado_id,
            })
        assert resp.status_code == 200
        mock_publish.assert_called_once()
        event_type, event_payload = mock_publish.call_args[0]
        assert event_type == "especie_created"
        assert event_payload["id"] == resp.json()["especie_id"]
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_update_especie_publishes_especie_updated():
    from app.security.auth import get_current_colaborador
    especie_id = _seed_especie()
    app.dependency_overrides[get_current_colaborador] = lambda: {"colaborador_id": 1, "token_type": "colaborador"}
    try:
        with patch("app.routers.especies.publish_event") as mock_publish:
            resp = client.put(f"/api/especies/{especie_id}", json={
                "nombre_comun": "Delfin Actualizado",
                "nombre_cientifico": "Delphinus delphis",
                "id_estado_conservacion": None,
            })
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("especie_updated", {"id": especie_id, "nombre_comun": "Delfin Actualizado"})
    finally:
        app.dependency_overrides.pop(get_current_colaborador, None)


def test_crear_evento_publishes_evento_created():
    from app.data.models import TipoEvento, Modalidad

    db = TestSession()
    tipo = TipoEvento(nombre="Taller")
    modalidad = Modalidad(nombre="Presencial")
    db.add_all([tipo, modalidad])
    db.commit()
    tipo_id, modalidad_id = tipo.id, modalidad.id
    db.close()

    with patch("app.routers.eventos.publish_event") as mock_publish:
        resp = client.post("/api/eventos/crear", json={
            "titulo": "Limpieza de playa de prueba",
            "descripcion": "Evento de prueba para wiring de realtime",
            "fecha_evento": "2026-12-01",
            "hora_inicio": "09:00",
            "id_tipo_evento": tipo_id,
            "id_modalidad": modalidad_id,
            "contacto": "evento.wiring@demo-sway.com",
        })
    assert resp.status_code == 200
    mock_publish.assert_called_once()
    event_type, event_payload = mock_publish.call_args[0]
    assert event_type == "evento_created"
    assert event_payload["id"] == resp.json()["evento_id"]


def test_eliminar_evento_publishes_evento_deleted():
    from datetime import date, time
    from app.data.models import TipoEvento, Modalidad, Estatus, Evento

    db = TestSession()
    tipo = TipoEvento(nombre="Conferencia")
    modalidad = Modalidad(nombre="Virtual")
    estatus = Estatus(nombre="Activo")
    db.add_all([tipo, modalidad, estatus])
    db.commit()
    evento = Evento(
        titulo="Evento a eliminar", descripcion="Prueba de wiring",
        fecha_evento=date(2026, 12, 1), hora_inicio=time(10, 0),
        id_tipo_evento=tipo.id, id_modalidad=modalidad.id,
        capacidad_maxima=10, costo=0, id_estatus=estatus.id,
    )
    db.add(evento)
    db.commit()
    evento_id = evento.id
    db.close()

    from app.security.auth import get_optional_organizador_user
    app.dependency_overrides[get_optional_organizador_user] = lambda: {"sub": "1", "token_type": "colaborador"}
    try:
        with patch("app.routers.eventos.publish_event") as mock_publish:
            resp = client.delete(f"/api/eventos/{evento_id}")
        assert resp.status_code == 200
        mock_publish.assert_called_once_with("evento_deleted", {"id": evento_id})
    finally:
        app.dependency_overrides.pop(get_optional_organizador_user, None)
```

Every one of the 7 mutating call sites this task wires (avistamiento create/delete, evento create/delete, especie create/update/delete) now has its own test — an earlier review round added 4 tests but missed `avistamiento_deleted`, which would have shipped a claimed-but-unverified constraint (the plan's own coverage claim was factually wrong at 6/7 while saying 7/7). This round closes that gap.

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
            "especie_nombre": especie.nombre_comun,
            "especie_cientifica": especie.nombre_cientifico,
            "email_usuario": user.email,
        })
```

**Payload includes `especie_nombre`/`especie_cientifica`/`email_usuario`, not just the raw column values.** `especie` and `user` are already loaded a few lines above this exact insertion point in `reportar_avistamiento` — reuse them, don't re-query. This isn't optional enrichment: `SightingsScreen.js`'s `mapAvistamientoFromApi` reads `a.especie_nombre` into `species` and `a.reportado_por || a.email_usuario` into `reporter`, and the screen's search filter calls `s.species.toLowerCase()`/`s.reporter.toLowerCase()` unconditionally whenever the search box is non-empty. A thinner payload (just `id`/`id_especie`/`fecha`/`notas`) produces `species: undefined`, and a realtime event landing while the user has typed a search term crashes the tab on `undefined.toLowerCase()` — a real runtime bug, not a cosmetic gap. Task 7's merge code below relies on this richer shape, per the merge-vs-refetch rule in Global Constraints.

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
Expected: PASS — 8/8.

- [ ] **Step 7: Run the full backend suite**

Run: `pytest test/ -v`
Expected: all tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add app/routers/estadisticas.py app/routers/eventos.py app/routers/especies.py test/test_realtime_publish_wiring.py
git commit -m "feat: publica eventos realtime en creacion/eliminacion de avistamientos, eventos y especies"
```

---

### Task 6: Mobile `RealtimeProvider` + reconnect/resync hook

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

This is a hand-rolled reconnect/backoff/auth-handshake rather than a library like socket.io-client — deliberately: socket.io would need a matching server-side library (not a bare `WS` endpoint), and its handshake conventions don't map cleanly onto "first message must be an auth frame," which was chosen specifically to keep JWTs out of HAProxy's access logs. The ~60 lines above are smaller and simpler to maintain for a one-person project than adapting a general-purpose library's assumptions to this project's specific auth constraint.

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

### Task 7: Wire screens to merge realtime events

**Files:**
- Create: `MockupsSwayMobile/src/context/realtimeMerge.js` (pure merge functions, unit-testable without a full RN test harness)
- Create: `MockupsSwayMobile/src/context/realtimeMerge.test.js`
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js` (fetch effect is at line ~92-100)
- Modify: `MockupsSwayMobile/src/screens/EventsScreen.js` (uses `useFocusEffect`, line ~114)
- Modify: `MockupsSwayMobile/src/screens/CatalogScreen.js` (fetch effect is at line ~120)

**Interfaces:**
- Consumes: `useRealtime()` (Task 6), each screen's existing `mapAvistamientoFromApi`/`mapEventoFromApi`/`mapEspecieFromApi` functions (already defined in each file) and existing fetch functions (`getAvistamientosMine`/`getAvistamientosAll`, `getEventos`/`getEventosMine`, `getEspecies`).
- Produces: `mergeAvistamientoCreated(prev, mapped)` / `removeById(prev, id)` — pure array functions, exported for testing, used by `SightingsScreen`'s merge path per the merge-vs-refetch rule (Global Constraints).

`MockupsSwayMobile/package.json` has no test runner (no `jest`, no `test` script) — standing one up just for this would be scope creep the project doesn't otherwise need. But the merge logic itself (dedupe-by-id, prepend, filter) is pure array logic with zero JSX/hook dependency once separated from `useState`/`subscribe`, so it can be tested with plain Node and the built-in `assert` module — the same zero-new-dependency pattern this project already uses for `scripts/send_broadcast.py` and `scripts/verify_pi_requirements.sh`. This catches a real regression class (off-by-one dedupe, wrong field name in a filter) without adding a test harness.

- [ ] **Step 1: Extract and test the pure merge functions**

Create `MockupsSwayMobile/src/context/realtimeMerge.js`:

```javascript
export function mergeAvistamientoCreated(prev, mapped) {
  if (prev.some((s) => s.id === mapped.id)) return prev;
  return [mapped, ...prev];
}

export function removeById(prev, id) {
  return prev.filter((s) => s.id !== id);
}
```

Create `MockupsSwayMobile/src/context/realtimeMerge.test.js` (plain Node script, run with `node`, not a test framework):

```javascript
const assert = require('assert');
const { mergeAvistamientoCreated, removeById } = require('./realtimeMerge');

// mergeAvistamientoCreated: prepends a new item
{
  const prev = [{ id: 2, species: 'B' }];
  const result = mergeAvistamientoCreated(prev, { id: 1, species: 'A' });
  assert.deepStrictEqual(result, [{ id: 1, species: 'A' }, { id: 2, species: 'B' }]);
}

// mergeAvistamientoCreated: dedupes by id, does not double-insert
{
  const prev = [{ id: 1, species: 'A' }];
  const result = mergeAvistamientoCreated(prev, { id: 1, species: 'A (duplicate)' });
  assert.strictEqual(result, prev); // same reference: no-op, not a mutated copy
  assert.strictEqual(result.length, 1);
}

// removeById: removes the matching item, leaves others untouched
{
  const prev = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const result = removeById(prev, 2);
  assert.deepStrictEqual(result, [{ id: 1 }, { id: 3 }]);
}

// removeById: no-op if id not present
{
  const prev = [{ id: 1 }];
  const result = removeById(prev, 999);
  assert.deepStrictEqual(result, [{ id: 1 }]);
}

console.log('realtimeMerge.test.js: all assertions passed');
```

- [ ] **Step 2: Run the pure-function test**

Run: `node MockupsSwayMobile/src/context/realtimeMerge.test.js`
Expected: prints `realtimeMerge.test.js: all assertions passed`, exits 0.

- [ ] **Step 3: Wire `SightingsScreen.js`**

Add the imports:

```javascript
import { useRealtime } from '../context/RealtimeContext';
import { mergeAvistamientoCreated, removeById } from '../context/realtimeMerge';
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
        setSightings((prev) => mergeAvistamientoCreated(prev, mapAvistamientoFromApi(message.payload)));
      }
      if (message.type === 'avistamiento_deleted') {
        setSightings((prev) => removeById(prev, message.payload.id));
      }
    });
    return unsubscribe;
  }, [showMineOnly]);
```

This mirrors the existing focus-refetch's `showMineOnly` dependency (a `resync` after reconnect should refetch honoring whichever toggle is currently active, same as the existing effect already does). `mapAvistamientoFromApi` reads `a.especie_nombre` (into `species`) and `a.reportado_por || a.email_usuario` (into `reporter`) — Task 5's payload was corrected to include `especie_nombre`/`especie_cientifica`/`email_usuario` specifically so this mapping doesn't produce `undefined`, which would otherwise crash this screen's search filter (`s.species.toLowerCase()` runs unconditionally once the user has typed anything). Do not slim the payload back down without also guarding the search filter against undefined fields. This screen merges (per the Global Constraints rule) because the enriched payload is now sufficient to reconstruct everything the screen displays.

- [ ] **Step 4: Wire `EventsScreen.js`**

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

A full refetch (rather than a merge) is used here per the Global Constraints rule: `_serializar_eventos` computes `registrados`/`es_gratuito`/status server-side, and this screen already has a `sortEventos` helper expecting the full mapped shape — reconstructing that client-side from the smaller realtime payload would duplicate server logic and risk drifting from it.

This effect's `[]` dependency array (unlike `SightingsScreen`'s `[showMineOnly]`-keyed one) is intentional today, not an oversight: `getEventos()` takes no filter argument the way `getAvistamientosMine`/`getAvistamientosAll` do. If a future change adds a filter-dependent variant to this screen (mirroring how Sightings has `showMineOnly`), this dependency array needs to grow to match, the same way Sightings' effect already does — don't "clean up" this asymmetry without checking whether a filter was added first.

- [ ] **Step 5: Wire `CatalogScreen.js`**

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

Same reasoning as `EventsScreen`: full refetch on any catalog-affecting event, per the Global Constraints merge-vs-refetch rule — simplest correct option given the catalog's existing fetch already returns the full mapped list, and no derived-field enrichment was added to the `especie_*` realtime payloads (Task 5) to justify a merge here.

- [ ] **Step 6: Manual verification — two-device test**

With the backend running locally (Postgres + Redis + `uvicorn`), open the app on two devices/simulators logged in as different (or the same) collaborator.
- On Device A, report an avistamiento. Confirm it appears on Device B's `SightingsScreen` without navigating away and back.
- On Device A, **delete** an avistamiento (this checklist previously only covered creation — deletion needs its own manual check since it exercises a different code path, `removeById`, not `mergeAvistamientoCreated`). Confirm it disappears from Device B's `SightingsScreen` live.
- Repeat creation for an event (Device B's `EventsScreen`) and for creating/editing a species via `CatalogScreen`'s existing form (Device B's `CatalogScreen`).

- [ ] **Step 7: Commit**

```bash
git add MockupsSwayMobile/src/context/realtimeMerge.js MockupsSwayMobile/src/context/realtimeMerge.test.js MockupsSwayMobile/src/screens/SightingsScreen.js MockupsSwayMobile/src/screens/EventsScreen.js MockupsSwayMobile/src/screens/CatalogScreen.js
git commit -m "feat: pantallas de avistamientos/eventos/especies se actualizan en vivo via websocket"
```

---

### Task 8: Phase 2 production deploy + cross-replica verification

**Files:** none (infra/ops task, no code changes)

- [ ] **Step 1: Deploy Redis + updated HAProxy config**

On the private droplet: `git pull && docker compose -f docker-compose.private.yml up -d redis api1 api2`.

On the public droplet (HAProxy runs here per the existing 2-droplet architecture): `git pull`, then restart the `haproxy` container to pick up the new `timeout tunnel` line — this project's HAProxy config changes need a container restart, not a hot reload (check `docs/DEPLOYMENT_2_DROPLETS.md` for the exact command already documented). **Do this during a low-traffic window and say so beforehand**: `https_front` on port 443 is the single ingress for everything this project serves — the REST API, the Flask/portal web, and Grafana all sit behind this one HAProxy process (confirmed: one frontend, path-based ACLs, one `default_backend`). A container restart drops every in-flight request across all of those for the few seconds it's down, not just websocket connections — this is different from the `api1`/`api2` restart below, which this project has always accepted as a normal brief-outage deploy step; HAProxy itself has never been restarted before in this project's deploy history, so there's no existing precedent to lean on here.

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

This needs a concrete, reproducible request, not an ad hoc one — an engineer using a stale/nonexistent `id_especie` would get a `400` before anything publishes, making the test silently pass as "no message received because nothing happened" rather than "because Redis relay is broken," a false negative that would rubber-stamp a broken cross-replica path. First, get a real `especie_id` and a valid `colaborador` JWT to use:

```bash
docker exec -i sway_postgres psql -U sway_app -d sway -c "SELECT id, nombre_comun FROM especies LIMIT 1;"
```

Note the returned `id` (call it `<ESPECIE_ID>` below). Get a valid token by logging in as an existing test collaborator account (or registering a fresh one via `POST /api/colaboradores/register`), and note the `access_token` from the response (call it `<TOKEN>` below).

Using two separate WS clients pinned to different replicas directly (bypassing HAProxy, same pattern already used for the rate-limiting test in `scripts/verify_pi_requirements.sh`): connect one client directly to `api1` (`ws://10.124.0.3:8001/api/ws`) and another directly to `api2` (`ws://10.124.0.3:8002/api/ws`), both sending `{"type": "auth", "token": "<TOKEN>"}` as their first frame. Then trigger a real avistamiento creation via `curl` against the public domain (goes through HAProxy, lands on whichever replica):

```bash
curl -X POST https://proyecto-sway.site/api/reportar-avistamiento \
  -H "x-api-key: <real api key>" -H "Content-Type: application/json" \
  -d '{"id_especie": <ESPECIE_ID>, "fecha_avistamiento": "2026-08-04T10:00:00", "latitud": 10.5, "longitud": -20.5, "nombre_usuario": "Verificacion Cross-Replica", "email_usuario": "crossreplica.verify@demo-sway.com"}'
```

**Wait up to 10 seconds per client.** If either client has not received the `avistamiento_created` message by then, the cross-replica relay is broken — this fixed window is what makes the test's pass/fail answer reproducible between two different engineers running it, rather than an open-ended "confirm it works."

- [ ] **Step 5: Idle-timeout verification**

Using `websocat` (a small dependency-free CLI WebSocket client; install via `cargo install websocat` or the project's package manager if not present) rather than a browser console or another tool with its own keepalive/ping behavior that could mask what's actually being tested:

```bash
websocat wss://proyecto-sway.site/api/ws
```

Send nothing after connecting. Leave it open and idle for at least 45 seconds. Confirm the connection is still open (proves `timeout tunnel` is actually taking effect in the deployed config, not just present in the source file) — before Task 1's fix, this would have dropped at 30s. Naming a specific tool here (rather than "a WS client") is what makes two different engineers' runs of this step comparable.

- [ ] **Step 6: Add this feature to `docs/PI_REQUIREMENTS_VERIFICATION.md`**

This is new functionality beyond the original 14-point rubric — add a short new section documenting what was built (push registration + broadcast script, realtime sync architecture) and how to verify it, following this doc's existing style (file:line references, copy-paste `curl`/`psql` commands). Commit alongside `progress.md` updates once this phase is confirmed working end-to-end.

---

## Self-Review Notes

- **Spec coverage:** every Phase 2 architecture bullet from the spec maps to a task above — Redis container + `timeout tunnel` (Task 1), publish helper (Task 2), connection manager with a connection cap (Task 3), first-message-auth WS endpoint with token-type validation + subscriber reconnect loop (Task 4), all 7 message types including `especie_deleted`/`avistamiento_deleted` wired into every mutating endpoint with test coverage for all 7 (Task 5), mobile provider with reconnect + resync-on-reconnect (Task 6), per-screen merge with the merge-vs-refetch rule codified and pure-function test coverage (Task 7), cross-replica + idle-timeout verification with concrete reproducible steps (Task 8). The two "accepted, not fixed" items from spec review (no push-token cleanup, no push-token-ownership validation) live in the push-notifications plan, not here.
- **Type consistency check:** `publish_event(event_type: str, payload: dict)` signature (Task 2) matches every call site in Task 5. `manager.connect(websocket) -> bool` / `manager.broadcast(message: dict)` (Task 3) matches how `redis_bridge.py` and the WS endpoint (Task 4) call them. Mobile `subscribe(callback)` (Task 6) matches every screen's usage in Task 7 (`const unsubscribe = subscribe((message) => {...})`); `mergeAvistamientoCreated`/`removeById` (Task 7 Step 1) match their usage in Task 7 Step 3.
- **No placeholders:** every step above contains complete, runnable code.
- **Split from the original combined plan:** this file was split out of a single Phase 1 + Phase 2 plan document (`docs/superpowers/plans/2026-08-04-push-notifications-and-realtime-sync.md`, superseded by this file and `2026-08-04-push-notifications.md`) on tech-lead review recommendation — see that file's Global Constraints for the reasoning.
- **Specialist review findings folded in (multiple review rounds, most recent = exhaustive 4-agent pass covering security, QA, DevOps, and architecture):**
  - **Security:** `/api/ws` previously had no rate limit or connection cap (Starlette's `BaseHTTPMiddleware`, which is how `slowapi` is wired into this app, doesn't intercept the websocket ASGI scope at all) and didn't validate `token_type` — together, a real DoS path via one free self-registered account opening unbounded sockets. Fixed with a hard connection cap in `ConnectionManager` (Task 3) and a `token_type` check in the WS endpoint (Task 4).
  - **QA:** `avistamiento_deleted` was completely untested despite the plan's own coverage claim saying otherwise (6 of 7 call sites tested, claimed 7/7) — added in Task 5, now genuinely 8/8 including both the create-success and create-validation-failure cases. Task 7's manual verification checklist now explicitly includes a deletion check, not just creation. Task 8's cross-replica and idle-timeout verification steps were vague enough that two engineers could reach different pass/fail conclusions — both now specify exact commands, a known-good `id_especie` lookup, a fixed wait window, and a named tool (`websocat`).
  - **DevOps:** the HAProxy container restart (Task 8 Step 1) drops all in-flight traffic app-wide (not just websockets, since it's the single ingress for everything) — now flagged to happen during low-traffic hours, distinguished from the already-accepted `api1`/`api2` restart pattern. Rollback mechanics (trivial here, since this phase adds no DB schema) are now stated explicitly rather than left implicit. The new `redis` container got a `mem_limit: 64m` guardrail given this droplet's documented tight RAM headroom.
  - **Architecture/tech-lead:** the merge-vs-refetch asymmetry between `SightingsScreen` (merges) and `EventsScreen`/`CatalogScreen` (refetch) is now codified as an explicit rule in Global Constraints rather than left as three screens making three separate-looking calls — confirmed on review to be the *correct* response to a real difference in what each screen's realtime payload can support, not an arbitrary inconsistency. `EventsScreen`'s `[]` dependency array (an asymmetry vs. Sightings' `[showMineOnly]`) is now called out as intentional given today's param-free `getEventos()`, so it isn't "fixed" into unneeded complexity later. The single generic `/api/ws` channel and the hand-rolled reconnect logic were both reviewed and confirmed as the right-sized call for this project's actual scale (one developer, session-based iteration, no high-traffic evidence anywhere in this project's history) — no changes made there.
