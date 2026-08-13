# Portfolio + Job Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static portfolio page + login-gated job-postulation tracker (kanban binnacle) at `proyecto-sway.site/portfolio/`, backed by a small isolated FastAPI+SQLite service on the existing public droplet, with zero changes to SWAY's own compose stacks.

**Architecture:** New `portfolio_api/` FastAPI service (SQLite, JWT auth, single hardcoded user) running in its own container, joined to the existing `sway_edge_network` so `nginx-portal` can `proxy_pass` to it. Static portfolio files served directly by `nginx-portal`. Everything lives in a new `docker-compose.portfolio.yml`, independent from SWAY's deploy lifecycle.

**Tech Stack:** FastAPI, `python-jose` (JWT), `passlib[bcrypt]` (password hashing), stdlib `sqlite3` (no ORM), `uvicorn`, plain HTML/CSS/JS frontend (no build step), `pytest` + FastAPI `TestClient`.

## Global Constraints

- No changes to `docker-compose.public.yml`, `docker-compose.private.yml`, or `nginx/portal.conf`'s existing `/portal/`, `/static/` locations — only additive changes.
- New container must join the existing docker network named `sway_edge_network` (confirmed via `docker network ls` on the public droplet) so `nginx-portal` can reach it by container name.
- Same-origin deployment (`proyecto-sway.site/portfolio/` + `/portfolio-api/`) — no CORS headers needed.
- Single user, no signup flow, credentials via `.env` (never committed).
- SQLite file must persist across container recreation (docker named volume).

---

### Task 1: Database layer (`portfolio_api/db.py`)

`SEED_POSTULATIONS` combines 8 postulations from the provided MVP HTML mockup with 3 more sourced from `docs/postulaciones_fuera_bitacora.md` (EQUINIX, More Pepper, Arrendadora Thermo Logística — a fourth entry there, EOS Soluciones, duplicates the `eos` entry already sourced from the MVP HTML and was intentionally not duplicated).

**Files:**
- Create: `portfolio_api/db.py`
- Create: `portfolio_api/requirements.txt`
- Test: `portfolio_api/test_db.py`

**Interfaces:**
- Produces: `get_conn() -> sqlite3.Connection` (row_factory returns dict-like rows), `init_db(conn: sqlite3.Connection) -> None`, `seed_postulations(conn: sqlite3.Connection) -> int` (returns rows inserted, 0 if already seeded).
- `DB_PATH` read from env var `PORTFOLIO_DB_PATH`, defaulting to `/data/portfolio.db`.

- [ ] **Step 1: Write the failing test**

```python
# portfolio_api/test_db.py
import os
import sqlite3
import tempfile

import pytest

os.environ["PORTFOLIO_DB_PATH"] = tempfile.mktemp(suffix=".db")

from db import get_conn, init_db, seed_postulations  # noqa: E402


@pytest.fixture
def conn():
    c = get_conn()
    init_db(c)
    yield c
    c.close()
    os.remove(os.environ["PORTFOLIO_DB_PATH"])


def test_init_db_creates_tables(conn):
    tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }
    assert "postulations" in tables
    assert "contact_messages" in tables


def test_seed_postulations_inserts_eleven_rows(conn):
    inserted = seed_postulations(conn)
    assert inserted == 11
    count = conn.execute("SELECT COUNT(*) AS n FROM postulations").fetchone()["n"]
    assert count == 11


def test_seed_postulations_is_idempotent(conn):
    seed_postulations(conn)
    second = seed_postulations(conn)
    assert second == 0
    count = conn.execute("SELECT COUNT(*) AS n FROM postulations").fetchone()["n"]
    assert count == 11
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolio_api && python -m pytest test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 3: Write `portfolio_api/requirements.txt`**

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
pydantic>=2.0.0
email-validator>=2.0.0
pytest>=8.0.0
httpx>=0.27.0
```

- [ ] **Step 4: Write minimal implementation**

