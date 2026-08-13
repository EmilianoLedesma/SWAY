import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException

from auth import create_token, get_current_user, verify_password
from db import get_conn, init_db, seed_postulations
from models import ContactMessage, LoginRequest, PostulationIn, PostulationUpdate

app = FastAPI(title="Portfolio API")

PORTFOLIO_USER = os.environ.get("PORTFOLIO_USER", "")
PORTFOLIO_PASSWORD_HASH = os.environ.get("PORTFOLIO_PASSWORD_HASH", "")
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


@app.post("/portfolio-api/login")
def login(payload: LoginRequest):
    if payload.username != PORTFOLIO_USER or not verify_password(
        payload.password, PORTFOLIO_PASSWORD_HASH
    ):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    return {"access_token": create_token(payload.username), "token_type": "bearer"}


@app.get("/portfolio-api/postulations")
def list_postulations(user: dict = Depends(get_current_user)):
    conn = _conn()
    rows = conn.execute(
        "SELECT * FROM postulations ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@app.post("/portfolio-api/postulations", status_code=201)
def create_postulation(payload: PostulationIn, user: dict = Depends(get_current_user)):
    conn = _conn()
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
    conn = _conn()
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
    conn = _conn()
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
    conn = _conn()
    conn.execute(
        "INSERT INTO contact_messages (name, email, message, created_at) VALUES (?, ?, ?, ?)",
        (payload.name, payload.email, payload.message, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()
    return {"status": "received"}
