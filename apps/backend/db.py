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
  updated_at      TEXT NOT NULL,
  source_file     TEXT,
  data_json       TEXT NOT NULL DEFAULT '{}',
  job_description TEXT,
  cover_letter    TEXT,
  outreach_message TEXT,
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


def _migrate(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(resumes)").fetchall()}
    if "intensity" not in cols:
        conn.execute("ALTER TABLE resumes ADD COLUMN intensity TEXT")
    if "parent_id" not in cols:
        conn.execute("ALTER TABLE resumes ADD COLUMN parent_id TEXT")


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
