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
