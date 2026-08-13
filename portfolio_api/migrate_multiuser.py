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
