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
