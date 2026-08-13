# Job Tracker Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-user job tracker into a multi-user proof of concept with open self-registration, moved from `/portfolio/` to its own `/jobtracker/` path, while `/portfolio/` reverts to an (still unbuilt) static stub. No UI redesign — the existing login+kanban HTML/JS moves as-is, plus a minimal register form.

**Architecture:** Same `portfolio_api` container, same isolated `docker-compose.portfolio.yml` stack already in production. Add a `users` table and a `user_id` FK on `postulations`. Drop the single hardcoded `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` env-based auth in favor of DB-backed accounts. Add a public, rate-limited `/register` endpoint. Add HAProxy + nginx routing for the new `/jobtracker/` static path (the previous deploy missed the HAProxy half of routing for `/portfolio/` — this plan wires both from the start).

**Tech Stack:** Same as before (FastAPI, `python-jose`, `passlib[bcrypt]`, stdlib `sqlite3`) plus `slowapi` for rate limiting (in-memory storage — this container has a single replica, unlike the main SWAY API's Redis-backed limiter, so no Redis dependency needed).

## Global Constraints

- No changes to `docker-compose.public.yml`'s existing SWAY-owned locations/mounts, `docker-compose.private.yml`, or `nginx/portal.conf`'s existing `/portal/`, `/static/`, `/portfolio/` locations — only additive changes.
- No changes to `haproxy.cfg`'s existing ACLs/backends — only additive (new `path_jobtracker` ACL).
- `portfolio_api` stays in its own isolated compose project (`name: portfolio`), joined to `sway_edge_network` — unchanged from the existing deployed setup.
- A user can only ever see/modify their own postulations. Attempting to access another user's postulation id returns 404, never 403 (never confirm the id exists for someone else).
- Open self-registration, rate-limited (~5/hour/IP) to blunt casual bot spam — no email verification, no captcha, no admin approval step.
- The existing production account (`emiliano`, 11 postulations) must survive migration with the same password and the same data, no re-registration needed.

---

### Task 1: Database layer — users table, user_id column, migration script

**Files:**
- Modify: `portfolio_api/db.py`
- Create: `portfolio_api/migrate_multiuser.py`
- Modify: `portfolio_api/test_db.py`

**Interfaces:**
- Consumes: nothing new (extends existing `get_conn`, `init_db`, `seed_postulations`).
- Produces: `init_db()` now also creates `users` and ensures `postulations.user_id` exists (idempotent — safe to call against the already-deployed production DB, which has 11 rows with no `user_id`). New standalone script `migrate_multiuser.py` — run once, manually, during deploy (Task 6) — reads `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` from its own environment, creates that user if missing, backfills any `postulations` row with `user_id IS NULL` to that user's id.

- [ ] **Step 1: Write the failing tests**

Add to `portfolio_api/test_db.py` (append; keep the existing 3 tests unchanged — they still pass, `seed_postulations` behavior is untouched):

```python
def test_init_db_creates_users_table(conn):
    tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }
    assert "users" in tables


def test_init_db_adds_user_id_column_to_postulations(conn):
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(postulations)")}
    assert "user_id" in cols


def test_init_db_is_idempotent_on_user_id_column(conn):
    # Calling init_db twice against the same connection must not raise
    # "duplicate column name" — this is the exact scenario production hits
    # (existing DB already has the column after the first deploy).
    init_db(conn)
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(postulations)")}
    assert "user_id" in cols
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolio_api && python -m pytest test_db.py -v`
Expected: FAIL — `test_init_db_creates_users_table` and `test_init_db_adds_user_id_column_to_postulations` fail (no `users` table, no `user_id` column yet).

- [ ] **Step 3: Modify `portfolio_api/db.py`**

Add the `users` table to `init_db`'s `executescript`, and add a column-existence check + `ALTER TABLE` for `user_id` (SQLite's `CREATE TABLE IF NOT EXISTS` doesn't retroactively add columns to an existing table, so this needs an explicit guarded `ALTER TABLE`):

```python
def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS postulations (
          id TEXT PRIMARY KEY,
          company TEXT NOT NULL,
          role TEXT NOT NULL,
          location TEXT,
          salary TEXT,
          schedule TEXT,
          date_applied TEXT,
          source TEXT,
          requirements TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'postulado',
          created_at TEXT,
          updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT
        );
        """
    )
    conn.commit()
    _ensure_user_id_column(conn)


def _ensure_user_id_column(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(postulations)")}
    if "user_id" not in cols:
        conn.execute(
            "ALTER TABLE postulations ADD COLUMN user_id INTEGER REFERENCES users(id)"
        )
        conn.commit()
```

Place `_ensure_user_id_column` right after `init_db` in the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolio_api && python -m pytest test_db.py -v`
Expected: PASS (6 tests — the original 3 plus the 3 new ones)

- [ ] **Step 5: Write `portfolio_api/migrate_multiuser.py`**

```python
"""One-time migration: single hardcoded user -> users table.

Run manually, once, during the multi-user deploy (see the plan's Task 6):
  docker exec sway_portfolio_api python migrate_multiuser.py

Must run BEFORE PORTFOLIO_USER/PORTFOLIO_PASSWORD_HASH are removed from
.env / docker-compose.portfolio.yml — it reads them directly to create the
legacy account with its existing password hash (no password reset needed).
Safe to run more than once: no-ops if the user already exists.
"""
import os
from datetime import datetime, timezone

from db import get_conn, init_db

PORTFOLIO_USER = os.environ.get("PORTFOLIO_USER", "")
PORTFOLIO_PASSWORD_HASH = os.environ.get("PORTFOLIO_PASSWORD_HASH", "")


def migrate(conn, username: str, password_hash: str) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is not None:
        user_id = row["id"]
    else:
        now = datetime.now(timezone.utc).isoformat()
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, password_hash, now),
        )
        conn.commit()
        user_id = cur.lastrowid
        print(f"Created user '{username}' (id={user_id})")

    updated = conn.execute(
        "UPDATE postulations SET user_id = ? WHERE user_id IS NULL",
        (user_id,),
    ).rowcount
    conn.commit()
    print(f"Backfilled {updated} postulation(s) to user_id={user_id}")
    return user_id