```python
# portfolio_api/db.py
import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.environ.get("PORTFOLIO_DB_PATH", "/data/portfolio.db")

SEED_POSTULATIONS = [
    dict(id="eos", company="EOS Soluciones", role="Desarrollador (Estadía)",
         location="Ciudad Maderas, El Marqués, Qro. · Híbrido",
         salary="Se acuerda en entrevista",
         schedule="L-V 9:00-18:00, sáb. ocasional 9:00-13:00",
         date_applied="2026-08-11", source="Cold email",
         requirements="Desarrollo orientado a objetos\nBases de datos\nComunicación efectiva\nDesarrollo móvil (opcional)",
         notes="", status="postulado"),
    dict(id="cloud-cyber", company="Solución Cloud & Ciberseguridad",
         role="Becario de Tecnologías de la Información",
         location="Querétaro · Presencial", salary="$5,000/mes",
         schedule="Medio tiempo, mín. 20 hrs/semana",
         date_applied="2026-08-11", source="Postulación directa",
         requirements="Windows, Linux, TCP/IP, VPN\nSaaS/PaaS/IaaS\nAzure, M365, Google Workspace\nInglés B1+",
         notes="", status="postulado"),
    dict(id="kostal", company="KOSTAL", role="Quality Trainee",
         location="Santiago de Querétaro",
         salary="$8,400/mes + comedor gratuito",
         schedule="L-V 7:30-16:30, mín. 6 meses",
         date_applied="2026-08-11", source="Postulación directa",
         requirements="Excel intermedio\nResolución de problemas\nSeguro Facultativo vigente\nInglés intermedio",
         notes="", status="postulado"),
    dict(id="bosch", company="Bosch (vía Pro Meritum)",
         role="Practicante de Soporte TI", location="Colón, Qro. · Presencial",
         salary="$8,000/mes", schedule="L-V 8:00-15:00",
         date_applied="2026-08-11", source="Pro Meritum",
         requirements="Inglés intermedio\nExcel/Office intermedio\nSCRUM básico\nHardware intermedio",
         notes="", status="postulado"),
    dict(id="gozen-ai", company="GoZen AI", role="AI / ML Engineer Jr.",
         location="El Refugio, Querétaro · Híbrido", salary="$18,000/mes",
         schedule="Nómina con prestaciones de ley",
         date_applied="2026-08-11", source="Glassdoor",
         requirements="Python (NumPy, Pandas, Scikit-learn)\nAPI de LLM (Claude/GPT/Gemini)\nLangChain/LlamaIndex (deseable)\nBases de datos vectoriales\nGit",
         notes="", status="postulado"),
    dict(id="terminal-logistics", company="Términal Logistics",
         role="Desarrollador Jr", location="Querétaro", salary="$27,000/mes",
         schedule="", date_applied="2026-08-11", source="Glassdoor",
         requirements=".Net, PHP, Python o Node.js\nHTML, CSS, JavaScript\nReact, Angular o similar",
         notes="", status="postulado"),
    dict(id="data-analytics-jr", company="Taydeé García Medina",
         role="Data Analytics Jr", location="Querétaro",
         salary="$11,000-$16,000/mes",
         schedule="Medio tiempo o tiempo completo",
         date_applied="2026-08-11", source="Glassdoor",
         requirements="Excel avanzado\nAnálisis de datos\nApoyo a áreas de impuestos",
         notes="", status="postulado"),
    dict(id="team-integrity", company="Team Integrity",
         role="Practicante de IA Generativa, Automatización y Procesos",
         location="Querétaro", salary="$9,000/mes", schedule="",
         date_applied="2026-08-11", source="Glassdoor",
         requirements="Interés en IA aplicada a procesos\nObservación y análisis de actividades por área",
         notes="", status="postulado"),
    dict(id="equinix", company="EQUINIX",
         role="Practicante en Operaciones en Centros de Datos",
         location="Parque Tecnológico Innovación · Presencial",
         salary="$11,000 pesos mensuales", schedule="L-V 09:00-15:00",
         date_applied="2026-08-11", source="Bolsa de prácticas",
         requirements="Interés por infraestructura tecnológica y operaciones\nProactivo, organizado y con disposición para aprender\nDisponibilidad L-V 6 hrs/día",
         notes="", status="postulado"),
    dict(id="more-pepper", company="More Pepper",
         role="Estadía en Innovación Digital", location="Híbrido",
         salary="Se menciona en entrevista",
         schedule="L-J 9:00-18:00, V 9:00-17:00",
         date_applied="2026-08-11", source="Bolsa de prácticas",
         requirements="Conocimientos básicos en desarrollo web e IA\nHTML, CSS y JavaScript\nInglés técnico básico",
         notes="", status="postulado"),
    dict(id="thermo-logistica", company="Arrendadora Thermo Logística",
         role="Practicante de Sistemas TI", location="El Colorado · Presencial",
         salary="Se menciona en entrevista", schedule="L-V 08:00-13:00",
         date_applied="2026-08-11", source="Bolsa de prácticas",
         requirements="Office/Google Workspace\nFundamentos de sistemas computacionales\nSeguridad informática y respaldo\nMantenimiento de equipos de cómputo",
         notes="", status="postulado"),
]


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
        CREATE TABLE IF NOT EXISTS contact_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT,
          message TEXT,
          created_at TEXT
        );
        """
    )
    conn.commit()


def seed_postulations(conn: sqlite3.Connection) -> int:
    existing = conn.execute("SELECT COUNT(*) AS n FROM postulations").fetchone()["n"]
    if existing > 0:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    for p in SEED_POSTULATIONS:
        conn.execute(
            """INSERT INTO postulations
               (id, company, role, location, salary, schedule, date_applied,
                source, requirements, notes, status, created_at, updated_at)
               VALUES (:id, :company, :role, :location, :salary, :schedule,
                       :date_applied, :source, :requirements, :notes, :status,
                       :created_at, :updated_at)""",
            {**p, "created_at": now, "updated_at": now},
        )
    conn.commit()
    return len(SEED_POSTULATIONS)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd portfolio_api && python -m pytest test_db.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add portfolio_api/db.py portfolio_api/test_db.py portfolio_api/requirements.txt
git commit -m "feat: add portfolio_api SQLite schema, seed data, and tests"
```

