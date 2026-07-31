from __future__ import annotations

import json
import random
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import schemas

SEED_APPS = [
    {"company": "Stripe", "role": "Senior Frontend Engineer", "status": "applied", "match": 92, "template": "swiss-two-column", "dateLabel": "2d"},
    {"company": "Figma", "role": "Product Engineer", "status": "interview", "match": 90, "template": "swiss-single", "dateLabel": "Tue 11:00"},
    {"company": "Linear", "role": "Design Engineer", "status": "interview", "match": 88, "template": "vivid", "dateLabel": "Thu 14:30"},
    {"company": "Ramp", "role": "Senior Frontend Engineer", "status": "offer", "match": 93, "template": "swiss-two-column", "dateLabel": "$185k"},
    {"company": "Notion", "role": "Frontend Engineer", "status": "applied", "match": 81, "template": "clean", "dateLabel": "5d"},
    {"company": "Vercel", "role": "Developer Experience Eng", "status": "wish", "match": 84, "template": "modern", "dateLabel": "—"},
    {"company": "Retool", "role": "Frontend Engineer", "status": "wish", "match": 78, "template": "latex", "dateLabel": "—"},
    {"company": "Datadog", "role": "Software Engineer II", "status": "applied", "match": 76, "template": "modern-two-column", "dateLabel": "1w"},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dump(obj: Any) -> str:
    if hasattr(obj, "model_dump"):
        return json.dumps(obj.model_dump(mode="json"))
    return json.dumps(obj)


def _rec(row: sqlite3.Row, with_data: bool = True) -> dict:
    d = {
        "id": row["id"],
        "title": row["title"] or "",
        "isMaster": bool(row["is_master"]),
        "status": row["status"] or "ready",
        "company": row["company"],
        "role": row["role"],
        "updatedAt": row["updated_at"] or "",
        "sourceFile": row["source_file"],
    }
    if with_data:
        d["data"] = json.loads(row["data_json"]) if row["data_json"] else {}
        if row["job_description"]:
            d["jobDescription"] = row["job_description"]
        if row["cover_letter"]:
            d["coverLetter"] = row["cover_letter"]
        if row["outreach_message"]:
            d["outreachMessage"] = row["outreach_message"]
    return d


def _app(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "company": row["company"],
        "role": row["role"],
        "status": row["status"],
        "notes": row["notes"],
        "match": row["match"],
        "template": row["template"],
        "dateLabel": row["date_label"],
        "appliedAt": row["applied_at"],
        "resumeId": row["resume_id"],
    }


# ---------- resumes ----------

def list_resumes(db: sqlite3.Connection, include_master: bool = True) -> list[dict]:
    if include_master:
        rows = db.execute("SELECT * FROM resumes ORDER BY is_master DESC, updated_at DESC").fetchall()
    else:
        rows = db.execute("SELECT * FROM resumes WHERE is_master=0 ORDER BY updated_at DESC").fetchall()
    return [_rec(r, with_data=False) for r in rows]


def get_resume(db: sqlite3.Connection, rid: str, with_data: bool = True) -> Optional[dict]:
    row = db.execute("SELECT * FROM resumes WHERE id=?", (rid,)).fetchone()
    return _rec(row, with_data) if row else None


def get_master(db: sqlite3.Connection, with_data: bool = True) -> Optional[dict]:
    row = db.execute("SELECT * FROM resumes WHERE is_master=1 ORDER BY updated_at DESC LIMIT 1").fetchone()
    return _rec(row, with_data) if row else None


def create_resume(
    db: sqlite3.Connection,
    *,
    id: str,
    title: str,
    is_master: bool,
    status: str,
    company: Optional[str],
    role: Optional[str],
    data: Any,
    job_description: Optional[str] = None,
    cover_letter: Optional[str] = None,
    outreach_message: Optional[str] = None,
    source_file: Optional[str] = None,
    preview_hash: Optional[str] = None,
    updated_at: Optional[str] = None,
) -> dict:
    if is_master:
        db.execute("UPDATE resumes SET is_master=0 WHERE is_master=1")
    db.execute(
        """INSERT INTO resumes
           (id,title,is_master,status,company,role,updated_at,source_file,data_json,job_description,cover_letter,outreach_message,preview_hash)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            id,
            title,
            1 if is_master else 0,
            status,
            company,
            role,
            updated_at or _now(),
            source_file,
            _dump(data),
            job_description,
            cover_letter,
            outreach_message,
            preview_hash,
        ),
    )
    db.commit()
    return get_resume(db, id)  # type: ignore[return-value]


def update_resume(db: sqlite3.Connection, rid: str, patch: dict) -> Optional[dict]:
    row = db.execute("SELECT * FROM resumes WHERE id=?", (rid,)).fetchone()
    if not row:
        return None
    sets: list[str] = []
    vals: list[Any] = []
    mapping = {
        "coverLetter": ("cover_letter", lambda v: v),
        "outreachMessage": ("outreach_message", lambda v: v),
        "jobDescription": ("job_description", lambda v: v),
        "title": ("title", lambda v: v),
    }
    for k, (col, fn) in mapping.items():
        if k in patch:
            sets.append(f"{col}=?")
            vals.append(fn(patch[k]))
    if "data" in patch and patch["data"] is not None:
        sets.append("data_json=?")
        vals.append(_dump(patch["data"]))
    sets.append("updated_at=?")
    vals.append(_now())
    vals.append(rid)
    db.execute(f"UPDATE resumes SET {', '.join(sets)} WHERE id=?", vals)
    db.commit()
    return get_resume(db, rid)


def delete_resume(db: sqlite3.Connection, rid: str) -> bool:
    cur = db.execute("DELETE FROM resumes WHERE id=?", (rid,))
    db.commit()
    return cur.rowcount > 0


# ---------- applications ----------

def list_applications(db: sqlite3.Connection) -> dict:
    cols: dict[str, list[dict]] = {"wish": [], "applied": [], "interview": [], "offer": []}
    for row in db.execute("SELECT * FROM applications ORDER BY rowid DESC").fetchall():
        a = _app(row)
        cols.setdefault(a["status"], []).append(a)
        if a["status"] in cols and a["status"] not in {"wish", "applied", "interview", "offer"}:
            cols[a["status"]].append(a)
    return cols


def create_application(db: sqlite3.Connection, payload: dict) -> dict:
    aid = f"app-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}"
    status = payload.get("status") or "wish"
    match = payload.get("match")
    if match is None:
        match = 70 + random.randint(0, 24)
    db.execute(
        """INSERT INTO applications
           (id,company,role,status,notes,match,template,date_label,applied_at,resume_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            aid,
            payload.get("company") or "Untitled Co",
            payload.get("role") or "Role",
            status,
            payload.get("notes"),
            match,
            payload.get("template") or "latex",
            payload.get("dateLabel"),
            _now(),
            payload.get("resumeId"),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM applications WHERE id=?", (aid,)).fetchone()
    return _app(row)


def update_application(db: sqlite3.Connection, aid: str, patch: dict) -> Optional[dict]:
    row = db.execute("SELECT * FROM applications WHERE id=?", (aid,)).fetchone()
    if not row:
        return None
    mapping = {"status": "status", "notes": "notes", "company": "company", "role": "role"}
    sets, vals = [], []
    for k, col in mapping.items():
        if k in patch:
            sets.append(f"{col}=?")
            vals.append(patch[k])
    if sets:
        vals.append(aid)
        db.execute(f"UPDATE applications SET {', '.join(sets)} WHERE id=?", vals)
        db.commit()
    row = db.execute("SELECT * FROM applications WHERE id=?", (aid,)).fetchone()
    return _app(row) if row else None


def delete_application(db: sqlite3.Connection, aid: str) -> bool:
    cur = db.execute("DELETE FROM applications WHERE id=?", (aid,))
    db.commit()
    return cur.rowcount > 0


# ---------- counts / settings ----------

def counts(db: sqlite3.Connection) -> tuple[int, int]:
    r = db.execute("SELECT COUNT(*) FROM resumes").fetchone()[0]
    a = db.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
    return int(r), int(a)


_DEFAULT_LLM = {"provider": "openai", "model": "gpt-4o-mini", "api_base": None, "api_key": None}


def get_llm(db: sqlite3.Connection) -> dict:
    row = db.execute("SELECT value FROM settings WHERE key='llm'").fetchone()
    if not row:
        return dict(_DEFAULT_LLM)
    try:
        stored = json.loads(row["value"])
    except json.JSONDecodeError:
        return dict(_DEFAULT_LLM)
    merged = dict(_DEFAULT_LLM)
    merged.update({k: v for k, v in stored.items() if v is not None})
    return merged


def put_llm(db: sqlite3.Connection, update: dict) -> dict:
    cur = merge_llm(get_llm(db), update)
    from services import llm as _llm  # local import to avoid cycle at module load

    info = _llm.PROVIDER_INFO.get(cur["provider"])
    if info and (not cur.get("model")):
        cur["model"] = info["defaultModel"]
    db.execute(
        "INSERT INTO settings(key,value) VALUES('llm',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(cur),),
    )
    db.commit()
    return cur


def merge_llm(cur: dict, update: dict) -> dict:
    """Apply a partial LLMUpdate onto a config dict without persisting."""
    out = dict(cur)
    if update.get("provider") is not None:
        out["provider"] = update["provider"]
    if update.get("model") is not None:
        out["model"] = update["model"]
    if "apiBase" in update:
        out["api_base"] = update.get("apiBase") or None
    if "apiKey" in update and update.get("apiKey"):
        out["api_key"] = update["apiKey"]
    return out


def seed_demo(db: sqlite3.Connection) -> None:
    if db.execute("SELECT COUNT(*) FROM applications").fetchone()[0] > 0:
        return
    for s in SEED_APPS:
        aid = f"app-{uuid.uuid4().hex[:8]}"
        db.execute(
            """INSERT INTO applications
               (id,company,role,status,notes,match,template,date_label,applied_at,resume_id)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (aid, s["company"], s["role"], s["status"], None, s["match"], s["template"], s["dateLabel"], None, None),
        )
    db.commit()
