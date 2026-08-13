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