---

### Task 2: Auth layer (`portfolio_api/auth.py`)

**Files:**
- Create: `portfolio_api/auth.py`
- Test: `portfolio_api/test_auth.py`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `hash_password(password: str) -> str`, `verify_password(password: str, hashed: str) -> bool`, `create_token(username: str) -> str`, `decode_token(token: str) -> dict` (raises `fastapi.HTTPException(401)` on invalid/expired), FastAPI dependency `get_current_user(credentials = Depends(bearer_scheme)) -> dict`.
- Reads env vars: `PORTFOLIO_JWT_SECRET` (required, raises `RuntimeError` if unset), `PORTFOLIO_USER`, `PORTFOLIO_PASSWORD_HASH`.

- [ ] **Step 1: Write the failing test**

```python
# portfolio_api/test_auth.py
import os

os.environ["PORTFOLIO_JWT_SECRET"] = "test-secret-key-for-tests-only"

from auth import create_token, decode_token, hash_password, verify_password  # noqa: E402
from fastapi import HTTPException
import pytest


def test_hash_and_verify_password_roundtrip():
    hashed = hash_password("correcthorse")
    assert verify_password("correcthorse", hashed) is True
    assert verify_password("wrongpassword", hashed) is False


def test_create_and_decode_token_roundtrip():
    token = create_token("emiliano")
    payload = decode_token(token)
    assert payload["sub"] == "emiliano"


def test_decode_token_rejects_garbage():
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not-a-real-token")
    assert exc_info.value.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolio_api && python -m pytest test_auth.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'auth'`

- [ ] **Step 3: Write minimal implementation**

```python
# portfolio_api/auth.py
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = os.environ.get("PORTFOLIO_JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError("PORTFOLIO_JWT_SECRET no está configurada — revisar .env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="No autenticado")
    return decode_token(credentials.credentials)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd portfolio_api && python -m pytest test_auth.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add portfolio_api/auth.py portfolio_api/test_auth.py
git commit -m "feat: add portfolio_api JWT auth and password hashing"
```

