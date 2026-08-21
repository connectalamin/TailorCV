import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS resumes (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  is_master       INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'ready',
  company         TEXT,
  role            TEXT,
  location        TEXT,
  employment_type TEXT,
  salary          TEXT,
  deadline        TEXT,
  start_date      TEXT,
  updated_at      TEXT NOT NULL,
  source_file     TEXT,
  data_json       TEXT NOT NULL DEFAULT '{}',
  job_description TEXT,
  cover_letter    TEXT,
  outreach_message TEXT,
  latex_source    TEXT,
  preview_hash    TEXT,
  intensity       TEXT,
  parent_id       TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  resume_id   TEXT,
  description TEXT NOT NULL,
  keywords_json TEXT,
  company     TEXT,
  role        TEXT,
  location    TEXT,
  employment_type TEXT,
  salary      TEXT,
  deadline    TEXT,
  start_date  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS improvements (
  id              TEXT PRIMARY KEY,
  original_id     TEXT NOT NULL,
  tailored_id     TEXT NOT NULL,
  job_id          TEXT,
  intensity       TEXT,
  preview_hash    TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id          TEXT PRIMARY KEY,
  company     TEXT NOT NULL,
  role        TEXT NOT NULL,
  location    TEXT,
  employment_type TEXT,
  salary      TEXT,
  deadline    TEXT,
  start_date  TEXT,
  status      TEXT NOT NULL DEFAULT 'wish',
  notes       TEXT,
  match       INTEGER,
  template    TEXT,
  date_label  TEXT,
  applied_at  TEXT,
  resume_id   TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


def _add_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, decl in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def _migrate(conn: sqlite3.Connection) -> None:
    meta_cols = {
        "location": "TEXT",
        "employment_type": "TEXT",
        "salary": "TEXT",
        "deadline": "TEXT",
        "start_date": "TEXT",
    }
    _add_columns(
        conn,
        "resumes",
        {
            "intensity": "TEXT",
            "parent_id": "TEXT",
            "latex_source": "TEXT",
            **meta_cols,
        },
    )
    _add_columns(conn, "jobs", meta_cols)
    _add_columns(conn, "applications", meta_cols)


def init_db() -> None:
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with _connect() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
        conn.commit()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_conn():
    """
    FastAPI dependency. Commits *before* the response is returned so follow-up
    requests see writes (Starlette runs post-yield cleanup after send).
    """
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