if __name__ == "__main__":
    if not PORTFOLIO_USER or not PORTFOLIO_PASSWORD_HASH:
        raise SystemExit(
            "PORTFOLIO_USER/PORTFOLIO_PASSWORD_HASH not set — run this before "
            "removing them from .env, per the migration step ordering in the plan."
        )
    conn = get_conn()
    init_db(conn)
    migrate(conn, PORTFOLIO_USER, PORTFOLIO_PASSWORD_HASH)
    conn.close()
```

- [ ] **Step 6: Write a test for the migration function**

Append to `portfolio_api/test_db.py`:

```python
def test_migrate_creates_user_and_backfills_postulations(conn):
    conn.execute(
        """INSERT INTO postulations
           (id, company, role, status, created_at, updated_at)
           VALUES ('legacy-1', 'Legacy Co', 'Dev', 'postulado', 'x', 'x')"""
    )
    conn.commit()

    from migrate_multiuser import migrate

    user_id = migrate(conn, "emiliano", "some-bcrypt-hash")
    row = conn.execute(
        "SELECT user_id FROM postulations WHERE id = 'legacy-1'"
    ).fetchone()
    assert row["user_id"] == user_id

    # Idempotent: running again doesn't create a second user or fail
    second_id = migrate(conn, "emiliano", "some-bcrypt-hash")
    assert second_id == user_id
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM users WHERE username = 'emiliano'"
    ).fetchone()["n"]
    assert count == 1