---

### Task 3: API endpoints (`portfolio_api/main.py`)

**Files:**
- Create: `portfolio_api/main.py`
- Create: `portfolio_api/models.py`
- Test: `portfolio_api/test_api.py`

**Interfaces:**
- Consumes: `get_conn`, `init_db`, `seed_postulations` from `db.py` (Task 1); `hash_password`, `verify_password`, `create_token`, `get_current_user` from `auth.py` (Task 2).
- Produces: FastAPI app instance `app` in `portfolio_api/main.py`, importable as `from main import app` for `TestClient(app)`.
- Routes: `POST /portfolio-api/login`, `GET/POST /portfolio-api/postulations`, `PUT/DELETE /portfolio-api/postulations/{id}`, `POST /portfolio-api/contact`.

- [ ] **Step 1: Write the failing test**

```python
# portfolio_api/test_api.py
import os
import tempfile

os.environ["PORTFOLIO_DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["PORTFOLIO_JWT_SECRET"] = "test-secret-key-for-tests-only"
os.environ["PORTFOLIO_USER"] = "emiliano"

from auth import hash_password  # noqa: E402

os.environ["PORTFOLIO_PASSWORD_HASH"] = hash_password("test-password-123")

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def _login_token():
    res = client.post(
        "/portfolio-api/login",
        json={"username": "emiliano", "password": "test-password-123"},
    )
    return res.json()["access_token"]


def test_login_success():
    res = client.post(
        "/portfolio-api/login",
        json={"username": "emiliano", "password": "test-password-123"},
    )
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_login_wrong_password_returns_401():
    res = client.post(
        "/portfolio-api/login",
        json={"username": "emiliano", "password": "wrong"},
    )
    assert res.status_code == 401


def test_postulations_requires_auth():
    res = client.get("/portfolio-api/postulations")
    assert res.status_code == 401


def test_postulations_crud_roundtrip():
    token = _login_token()
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
    token = _login_token()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.put(
        "/portfolio-api/postulations/does-not-exist",
        headers=headers,
        json={"status": "oferta"},
    )
    assert res.status_code == 404


def test_contact_endpoint_accepts_valid_payload():
    res = client.post(
        "/portfolio-api/contact",
        json={"name": "Ada", "email": "ada@example.com", "message": "Hola!"},
    )
    assert res.status_code == 201
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolio_api && python -m pytest test_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 3: Write `portfolio_api/models.py`**

```python
# portfolio_api/models.py
from typing import Optional

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class PostulationIn(BaseModel):
    id: str
    company: str
    role: str
    location: Optional[str] = ""
    salary: Optional[str] = ""
    schedule: Optional[str] = ""
    date_applied: Optional[str] = ""
    source: Optional[str] = ""
    requirements: Optional[str] = ""
    notes: Optional[str] = ""
    status: str = "postulado"


class PostulationUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    schedule: Optional[str] = None
    date_applied: Optional[str] = None
    source: Optional[str] = None
    requirements: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class ContactMessage(BaseModel):
    name: str
    email: EmailStr
    message: str
```

- [ ] **Step 4: Write minimal implementation**

```python
# portfolio_api/main.py
import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException

from auth import create_token, get_current_user, verify_password
from db import get_conn, init_db, seed_postulations
from models import ContactMessage, LoginRequest, PostulationIn, PostulationUpdate

app = FastAPI(title="Portfolio API")

PORTFOLIO_USER = os.environ.get("PORTFOLIO_USER", "")
PORTFOLIO_PASSWORD_HASH = os.environ.get("PORTFOLIO_PASSWORD_HASH", "")


@app.on_event("startup")
def on_startup():
    conn = get_conn()
    init_db(conn)
    seed_postulations(conn)
    conn.close()


def _row_to_dict(row) -> dict:
    return dict(row)


@app.post("/portfolio-api/login")
def login(payload: LoginRequest):
    if payload.username != PORTFOLIO_USER or not verify_password(
        payload.password, PORTFOLIO_PASSWORD_HASH
    ):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    return {"access_token": create_token(payload.username), "token_type": "bearer"}


@app.get("/portfolio-api/postulations")
def list_postulations(user: dict = Depends(get_current_user)):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM postulations ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@app.post("/portfolio-api/postulations", status_code=201)
def create_postulation(payload: PostulationIn, user: dict = Depends(get_current_user)):
    conn = get_conn()
    now = datetime.now(timezone.utc).isoformat()
    data = payload.model_dump()
    conn.execute(
        """INSERT INTO postulations
           (id, company, role, location, salary, schedule, date_applied,
            source, requirements, notes, status, created_at, updated_at)
           VALUES (:id, :company, :role, :location, :salary, :schedule,
                   :date_applied, :source, :requirements, :notes, :status,
                   :created_at, :updated_at)""",
        {**data, "created_at": now, "updated_at": now},
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM postulations WHERE id = ?", (payload.id,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


@app.put("/portfolio-api/postulations/{postulation_id}")
def update_postulation(
    postulation_id: str,
    payload: PostulationUpdate,
    user: dict = Depends(get_current_user),
):
    conn = get_conn()
    existing = conn.execute(
        "SELECT * FROM postulations WHERE id = ?", (postulation_id,)
    ).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Postulación no encontrada")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    conn.execute(
        f"UPDATE postulations SET {set_clause} WHERE id = :id",
        {**updates, "id": postulation_id},
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM postulations WHERE id = ?", (postulation_id,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


@app.delete("/portfolio-api/postulations/{postulation_id}", status_code=204)
def delete_postulation(postulation_id: str, user: dict = Depends(get_current_user)):
    conn = get_conn()
    existing = conn.execute(
        "SELECT * FROM postulations WHERE id = ?", (postulation_id,)
    ).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    conn.execute("DELETE FROM postulations WHERE id = ?", (postulation_id,))
    conn.commit()
    conn.close()
    return None


@app.post("/portfolio-api/contact", status_code=201)
def contact(payload: ContactMessage):
    conn = get_conn()
    conn.execute(
        "INSERT INTO contact_messages (name, email, message, created_at) VALUES (?, ?, ?, ?)",
        (payload.name, payload.email, payload.message, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()
    return {"status": "received"}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd portfolio_api && python -m pytest test_api.py -v`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full test suite**

Run: `cd portfolio_api && python -m pytest -v`
Expected: PASS (all tests across `test_db.py`, `test_auth.py`, `test_api.py`)

- [ ] **Step 7: Commit**

```bash
git add portfolio_api/main.py portfolio_api/models.py portfolio_api/test_api.py
git commit -m "feat: add portfolio_api endpoints for auth, postulations CRUD, and contact"
```

---

### Task 4: Containerize the backend

**Files:**
- Create: `portfolio_api/Dockerfile`
- Create: `docker-compose.portfolio.yml`
- Modify: `.env.example` (append portfolio section)

**Interfaces:**
- Consumes: `portfolio_api/requirements.txt` (Task 1), `portfolio_api/main.py` exposing `app` on port 8100 (Task 3).
- Produces: container `sway_portfolio_api` listening on `8100`, joined to external network `sway_edge_network`, named volume `portfolio_data` mounted at `/data`.

- [ ] **Step 1: Write `portfolio_api/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8100
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
```

- [ ] **Step 2: Write `docker-compose.portfolio.yml`**

```yaml
services:
  portfolio-api:
    build: ./portfolio_api
    container_name: sway_portfolio_api
    restart: unless-stopped
    environment:
      PORTFOLIO_JWT_SECRET: ${PORTFOLIO_JWT_SECRET}
      PORTFOLIO_USER: ${PORTFOLIO_USER}
      PORTFOLIO_PASSWORD_HASH: ${PORTFOLIO_PASSWORD_HASH}
      PORTFOLIO_DB_PATH: /data/portfolio.db
    volumes:
      - portfolio_data:/data
    expose:
      - "8100"
    networks:
      - edge_network

networks:
  edge_network:
    name: sway_edge_network
    external: true

volumes:
  portfolio_data:
```

- [ ] **Step 3: Append to `.env.example`**

```
# --- Portfolio + job tracker (non-SWAY, droplet público) ---
# JWT secreto — genera con: python3 -c "import secrets; print(secrets.token_hex(32))"
PORTFOLIO_JWT_SECRET=REEMPLAZAR_CON_CLAVE_HEX_64_CHARS

# Usuario único del portfolio
PORTFOLIO_USER=REEMPLAZAR_CON_TU_USUARIO

# Hash bcrypt de tu contraseña — genera con:
# python3 -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('tu_password'))"
PORTFOLIO_PASSWORD_HASH=REEMPLAZAR_CON_HASH_BCRYPT
```

- [ ] **Step 4: Verify the container builds locally**

Run: `docker compose -f docker-compose.portfolio.yml build`
Expected: build succeeds with no errors.

Note: `docker compose -f docker-compose.portfolio.yml up` will fail locally unless a `sway_edge_network` network already exists (it's created by `docker-compose.public.yml` on the droplet) — that's expected here; full up/down is verified in Task 7's deploy step on the actual droplet.

- [ ] **Step 5: Commit**

```bash
git add portfolio_api/Dockerfile docker-compose.portfolio.yml .env.example
git commit -m "feat: containerize portfolio_api and add its compose file"
```

---

### Task 5: Nginx routing

**Files:**
- Modify: `nginx/portal.conf`

**Interfaces:**
- Consumes: `sway_portfolio_api` container name + port `8100` (Task 4).
- Produces: `/portfolio/` serving static files from `/usr/share/nginx/html/portfolio/`, `/portfolio-api/` proxying to `http://sway_portfolio_api:8100/portfolio-api/`.

- [ ] **Step 1: Add new locations to `nginx/portal.conf`**

Append inside the existing `server {}` block (after the `/static/` location, before the closing `}`):

```nginx
    location /portfolio/ {
        alias /usr/share/nginx/html/portfolio/;
        try_files $uri $uri/ /portfolio/index.html;
        expires 1h;
        add_header Cache-Control "public";
    }

    location /portfolio-api/ {
        proxy_pass http://sway_portfolio_api:8100/portfolio-api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

- [ ] **Step 2: Add the static mount to `docker-compose.public.yml`**

Modify the existing `nginx-portal` service's `volumes:` list (currently `./web2/dist`, `./assets`, `./nginx/portal.conf`) to add one line:

```yaml
      - ./portfolio:/usr/share/nginx/html/portfolio:ro
```

- [ ] **Step 3: Verify nginx config syntax locally**

Run: `docker run --rm -v "$(pwd)/nginx/portal.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`
Expected: `syntax is ok` / `test is successful`

- [ ] **Step 4: Commit**

```bash
git add nginx/portal.conf docker-compose.public.yml
git commit -m "feat: route /portfolio/ and /portfolio-api/ through nginx-portal"
```

---

### Task 6: Frontend — adapt the MVP kanban board

**Files:**
- Create: `portfolio/index.html`
- Create: `portfolio/app.js`

**Interfaces:**
- Consumes: `POST /portfolio-api/login`, `GET/POST /portfolio-api/postulations`, `PUT/DELETE /portfolio-api/postulations/{id}`, `POST /portfolio-api/contact` (Task 3).
- Produces: static page mounted at `/portfolio/` (Task 5).

- [ ] **Step 1: Write `portfolio/index.html`**

Reuse the structure and CSS of the provided MVP (`bitacora (1).html`) as-is for the board/modal/styling — copy that file's `<style>` block and HTML body unchanged. Two changes to the body: add a login gate before the board, and remove the `newAdditions`/`window.storage` logic block (moved to `app.js`).

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Portfolio — Emiliano Ledesma</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* Copy verbatim the full <style> block from bitacora (1).html (lines 10-299) */
  .login-screen{max-width:360px;margin:80px auto;padding:24px;background:var(--paper-2);border:1px solid var(--line);border-radius:4px;}
  .login-screen h2{font-family:'Special Elite', monospace;font-weight:400;margin:0 0 16px;}
  .login-screen .field{margin-bottom:12px;}
  .login-screen .error{color:var(--rechazado);font-size:12px;margin-top:8px;display:none;}
  .hidden{display:none !important;}
</style>
</head>
<body>
<div class="wrap">

<div class="login-screen" id="loginScreen">
  <h2>Acceso bitácora</h2>
  <div class="field"><label>Usuario</label><input id="login-user"></div>
  <div class="field"><label>Contraseña</label><input id="login-pass" type="password"></div>
  <button class="primary" onclick="doLogin()">Entrar</button>
  <p class="error" id="loginError">Usuario o contraseña incorrectos</p>
</div>

<div id="appRoot" class="hidden">
  <header>
    <div class="title-block">
      <h1>Bitácora de búsqueda — Emiliano Ledesma</h1>
      <p>Prácticas profesionales · Backend / Data · Querétaro · desde ago. 2026</p>
    </div>
    <div class="stats" id="stats"></div>
  </header>

  <div class="toolbar">
    <div class="toolbar-note">Toca una tarjeta para ver detalle, cambiar estatus o agregar notas.</div>
    <button class="add-btn" onclick="openModal()">+ Nueva postulación</button>
  </div>

  <div class="board" id="board"></div>
</div>

</div>

<div class="overlay" id="overlay">
  <div class="modal">
    <h2 id="modalTitle">Nueva postulación</h2>
    <p class="sub" id="modalSub"></p>

    <div id="viewMode">
      <div class="detail-row"><span class="k">Empresa</span><span id="v-company"></span></div>
      <div class="detail-row"><span class="k">Puesto</span><span id="v-role"></span></div>
      <div class="detail-row"><span class="k">Ubicación</span><span id="v-location"></span></div>
      <div class="detail-row"><span class="k">Compensación</span><span id="v-salary"></span></div>
      <div class="detail-row"><span class="k">Horario</span><span id="v-schedule"></span></div>
      <div class="detail-row"><span class="k">Fecha postulación</span><span id="v-date"></span></div>
      <div class="detail-row"><span class="k">Fuente</span><span id="v-source"></span></div>
      <div class="field" style="margin-top:14px;">
        <label>Requisitos clave</label>
        <ul class="req-list" id="v-requirements"></ul>
      </div>
      <div class="field">
        <label>Estatus</label>
        <select id="v-status" onchange="updateStatus()">
          <option value="postulado">Postulado</option>
          <option value="entrevista">Entrevista</option>
          <option value="oferta">Oferta</option>
          <option value="rechazado">Rechazado</option>
        </select>
      </div>
      <div class="field">
        <label>Notas</label>
        <textarea id="v-notes" onblur="updateNotes()"></textarea>
      </div>
      <div class="modal-actions">
        <button class="danger" onclick="deleteApp()">Eliminar</button>
        <button class="secondary" onclick="closeModal()">Cerrar</button>
      </div>
      <div class="save-note" id="saveNote"></div>
    </div>

    <div id="editMode" style="display:none;">
      <div class="two-col">
        <div class="field"><label>Empresa</label><input id="f-company"></div>
        <div class="field"><label>Puesto</label><input id="f-role"></div>
      </div>
      <div class="two-col">
        <div class="field"><label>Ubicación</label><input id="f-location"></div>
        <div class="field"><label>Compensación</label><input id="f-salary"></div>
      </div>
      <div class="two-col">
        <div class="field"><label>Horario</label><input id="f-schedule"></div>
        <div class="field"><label>Fuente</label><input id="f-source" placeholder="Cold email, bolsa, referido..."></div>
      </div>
      <div class="field"><label>Requisitos clave (uno por línea)</label><textarea id="f-requirements"></textarea></div>
      <div class="field"><label>Notas</label><textarea id="f-notes"></textarea></div>
      <div class="modal-actions">
        <div class="left"></div>
        <div class="left">
          <button class="secondary" onclick="closeModal()">Cancelar</button>
          <button class="primary" onclick="saveNew()">Guardar</button>
        </div>
      </div>
    </div>

  </div>
</div>

<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `portfolio/app.js`**

```javascript
const API_BASE = '/portfolio-api';
let apps = [];
let currentId = null;
let token = localStorage.getItem('portfolio_token') || null;

const statusLabels = {postulado:'Postulado', entrevista:'Entrevista', oferta:'Oferta', rechazado:'Rechazado'};
const statusOrder = ['postulado','entrevista','oferta','rechazado'];

async function doLogin(){
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });
  if(!res.ok){
    document.getElementById('loginError').style.display = 'block';
    return;
  }
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

- [ ] **Step 3: Manual verification (no JS test framework in this repo — matches existing `assets/js/*.js` convention of untested plain scripts)**

1. Run `cd portfolio_api && uvicorn main:app --port 8100` locally with `PORTFOLIO_JWT_SECRET`, `PORTFOLIO_USER`, `PORTFOLIO_PASSWORD_HASH` set in the shell.
2. Serve `portfolio/` locally (e.g. `python -m http.server 8200` from inside `portfolio/`) and temporarily point `API_BASE` to `http://localhost:8100/portfolio-api` for this manual check only (revert before commit).
3. Open the page in a mobile-width browser viewport (375px): confirm login screen renders, wrong password shows the error message, correct login shows the board with 11 seeded cards, opening a card and changing status updates the column counts, adding a new postulation appears in the "Postulado" column, deleting removes it.
4. Revert the temporary `API_BASE` change.

- [ ] **Step 4: Commit**

```bash
git add portfolio/index.html portfolio/app.js
git commit -m "feat: add portfolio frontend (login + kanban board) adapted from MVP"
```

---

### Task 7: Deploy to the public droplet

**Files:** none (operational runbook, mirrors the style of `docs/DEPLOYMENT_2_DROPLETS.md`)

**Interfaces:**
- Consumes: everything from Tasks 1-6, already merged to `master`.

- [ ] **Step 1: Pull latest code on the public droplet**

```bash
ssh -i ~/.ssh/sway_deploy root@146.190.136.236
cd /home/sway/sway
git pull
```

- [ ] **Step 2: Fill in the `.env` values that don't need the image built yet**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # → PORTFOLIO_JWT_SECRET
nano .env   # add PORTFOLIO_JWT_SECRET, PORTFOLIO_USER (leave PORTFOLIO_PASSWORD_HASH for Step 4)
```

- [ ] **Step 3: Build and bring up the new isolated stack**

```bash
docker compose -f docker-compose.portfolio.yml up --build -d
docker compose -f docker-compose.portfolio.yml ps   # expect sway_portfolio_api Up
```

- [ ] **Step 4: Generate the password hash using the built image, then set it and restart**

`passlib` lives inside the `portfolio_api` image, not on the droplet host, so this must run via `docker run` against the image built in Step 3 — a bare `python3 -c ...` on the host will fail with `ModuleNotFoundError`.

```bash
docker run --rm sway_portfolio_api python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('YOUR_REAL_PASSWORD'))"   # → PORTFOLIO_PASSWORD_HASH
nano .env   # add PORTFOLIO_PASSWORD_HASH
docker compose -f docker-compose.portfolio.yml up -d --force-recreate
```

- [ ] **Step 5: Restart nginx-portal to pick up the new routes and static mount**

```bash
docker compose -f docker-compose.public.yml up -d --force-recreate nginx-portal
```

- [ ] **Step 6: Verify end-to-end**

```bash
curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/portfolio/           # 200
curl -k -s -X POST https://proyecto-sway.site/portfolio-api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USER","password":"YOUR_REAL_PASSWORD"}'                              # {"access_token": "...", ...}
curl -k -s -o /dev/null -w "%{http_code}\n" https://proyecto-sway.site/portfolio-api/postulations   # 401 (no token)
```

- [ ] **Step 7: Confirm SWAY's own stacks are unaffected**

```bash
docker compose -f docker-compose.public.yml ps    # haproxy, nginx-portal, grafana still Up
ssh sway-privado "docker ps --format '{{.Names}}: {{.Status}}'"   # unchanged, 9 containers Up
```