```

- [ ] **Step 7: Run the full test file**

Run: `cd portfolio_api && python -m pytest test_db.py -v`
Expected: PASS (7 tests)

- [ ] **Step 8: Commit**

```bash
git add portfolio_api/db.py portfolio_api/migrate_multiuser.py portfolio_api/test_db.py
git commit -m "feat: add users table, user_id column, and legacy-user migration script"
```

---

### Task 2: Auth layer — token subject becomes user id

**Files:**
- Modify: `portfolio_api/auth.py`
- Modify: `portfolio_api/test_auth.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `create_token(user_id: int) -> str` (was `create_token(username: str)` — signature and semantics change: JWT `sub` claim becomes `str(user_id)` instead of a fixed username string). `hash_password`/`verify_password`/`decode_token`/`get_current_user` unchanged in shape. Callers (Task 3's `main.py`) must do `int(payload["sub"])` to get the user id back.

- [ ] **Step 1: Update the existing test**

Replace the token-roundtrip test in `portfolio_api/test_auth.py` (the rest of the file — password hashing tests, garbage-token test — stays unchanged):

```python
def test_create_and_decode_token_roundtrip():
    token = create_token(42)
    payload = decode_token(token)
    assert payload["sub"] == "42"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd portfolio_api && python -m pytest test_auth.py -v`
Expected: FAIL — `test_create_and_decode_token_roundtrip` fails (current `create_token` treats its argument as a raw string, so `payload["sub"] == "42"` fails since it'd currently receive the int `42` and `jose` would encode it as JSON `42`, not the string `"42"`).

- [ ] **Step 3: Update `portfolio_api/auth.py`**

Change only the `create_token` function (everything else in the file is unchanged):

```python
def create_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
```

- [ ] **Step 4: Run the full test file**

Run: `cd portfolio_api && python -m pytest test_auth.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add portfolio_api/auth.py portfolio_api/test_auth.py
git commit -m "feat: change JWT subject from username to user id"
```

---

### Task 3: API endpoints — registration, DB-backed login, per-user scoping

**Files:**
- Modify: `portfolio_api/main.py`
- Modify: `portfolio_api/models.py`
- Modify: `portfolio_api/requirements.txt`
- Modify: `portfolio_api/test_api.py`
- Modify: `docker-compose.portfolio.yml`

**Interfaces:**
- Consumes: `get_conn`, `init_db`, `seed_postulations` from `db.py` (Task 1); `hash_password`, `verify_password`, `create_token(user_id: int)`, `get_current_user` from `auth.py` (Task 2).
- Produces: `POST /portfolio-api/register` (public, rate-limited), `POST /portfolio-api/login` (public, DB-backed), `GET/POST/PUT/DELETE /portfolio-api/postulations` (JWT-gated, scoped to `user_id`). `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` env vars and their fail-fast check are removed from `main.py` entirely.

- [ ] **Step 1: Add `slowapi` to `portfolio_api/requirements.txt`**

Add one line (matches the main SWAY API's dependency, pinned the same way):

```
slowapi>=0.1.9
```

- [ ] **Step 2: Write the failing tests**

Replace `portfolio_api/test_api.py` in full (the setup block changes — no more `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` env vars, tests register their own users instead):

```python
# portfolio_api/test_api.py
import os
import tempfile

os.environ["PORTFOLIO_DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["PORTFOLIO_JWT_SECRET"] = "test-secret-key-for-tests-only"

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def _register_and_login(username="alice", password="alice-password-123"):
    reg = client.post(
        "/portfolio-api/register", json={"username": username, "password": password}
    )
    assert reg.status_code == 201
    res = client.post(
        "/portfolio-api/login", json={"username": username, "password": password}
    )
    return res.json()["access_token"]


def test_register_success():
    res = client.post(
        "/portfolio-api/register",
        json={"username": "newuser1", "password": "somepassword"},
    )
    assert res.status_code == 201


def test_register_duplicate_username_returns_409():
    client.post(
        "/portfolio-api/register",
        json={"username": "dupuser", "password": "somepassword"},
    )
    res = client.post(
        "/portfolio-api/register",
        json={"username": "dupuser", "password": "differentpassword"},
    )
    assert res.status_code == 409


def test_login_success():
    token = _register_and_login("bob", "bob-password-123")
    assert token


def test_login_wrong_password_returns_401():
    client.post(
        "/portfolio-api/register", json={"username": "carol", "password": "realpass"}
    )
    res = client.post(
        "/portfolio-api/login", json={"username": "carol", "password": "wrong"}
    )
    assert res.status_code == 401


def test_login_unknown_user_returns_401():
    res = client.post(
        "/portfolio-api/login", json={"username": "nobody", "password": "x"}
    )
    assert res.status_code == 401


def test_postulations_requires_auth():
    res = client.get("/portfolio-api/postulations")
    assert res.status_code == 401


def test_postulations_crud_roundtrip():
    token = _register_and_login("dave", "dave-password-123")
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post(
        "/portfolio-api/postulations",
        headers=headers,
        json={
            "id": "test-co",
            "company": "Test Co",
            "role": "QA Intern",
            "location": "Remote",
            "salary": "$1000/mes",
            "schedule": "",
            "date_applied": "2026-08-13",
            "source": "Test",
            "requirements": "curiosity",
            "notes": "",
            "status": "postulado",
        },
    )
    assert create_res.status_code == 201

    list_res = client.get("/portfolio-api/postulations", headers=headers)
    assert any(p["id"] == "test-co" for p in list_res.json())

    update_res = client.put(
        "/portfolio-api/postulations/test-co",
        headers=headers,
        json={"status": "entrevista"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "entrevista"

    delete_res = client.delete("/portfolio-api/postulations/test-co", headers=headers)
    assert delete_res.status_code == 204

    list_after = client.get("/portfolio-api/postulations", headers=headers)
    assert not any(p["id"] == "test-co" for p in list_after.json())


def test_update_unknown_postulation_returns_404():
    token = _register_and_login("erin", "erin-password-123")
    headers = {"Authorization": f"Bearer {token}"}
    res = client.put(
        "/portfolio-api/postulations/does-not-exist",
        headers=headers,
        json={"status": "oferta"},
    )
    assert res.status_code == 404


def test_cross_user_isolation():
    token_a = _register_and_login("frank", "frank-password-123")
    token_b = _register_and_login("grace", "grace-password-123")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    client.post(
        "/portfolio-api/postulations",
        headers=headers_a,
        json={
            "id": "frank-only",
            "company": "Frank Co",
            "role": "Dev",
            "location": "",
            "salary": "",
            "schedule": "",
            "date_applied": "2026-08-13",
            "source": "",
            "requirements": "",
            "notes": "",
            "status": "postulado",
        },
    )

    # B's list doesn't include A's postulation
    list_b = client.get("/portfolio-api/postulations", headers=headers_b)
    assert not any(p["id"] == "frank-only" for p in list_b.json())

    # B can't update A's postulation — 404, not 403
    update_res = client.put(
        "/portfolio-api/postulations/frank-only",
        headers=headers_b,
        json={"status": "oferta"},
    )
    assert update_res.status_code == 404

    # B can't delete A's postulation either
    delete_res = client.delete(
        "/portfolio-api/postulations/frank-only", headers=headers_b
    )
    assert delete_res.status_code == 404

    # A still sees it, untouched
    list_a = client.get("/portfolio-api/postulations", headers=headers_a)
    match = next(p for p in list_a.json() if p["id"] == "frank-only")
    assert match["status"] == "postulado"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd portfolio_api && python -m pytest test_api.py -v`
Expected: FAIL — `/portfolio-api/register` doesn't exist yet (404s), login still expects the old env-based single user.

- [ ] **Step 4: Update `portfolio_api/models.py`**

Add `RegisterRequest` as an alias-by-reuse — same shape as `LoginRequest`, kept as a separate name for endpoint clarity (no behavior difference):

```python
class RegisterRequest(BaseModel):
    username: str
    password: str
```

Add this class right after `LoginRequest` in the file. No other changes to `models.py`.

- [ ] **Step 5: Rewrite `portfolio_api/main.py`**

```python
# portfolio_api/main.py
import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from auth import create_token, get_current_user, hash_password, verify_password
from db import get_conn, init_db, seed_postulations
from models import LoginRequest, PostulationIn, PostulationUpdate, RegisterRequest

app = FastAPI(title="Portfolio API")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Captured once at import time so this module keeps using the same DB file
# even if some other module (e.g. a differently-configured test file
# imported later in the same process) changes PORTFOLIO_DB_PATH afterward.
PORTFOLIO_DB_PATH = os.environ.get("PORTFOLIO_DB_PATH", "/data/portfolio.db")


def _conn():
    return get_conn(PORTFOLIO_DB_PATH)


@app.on_event("startup")
def on_startup():
    conn = _conn()
    init_db(conn)
    seed_postulations(conn)
    conn.close()


# Starlette's TestClient only fires lifespan events when used as a context
# manager; run once at import time too so a plain `TestClient(app)` (no
# `with`) still gets a ready database.
on_startup()


def _row_to_dict(row) -> dict:
    return dict(row)


@app.post("/portfolio-api/register", status_code=201)
@limiter.limit("5/hour")
def register(request: Request, payload: RegisterRequest):
    conn = _conn()
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (payload.username,)
    ).fetchone()
    if existing is not None:
        conn.close()
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (payload.username, hash_password(payload.password), now),
    )
    conn.commit()
    conn.close()
    return {"status": "registered"}


@app.post("/portfolio-api/login")
def login(payload: LoginRequest):
    conn = _conn()
    user = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (payload.username,)
    ).fetchone()
    conn.close()
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    return {"access_token": create_token(user["id"]), "token_type": "bearer"}


@app.get("/portfolio-api/postulations")
def list_postulations(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    conn = _conn()
    rows = conn.execute(
        "SELECT * FROM postulations WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@app.post("/portfolio-api/postulations", status_code=201)
def create_postulation(payload: PostulationIn, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    conn = _conn()
    now = datetime.now(timezone.utc).isoformat()
    data = payload.model_dump()
    conn.execute(
        """INSERT INTO postulations
           (id, company, role, location, salary, schedule, date_applied,
            source, requirements, notes, status, created_at, updated_at, user_id)
           VALUES (:id, :company, :role, :location, :salary, :schedule,
                   :date_applied, :source, :requirements, :notes, :status,
                   :created_at, :updated_at, :user_id)""",
        {**data, "created_at": now, "updated_at": now, "user_id": user_id},
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM postulations WHERE id = ? AND user_id = ?",
        (payload.id, user_id),
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


@app.put("/portfolio-api/postulations/{postulation_id}")
def update_postulation(
    postulation_id: str,
    payload: PostulationUpdate,
    user: dict = Depends(get_current_user),
):
    user_id = int(user["sub"])
    conn = _conn()
    existing = conn.execute(
        "SELECT * FROM postulations WHERE id = ? AND user_id = ?",
        (postulation_id, user_id),
    ).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Postulación no encontrada")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    conn.execute(
        f"UPDATE postulations SET {set_clause} WHERE id = :id AND user_id = :user_id",
        {**updates, "id": postulation_id, "user_id": user_id},
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM postulations WHERE id = ? AND user_id = ?",
        (postulation_id, user_id),
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


@app.delete("/portfolio-api/postulations/{postulation_id}", status_code=204)
def delete_postulation(postulation_id: str, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    conn = _conn()
    existing = conn.execute(
        "SELECT * FROM postulations WHERE id = ? AND user_id = ?",
        (postulation_id, user_id),
    ).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    conn.execute(
        "DELETE FROM postulations WHERE id = ? AND user_id = ?",
        (postulation_id, user_id),
    )
    conn.commit()
    conn.close()
    return None
```

Note: the legacy 11 seed postulations have `user_id IS NULL` until Task 1's `migrate_multiuser.py` runs (Task 6) — until then they're invisible to every account including the migrated `emiliano` user, since all queries filter `user_id = ?` and `NULL` never equals anything. This is expected and resolves itself once the migration script runs during deploy.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd portfolio_api && python -m pytest test_api.py -v`
Expected: PASS (10 tests)

- [ ] **Step 7: Run the full suite**

Run: `cd portfolio_api && python -m pytest -v`
Expected: PASS (all tests across `test_db.py`, `test_auth.py`, `test_api.py`)

- [ ] **Step 8: Remove the now-unused env vars from `docker-compose.portfolio.yml`**

`main.py` no longer reads `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` (Step 5 removed them). Remove the corresponding two lines from the `portfolio-api` service's `environment:` block, leaving:

```yaml
    environment:
      PORTFOLIO_JWT_SECRET: ${PORTFOLIO_JWT_SECRET}
      PORTFOLIO_DB_PATH: /data/portfolio.db
```

Note: `docker exec` uses the target container's OWN environment (set when that container was created from the compose file's `environment:` block) — it does not read `.env` directly and does not re-interpolate anything. Since this step removes `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` from the compose file, any container recreated after this change will not have them at all. Task 6's runbook accounts for this: it captures the two values from the OLD, still-running container (which has them correctly, since the original single-user deploy's `docker compose up` already un-escaped the `$$`-escaped hash into the container's live environment) BEFORE rebuilding, then passes them explicitly to the migration step via `docker exec -e`. This sidesteps a subtler trap: re-reading `.env`'s raw text with a shell script would pick up the literal `$$`-escaped hash (meaningful only to docker-compose's own interpolation, not to bash), silently corrupting it the same way the original deploy's bug did.

- [ ] **Step 9: Commit**

```bash
git add portfolio_api/main.py portfolio_api/models.py portfolio_api/requirements.txt portfolio_api/test_api.py docker-compose.portfolio.yml
git commit -m "feat: add open self-registration and scope postulations to the authenticated user"
```

---

### Task 4: Routing — `/jobtracker/` through nginx and HAProxy

**Files:**
- Modify: `nginx/portal.conf`
- Modify: `docker-compose.public.yml`
- Modify: `haproxy/haproxy.cfg`

**Interfaces:**
- Consumes: nothing new from earlier tasks (pure routing config).
- Produces: `/jobtracker/` reachable end-to-end (HAProxy → nginx-portal → static files), same pattern `/portfolio/` already uses. `/portfolio-api/` stays unchanged (already routed).

This task exists because the original `/portfolio/` deploy discovered — only by actually deploying — that HAProxy routing is a separate layer from nginx routing, and both must be updated together or the new path 404s at the SWAY Flask app before ever reaching nginx-portal. This task does both from the start.

- [ ] **Step 1: Add the `/jobtracker/` location to `nginx/portal.conf`**

Add after the existing `/portfolio/` location block, before the `/portfolio-api/` block (or anywhere inside the `server {}` block — position doesn't matter for nginx, grouping with `/portfolio/` for readability):

```nginx
    location /jobtracker/ {
        alias /usr/share/nginx/html/jobtracker/;
        try_files $uri $uri/ /jobtracker/index.html;
        expires 1h;
        add_header Cache-Control "public";
    }
```

- [ ] **Step 2: Add the static mount to `docker-compose.public.yml`**

Add one line to the existing `nginx-portal` service's `volumes:` list (alongside the existing `./portfolio:/usr/share/nginx/html/portfolio:ro` line added in the prior deploy):

```yaml
      - ./jobtracker:/usr/share/nginx/html/jobtracker:ro
```

- [ ] **Step 3: Add the HAProxy ACL**

In `haproxy/haproxy.cfg`'s `https_front` frontend, add one ACL and extend the existing `portal_back` condition:

```
    acl path_static    path_beg /static
    acl path_portfolio  path_beg /portfolio
    acl path_jobtracker path_beg /jobtracker
    acl path_grafana   path_beg /grafana

    use_backend api_back    if path_api or path_docs or path_openapi
    use_backend portal_back if path_portal or path_static or path_portfolio or path_jobtracker
    use_backend grafana_back if path_grafana
```

- [ ] **Step 4: Verify nginx config syntax locally**

Run: `docker run --rm -v "$(pwd)/nginx/portal.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`
(If Docker isn't available locally, note that in the report — full verification happens on the droplet in Task 6, same as the prior deploy.)

- [ ] **Step 5: Commit**

```bash
git add nginx/portal.conf docker-compose.public.yml haproxy/haproxy.cfg
git commit -m "feat: route /jobtracker/ through nginx-portal and HAProxy"
```

---

### Task 5: Frontend — split into `/portfolio/` stub and `/jobtracker/` app

**Files:**
- Create: `jobtracker/index.html`
- Create: `jobtracker/app.js`
- Modify: `portfolio/index.html`
- Delete: `portfolio/app.js`

**Interfaces:**
- Consumes: `POST /portfolio-api/register`, `POST /portfolio-api/login`, `GET/POST/PUT/DELETE /portfolio-api/postulations` (Task 3).
- Produces: static pages at `/jobtracker/` (full app) and `/portfolio/` (stub).

No UI redesign — this is the existing `portfolio/index.html`/`app.js` moved to `jobtracker/`, unchanged except one addition: a register form/toggle on the login screen (bare-minimum styling, reusing the existing `.login-screen`/`.field`/`button.primary`/`button.secondary` classes already in the CSS — no new classes needed).

- [ ] **Step 1: Create `jobtracker/index.html`**

Copy `portfolio/index.html` verbatim, with two changes: `<title>` becomes `Job Tracker — proof of concept`, and the login screen gains a register toggle. Replace the existing `<div class="login-screen" id="loginScreen">...</div>` block with:

```html
<div class="login-screen" id="loginScreen">
  <h2 id="authTitle">Acceso bitácora</h2>
  <div class="field"><label>Usuario</label><input id="login-user"></div>
  <div class="field"><label>Contraseña</label><input id="login-pass" type="password"></div>
  <button class="primary" id="authSubmitBtn" onclick="doLogin()">Entrar</button>
  <p class="error" id="loginError">Usuario o contraseña incorrectos</p>
  <p class="error" id="registerError">No se pudo crear el usuario (¿ya existe?)</p>
  <p class="save-note" id="registerSuccess">Cuenta creada — ya puedes iniciar sesión.</p>
  <p class="toolbar-note" style="text-align:center;margin-top:12px;">
    <a href="#" id="authToggle" onclick="toggleAuthMode(); return false;">Crear cuenta nueva</a>
  </p>
</div>
```

Keep everything else in the file (the `<style>` block, `#appRoot`, the modal) identical to `portfolio/index.html`. Point the script tag at `app.js` (same filename, different directory, no change needed to the tag itself).

Add these three CSS rules to the existing `<style>` block (next to the other `.login-screen .*` rules already there):

```css
  .login-screen .error, .login-screen .save-note{display:none;}
  .login-screen .error.show, .login-screen .save-note.show{display:block;}
```

(This replaces the old inline `display:none` on `#loginError` — remove `display:none` from that element's inline style if present, since the CSS class now controls visibility for both error elements uniformly.)

- [ ] **Step 2: Create `jobtracker/app.js`**

Copy `portfolio/app.js` verbatim, with these changes:
1. Add a `let authMode = 'login';` near the top (with the other `let` declarations).
2. Add `toggleAuthMode()` and `doRegister()` functions.
3. Change `doLogin()`'s button `onclick` dispatch — the button now calls a single `submitAuth()` that branches on `authMode`.
4. Update the two error-visibility lines (`loginError`) to use `classList` instead of `style.display`, matching the new CSS classes.

Full file:

```javascript
const API_BASE = '/portfolio-api';
let apps = [];
let currentId = null;
let token = localStorage.getItem('portfolio_token') || null;
let authMode = 'login';

const statusLabels = {postulado:'Postulado', entrevista:'Entrevista', oferta:'Oferta', rechazado:'Rechazado'};
const statusOrder = ['postulado','entrevista','oferta','rechazado'];

function toggleAuthMode(){
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Acceso bitácora' : 'Crear cuenta';
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? 'Entrar' : 'Registrarme';
  document.getElementById('authToggle').textContent = authMode === 'login' ? 'Crear cuenta nueva' : 'Ya tengo cuenta';
  document.getElementById('authSubmitBtn').onclick = submitAuth;
  ['loginError','registerError','registerSuccess'].forEach(id => document.getElementById(id).classList.remove('show'));
}

function submitAuth(){
  if(authMode === 'login') return doLogin();
  return doRegister();
}

async function doRegister(){
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });
  document.getElementById('registerError').classList.remove('show');
  document.getElementById('registerSuccess').classList.remove('show');
  if(!res.ok){
    document.getElementById('registerError').classList.add('show');
    return;
  }
  document.getElementById('registerSuccess').classList.add('show');
  toggleAuthMode();
}

async function doLogin(){
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });
  if(!res.ok){
    document.getElementById('loginError').classList.add('show');
    return;
  }
  document.getElementById('loginError').classList.remove('show');
  const data = await res.json();
  token = data.access_token;
  localStorage.setItem('portfolio_token', token);
  showApp();
}

function authHeaders(){
  return {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`};
}

async function showApp(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
  await loadApps();
}

async function loadApps(){
  const res = await fetch(`${API_BASE}/postulations`, {headers: authHeaders()});
  if(res.status === 401){
    token = null;
    localStorage.removeItem('portfolio_token');
    document.getElementById('appRoot').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }
  apps = await res.json();
  render();
}

function render(){
  const stats = document.getElementById('stats');
  stats.innerHTML = statusOrder.map(s => {
    const n = apps.filter(a => a.status === s).length;
    return `<div class="stat"><span class="num">${n}</span><span class="lbl">${statusLabels[s]}</span></div>`;
  }).join('');

  const board = document.getElementById('board');
  board.innerHTML = statusOrder.map(s => {
    const items = apps.filter(a => a.status === s);
    const cards = items.length ? items.map(a => cardHtml(a)).join('') : '<div class="empty-col">Sin postulaciones</div>';
    return `<div class="col">
      <div class="col-head"><h3>${statusLabels[s]}</h3><span class="col-count">${items.length}</span></div>
      ${cards}
    </div>`;
  }).join('');
}

function cardHtml(a){
  return `<div class="card" onclick="openDetail('${a.id}')">
    <span class="stamp ${a.status}">${statusLabels[a.status]}</span>
    <p class="company">${escapeHtml(a.company)}</p>
    <p class="role">${escapeHtml(a.role)}</p>
    <div class="meta"><span>${escapeHtml(a.salary)}</span><span>${escapeHtml(fmtDate(a.date_applied))}</span></div>
  </div>`;
}

function fmtDate(d){
  if(!d) return '';
  const [y,m,day] = d.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${day} ${meses[parseInt(m,10)-1]}`;
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

function openDetail(id){
  const a = apps.find(x => x.id === id);
  if(!a) return;
  currentId = id;
  document.getElementById('editMode').style.display = 'none';
  document.getElementById('viewMode').style.display = 'block';
  document.getElementById('modalTitle').textContent = a.company;
  document.getElementById('modalSub').textContent = a.role;
  document.getElementById('v-company').textContent = a.company;
  document.getElementById('v-role').textContent = a.role;
  document.getElementById('v-location').textContent = a.location;
  document.getElementById('v-salary').textContent = a.salary;
  document.getElementById('v-schedule').textContent = a.schedule;
  document.getElementById('v-date').textContent = fmtDate(a.date_applied);
  document.getElementById('v-source').textContent = a.source;
  document.getElementById('v-requirements').innerHTML = (a.requirements||'').split('\n').filter(Boolean).map(r => `<li>${escapeHtml(r)}</li>`).join('');
  document.getElementById('v-status').value = a.status;
  document.getElementById('v-notes').value = a.notes || '';
  document.getElementById('saveNote').textContent = '';
  document.getElementById('overlay').classList.add('open');
}

async function updateStatus(){
  const status = document.getElementById('v-status').value;
  const res = await fetch(`${API_BASE}/postulations/${currentId}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({status})
  });
  if(!res.ok){
    document.getElementById('saveNote').textContent = 'Error al guardar';
    return;
  }
  await loadApps();
  document.getElementById('saveNote').textContent = 'Estatus actualizado';
}

async function updateNotes(){
  const notes = document.getElementById('v-notes').value;
  const res = await fetch(`${API_BASE}/postulations/${currentId}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({notes})
  });
  if(!res.ok){
    document.getElementById('saveNote').textContent = 'Error al guardar';
    return;
  }
  await loadApps();
  document.getElementById('saveNote').textContent = 'Notas guardadas';
}

async function deleteApp(){
  await fetch(`${API_BASE}/postulations/${currentId}`, {method: 'DELETE', headers: authHeaders()});
  await loadApps();
  closeModal();
}

function openModal(){
  currentId = null;
  document.getElementById('modalTitle').textContent = 'Nueva postulación';
  document.getElementById('modalSub').textContent = 'Agrega los datos de la vacante';
  document.getElementById('viewMode').style.display = 'none';
  document.getElementById('editMode').style.display = 'block';
  ['f-company','f-role','f-location','f-salary','f-schedule','f-source','f-requirements','f-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('overlay').classList.add('open');
}

async function saveNew(){
  const company = document.getElementById('f-company').value.trim();
  const role = document.getElementById('f-role').value.trim();
  if(!company || !role){
    alert('Completa al menos empresa y puesto.');
    return;
  }
  const id = 'app-' + Date.now();
  const requirements = document.getElementById('f-requirements').value.trim();
  const res = await fetch(`${API_BASE}/postulations`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({
      id, company, role,
      location: document.getElementById('f-location').value.trim(),
      salary: document.getElementById('f-salary').value.trim(),
      schedule: document.getElementById('f-schedule').value.trim(),
      date_applied: new Date().toISOString().slice(0,10),
      source: document.getElementById('f-source').value.trim(),
      requirements,
      notes: document.getElementById('f-notes').value.trim(),
      status: 'postulado'
    })
  });
  if(!res.ok){
    alert('Error al guardar la postulación.');
    return;
  }
  await loadApps();
  closeModal();
}

function closeModal(){
  document.getElementById('overlay').classList.remove('open');
  currentId = null;
}

document.getElementById('overlay').addEventListener('click', (e) => {
  if(e.target.id === 'overlay') closeModal();
});

if(token){
  showApp();
}
```

- [ ] **Step 3: Replace `portfolio/index.html` with a minimal stub**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Portfolio — Emiliano Ledesma</title>
<style>
  body{font-family:sans-serif;background:#EFEAE0;color:#202B2E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px;}
</style>
</head>
<body>
  <div>
    <h1>Portfolio en construcción</h1>
    <p>Próximamente: proyectos y experiencia.</p>
  </div>
</body>
</html>
```

- [ ] **Step 4: Delete `portfolio/app.js`**

```bash
git rm portfolio/app.js
```

(No longer referenced — the stub has no script tag.)

- [ ] **Step 5: Manual verification (no JS test framework in this repo, same as the prior deploy's approach)**

1. Run `cd portfolio_api && PORTFOLIO_JWT_SECRET=test-secret python -m uvicorn main:app --port 8100` locally (no more `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` needed).
2. Serve `jobtracker/` locally (`python -m http.server 8200` from inside `jobtracker/`), temporarily point `API_BASE` to `http://localhost:8100/portfolio-api` for this check only (revert before commit).
3. Confirm: login screen shows "Crear cuenta nueva" link; clicking it switches to register mode; registering a new user shows the success message and switches back to login; logging in with that new account shows an empty board (no legacy postulations — expected, they're not migrated in this local test DB); creating/editing/deleting a postulation works as before.
4. Revert the temporary `API_BASE` change.

- [ ] **Step 6: Commit**

```bash
git add jobtracker/index.html jobtracker/app.js portfolio/index.html
git commit -m "feat: split frontend into /jobtracker/ (multi-user app) and /portfolio/ (stub)"
```

---

### Task 6: Deploy — migrate existing data, then flip to multi-user

**Files:** none (operational runbook, mirrors the style of the prior deploy's Task 7)

**Interfaces:**
- Consumes: everything from Tasks 1-5, already merged to `master`.

- [ ] **Step 1: Pull latest code on the public droplet**

```bash
ssh -i ~/.ssh/sway_deploy root@146.190.136.236
cd /home/sway/sway
git pull
```

- [ ] **Step 2: Capture the legacy credentials from the currently-running container**

Do this BEFORE rebuilding — the pulled `docker-compose.portfolio.yml` (Task 3) no longer declares `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH`, so a container recreated from it won't have them. The OLD container (still running the pre-migration image) has the correctly-unescaped hash in its live environment (the original deploy's `docker compose up` already resolved the `.env` file's `$$`-escaping into a real single-`$` value at container-creation time) — capture it now, before it's replaced:

```bash
LEGACY_USER=$(docker exec sway_portfolio_api printenv PORTFOLIO_USER)
LEGACY_HASH=$(docker exec sway_portfolio_api printenv PORTFOLIO_PASSWORD_HASH)
echo "captured: $LEGACY_USER"   # sanity check the username came through; don't echo the hash
```

- [ ] **Step 3: Rebuild the portfolio_api image and container with the new code**

```bash
docker compose -f docker-compose.portfolio.yml up --build -d
docker compose -f docker-compose.portfolio.yml ps   # expect sway_portfolio_api Up
```

- [ ] **Step 4: Run the one-time migration, passing the captured credentials explicitly**

`docker exec -e` injects environment variables for this exec session only, regardless of what the container was created with — this is what makes the migration script see `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` even though the new container's own environment (from the now-cleaned compose file) doesn't have them:

```bash
docker exec -e PORTFOLIO_USER="$LEGACY_USER" -e PORTFOLIO_PASSWORD_HASH="$LEGACY_HASH" sway_portfolio_api python migrate_multiuser.py
```

Expected output: `Created user 'emiliano' (id=1)` and `Backfilled 11 postulation(s) to user_id=1`. If you see `Backfilled 0 postulation(s)`, the migration already ran (safe — it's idempotent) or something else backfilled them; investigate before proceeding if the count looks wrong.

- [ ] **Step 5: Verify the migrated account works before touching routing**

```bash
curl -k -s -X POST https://proyecto-sway.site/portfolio-api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"emiliano","password":"YOUR_EXISTING_PASSWORD"}'   # {"access_token": "...", ...}
```

Use the returned token to confirm all 11 postulations are visible:

```bash
curl -k -s https://proyecto-sway.site/portfolio-api/postulations -H "Authorization: Bearer YOUR_TOKEN" | grep -o '"id"' | wc -l   # 11
```

- [ ] **Step 6: Clean up the now-unused env var lines in `.env`**

`docker-compose.portfolio.yml` already stopped declaring `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` as of the Step 3 rebuild (Task 3's code change) — the container has run without them since then. This step just tidies the droplet's `.env` file itself, which is otherwise harmless but stale:

```bash
nano .env   # remove the PORTFOLIO_USER and PORTFOLIO_PASSWORD_HASH lines
```

No container restart needed for this step — `.env` values not referenced by any compose file's `environment:` block have no effect on any running container.

- [ ] **Step 7: Apply the new routing (HAProxy + nginx)**

```bash
docker exec sway_haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg   # validate syntax first
docker compose -f docker-compose.public.yml restart haproxy
docker compose -f docker-compose.public.yml up -d --force-recreate nginx-portal
```

- [ ] **Step 8: Verify end-to-end**

```bash
curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/jobtracker/            # 200
curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/jobtracker/app.js       # 200
curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/portfolio/              # 200 (now the stub)

curl -k -s -X POST https://proyecto-sway.site/portfolio-api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"smoketest","password":"smoketestpassword"}'                                  # {"status": "registered"}

curl -k -s -X POST https://proyecto-sway.site/portfolio-api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"smoketest","password":"smoketestpassword"}'                                  # {"access_token": "...", ...}

curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/portfolio-api/postulations   # 401 (no token)
```

- [ ] **Step 9: Confirm SWAY's own stacks are unaffected**

```bash
docker compose -f docker-compose.public.yml ps    # haproxy, nginx-portal, grafana still Up
ssh sway-privado "docker ps --format '{{.Names}}: {{.Status}}'"   # unchanged, 9 containers Up
curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/portal/   # 200, unaffected
```
