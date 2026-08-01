from __future__ import annotations

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import schemas
from services import keywords as kw_svc
from services.skills_fmt import categorize_skills

SEED_APPS = [
    {"company": "Acme Cloud", "role": "Frontend Engineer", "status": "applied", "match": 92, "template": "latex", "dateLabel": "2d", "location": "Remote", "employmentType": "full-time", "salary": "$140k–$170k", "deadline": None, "startDate": "ASAP"},
    {"company": "Brightly", "role": "Full-Stack Engineer", "status": "interview", "match": 90, "template": "latex", "dateLabel": "Tue 11:00", "location": "Berlin", "employmentType": "full-time", "salary": "€70k–€90k", "deadline": "2026-08-15", "startDate": None},
    {"company": "Northwind", "role": "Software Engineer", "status": "interview", "match": 88, "template": "latex", "dateLabel": "Thu 14:30", "location": "Hybrid", "employmentType": "full-time", "salary": None, "deadline": None, "startDate": "Q4 2026"},
    {"company": "Harbor Soft", "role": "Frontend Engineer", "status": "offer", "match": 93, "template": "latex", "dateLabel": "Offer", "location": "Amsterdam", "employmentType": "full-time", "salary": "€85k", "deadline": None, "startDate": None},
    {"company": "Contour", "role": "React Developer", "status": "applied", "match": 81, "template": "latex", "dateLabel": "5d", "location": "Remote", "employmentType": "contract", "salary": "$80/hr", "deadline": "2026-08-01", "startDate": "Immediate"},
    {"company": "Leaf Labs", "role": "Developer Experience Eng", "status": "wish", "match": 84, "template": "latex", "dateLabel": "—", "location": "Remote", "employmentType": "full-time", "salary": None, "deadline": None, "startDate": None},
    {"company": "Pixel Forge", "role": "Frontend Engineer", "status": "wish", "match": 78, "template": "latex", "dateLabel": "—", "location": "London", "employmentType": "full-time", "salary": "£65k–£80k", "deadline": None, "startDate": None},
    {"company": "Signal Metrics", "role": "Software Engineer II", "status": "applied", "match": 76, "template": "latex", "dateLabel": "1w", "location": "NYC", "employmentType": "full-time", "salary": "$160k–$190k", "deadline": "Rolling", "startDate": None},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dump(obj: Any) -> str:
    if hasattr(obj, "model_dump"):
        return json.dumps(obj.model_dump(mode="json"))
    return json.dumps(obj)


def _row_get(row: sqlite3.Row, key: str, default: Any = None) -> Any:
    try:
        val = row[key]
    except (KeyError, IndexError):
        return default
    return default if val is None else val


def _rec(row: sqlite3.Row, with_data: bool = True) -> dict:
    d = {
        "id": row["id"],
        "title": row["title"] or "",
        "isMaster": bool(row["is_master"]),
        "status": row["status"] or "ready",
        "company": row["company"],
        "role": row["role"],
        "location": _row_get(row, "location"),
        "employmentType": _row_get(row, "employment_type"),
        "salary": _row_get(row, "salary"),
        "deadline": _row_get(row, "deadline"),
        "startDate": _row_get(row, "start_date"),
        "updatedAt": row["updated_at"] or "",
        "sourceFile": row["source_file"],
    }
    if with_data:
        data = json.loads(row["data_json"]) if row["data_json"] else {}
        if isinstance(data, dict) and data.get("skills") is not None:
            data["skills"] = categorize_skills(data.get("skills") or [])
        d["data"] = data
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
        "location": _row_get(row, "location"),
        "employmentType": _row_get(row, "employment_type"),
        "salary": _row_get(row, "salary"),
        "deadline": _row_get(row, "deadline"),
        "startDate": _row_get(row, "start_date"),
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
    # Hide unconfirmed previews from dashboards / lists
    if include_master:
        rows = db.execute(
            "SELECT * FROM resumes WHERE status!='preview' ORDER BY is_master DESC, updated_at DESC"
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM resumes WHERE is_master=0 AND status!='preview' ORDER BY updated_at DESC"
        ).fetchall()
    out: list[dict] = []
    for r in rows:
        item = _rec(r, with_data=False)
        jd = r["job_description"] or ""
        raw = r["data_json"]
        if jd.strip() and raw:
            try:
                data = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except json.JSONDecodeError:
                data = {}
            if isinstance(data, dict):
                item["match"] = int(
                    kw_svc.score_overlap(data, jd).get("rate") or 0
                )
        out.append(item)
    return out


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
    intensity: Optional[str] = None,
    parent_id: Optional[str] = None,
    updated_at: Optional[str] = None,
    location: Optional[str] = None,
    employment_type: Optional[str] = None,
    salary: Optional[str] = None,
    deadline: Optional[str] = None,
    start_date: Optional[str] = None,
) -> dict:
    if is_master:
        db.execute("UPDATE resumes SET is_master=0 WHERE is_master=1")
    db.execute(
        """INSERT INTO resumes
           (id,title,is_master,status,company,role,location,employment_type,salary,deadline,start_date,updated_at,source_file,data_json,job_description,cover_letter,outreach_message,preview_hash,intensity,parent_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            id,
            title,
            1 if is_master else 0,
            status,
            company,
            role,
            location,
            employment_type,
            salary,
            deadline,
            start_date,
            updated_at or _now(),
            source_file,
            _dump(data),
            job_description,
            cover_letter,
            outreach_message,
            preview_hash,
            intensity,
            parent_id,
        ),
    )
    db.commit()
    return get_resume(db, id)  # type: ignore[return-value]


def confirm_preview(db: sqlite3.Connection, rid: str, preview_hash: str) -> Optional[dict]:
    row = db.execute("SELECT * FROM resumes WHERE id=?", (rid,)).fetchone()
    if not row:
        return None
    stored = row["preview_hash"] or ""
    if stored and preview_hash and stored != preview_hash:
        return None
    db.execute(
        "UPDATE resumes SET status='ready', updated_at=? WHERE id=?",
        (_now(), rid),
    )
    db.commit()
    return get_resume(db, rid)


def delete_stale_previews(db: sqlite3.Connection, parent_id: str) -> None:
    db.execute(
        "DELETE FROM resumes WHERE parent_id=? AND status='preview'",
        (parent_id,),
    )
    db.commit()


def create_job(
    db: sqlite3.Connection,
    *,
    description: str,
    resume_id: Optional[str] = None,
    keywords: Optional[list] = None,
    company: Optional[str] = None,
    role: Optional[str] = None,
    location: Optional[str] = None,
    employment_type: Optional[str] = None,
    salary: Optional[str] = None,
    deadline: Optional[str] = None,
    start_date: Optional[str] = None,
) -> dict:
    jid = f"job-{int(time.time() * 1000)}"
    db.execute(
        """INSERT INTO jobs (id, resume_id, description, keywords_json, company, role, location, employment_type, salary, deadline, start_date, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            jid,
            resume_id,
            description,
            json.dumps(keywords or []),
            company,
            role,
            location,
            employment_type,
            salary,
            deadline,
            start_date,
            _now(),
        ),
    )
    db.commit()
    return {"job_id": jid, "id": jid}


def get_job(db: sqlite3.Connection, jid: str) -> Optional[dict]:
    row = db.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
    if not row:
        return None
    try:
        kws = json.loads(row["keywords_json"] or "[]")
    except json.JSONDecodeError:
        kws = []
    return {
        "id": row["id"],
        "resume_id": row["resume_id"],
        "description": row["description"],
        "keywords": kws,
        "company": row["company"],
        "role": row["role"],
        "location": _row_get(row, "location"),
        "employment_type": _row_get(row, "employment_type"),
        "salary": _row_get(row, "salary"),
        "deadline": _row_get(row, "deadline"),
        "start_date": _row_get(row, "start_date"),
    }


def create_improvement(
    db: sqlite3.Connection,
    *,
    original_id: str,
    tailored_id: str,
    job_id: Optional[str],
    intensity: Optional[str],
    preview_hash: Optional[str],
) -> None:
    iid = f"imp-{uuid.uuid4().hex[:10]}"
    db.execute(
        """INSERT INTO improvements
           (id, original_id, tailored_id, job_id, intensity, preview_hash, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (iid, original_id, tailored_id, job_id, intensity, preview_hash, _now()),
    )
    db.commit()


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

def match_rate_for_resume(db: sqlite3.Connection, rid: str) -> int:
    """JD↔resume keyword overlap for a stored resume (0 if missing JD/data)."""
    rec = get_resume(db, rid, with_data=True)
    if not rec:
        return 0
    return int(
        kw_svc.score_overlap(
            rec.get("data") or {},
            rec.get("jobDescription") or "",
        ).get("rate")
        or 0
    )


def set_applications_match(db: sqlite3.Connection, rid: str, rate: int) -> None:
    """Set match % on all applications linked to a resume (e.g. after AI ATS check)."""
    db.execute(
        "UPDATE applications SET match=? WHERE resume_id=?",
        (max(0, min(100, int(rate))), rid),
    )
    db.commit()


def sync_applications_match_for_resume(db: sqlite3.Connection, rid: str) -> None:
    """Keep tracked applications' match % aligned with keyword overlap (no AI)."""
    set_applications_match(db, rid, match_rate_for_resume(db, rid))


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
    resume_id = payload.get("resumeId")
    if match is None:
        match = match_rate_for_resume(db, resume_id) if resume_id else 0
    location = payload.get("location")
    employment_type = payload.get("employmentType") or payload.get("employment_type")
    salary = payload.get("salary")
    deadline = payload.get("deadline")
    start_date = payload.get("startDate") or payload.get("start_date")
    db.execute(
        """INSERT INTO applications
           (id,company,role,location,employment_type,salary,deadline,start_date,status,notes,match,template,date_label,applied_at,resume_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            aid,
            payload.get("company") or "Untitled Co",
            payload.get("role") or "Role",
            location,
            employment_type,
            salary,
            deadline,
            start_date,
            status,
            payload.get("notes"),
            match,
            payload.get("template") or "latex",
            payload.get("dateLabel"),
            _now(),
            resume_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM applications WHERE id=?", (aid,)).fetchone()
    return _app(row)


def update_application(db: sqlite3.Connection, aid: str, patch: dict) -> Optional[dict]:
    row = db.execute("SELECT * FROM applications WHERE id=?", (aid,)).fetchone()
    if not row:
        return None
    mapping = {
        "status": "status",
        "notes": "notes",
        "company": "company",
        "role": "role",
        "location": "location",
        "employmentType": "employment_type",
        "salary": "salary",
        "deadline": "deadline",
        "startDate": "start_date",
        "match": "match",
    }
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


def _empty_llm_stats() -> dict:
    return {
        "since": datetime.now(timezone.utc).isoformat(),
        "calls": 0,
        "successes": 0,
        "failures": 0,
        "promptTokens": 0,
        "completionTokens": 0,
        "totalTokens": 0,
        "byOperation": {},
        "byProvider": {},
        "lastCallAt": None,
    }


def get_llm_stats(db: sqlite3.Connection) -> dict:
    row = db.execute("SELECT value FROM settings WHERE key='llm_stats'").fetchone()
    if not row:
        return reset_llm_stats(db)
    try:
        data = json.loads(row["value"])
    except json.JSONDecodeError:
        return reset_llm_stats(db)
    if not isinstance(data, dict):
        return reset_llm_stats(db)
    base = _empty_llm_stats()
    base.update({k: data.get(k, base[k]) for k in base})
    if not isinstance(base.get("byOperation"), dict):
        base["byOperation"] = {}
    if not isinstance(base.get("byProvider"), dict):
        base["byProvider"] = {}
    # Keep original since from stored data
    if data.get("since"):
        base["since"] = data["since"]
    return base


def reset_llm_stats(db: sqlite3.Connection) -> dict:
    stats = _empty_llm_stats()
    db.execute(
        "INSERT INTO settings(key,value) VALUES('llm_stats',?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(stats),),
    )
    db.commit()
    return stats


def record_llm_usage(
    db: sqlite3.Connection,
    *,
    ok: bool,
    provider: str = "",
    model: str = "",
    operation: str = "other",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
) -> dict:
    stats = get_llm_stats(db)
    now = datetime.now(timezone.utc).isoformat()
    prompt_tokens = max(0, int(prompt_tokens or 0))
    completion_tokens = max(0, int(completion_tokens or 0))
    total_tokens = max(0, int(total_tokens or 0)) or (prompt_tokens + completion_tokens)

    stats["calls"] = int(stats.get("calls") or 0) + 1
    if ok:
        stats["successes"] = int(stats.get("successes") or 0) + 1
    else:
        stats["failures"] = int(stats.get("failures") or 0) + 1
    stats["promptTokens"] = int(stats.get("promptTokens") or 0) + prompt_tokens
    stats["completionTokens"] = int(stats.get("completionTokens") or 0) + completion_tokens
    stats["totalTokens"] = int(stats.get("totalTokens") or 0) + total_tokens
    stats["lastCallAt"] = now

    op = (operation or "other").strip() or "other"
    by_op = stats.setdefault("byOperation", {})
    bucket = by_op.setdefault(op, {"calls": 0, "successes": 0, "failures": 0, "tokens": 0})
    bucket["calls"] = int(bucket.get("calls") or 0) + 1
    if ok:
        bucket["successes"] = int(bucket.get("successes") or 0) + 1
    else:
        bucket["failures"] = int(bucket.get("failures") or 0) + 1
    bucket["tokens"] = int(bucket.get("tokens") or 0) + total_tokens

    prov = (provider or "unknown").strip() or "unknown"
    by_prov = stats.setdefault("byProvider", {})
    pb = by_prov.setdefault(prov, {"calls": 0, "successes": 0, "failures": 0, "tokens": 0})
    pb["calls"] = int(pb.get("calls") or 0) + 1
    if ok:
        pb["successes"] = int(pb.get("successes") or 0) + 1
    else:
        pb["failures"] = int(pb.get("failures") or 0) + 1
    pb["tokens"] = int(pb.get("tokens") or 0) + total_tokens
    if model:
        pb["model"] = model

    db.execute(
        "INSERT INTO settings(key,value) VALUES('llm_stats',?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(stats),),
    )
    db.commit()
    return stats


_DEFAULT_LLM_STORE = {
    "mode": "single",
    "entries": [
        {
            "id": "primary",
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_base": None,
            "api_key": None,
        }
    ],
}


def get_llm(db: sqlite3.Connection) -> dict:
    from services import llm as _llm

    row = db.execute("SELECT value FROM settings WHERE key='llm'").fetchone()
    if not row:
        return _llm.normalize_llm_store(_DEFAULT_LLM_STORE)
    try:
        stored = json.loads(row["value"])
    except json.JSONDecodeError:
        return _llm.normalize_llm_store(_DEFAULT_LLM_STORE)
    return _llm.normalize_llm_store(stored)


def _persist_llm(db: sqlite3.Connection, store: dict) -> dict:
    from services import llm as _llm

    store = _llm.normalize_llm_store(store)
    for e in store["entries"]:
        info = _llm.PROVIDER_INFO.get(e.get("provider") or "")
        if info and not e.get("model"):
            e["model"] = info["defaultModel"]
    db.execute(
        "INSERT INTO settings(key,value) VALUES('llm',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(store),),
    )
    db.commit()
    return store


def put_llm(db: sqlite3.Connection, update: dict) -> dict:
    """Accept full store update or legacy flat patch."""
    cur = get_llm(db)
    merged = merge_llm(cur, update)
    return _persist_llm(db, merged)


def delete_llm_entry(db: sqlite3.Connection, entry_id: str) -> dict:
    store = get_llm(db)
    entries = [e for e in store["entries"] if e.get("id") != entry_id]
    if not entries:
        entries = [dict(_DEFAULT_LLM_STORE["entries"][0])]
    store["entries"] = entries
    if store["mode"] == "single":
        store["entries"] = entries[:1]
    return _persist_llm(db, store)


def merge_llm(cur: dict, update: dict) -> dict:
    """Apply LLM update onto store. Supports full {mode, entries} or legacy flat fields."""
    from services import llm as _llm

    store = _llm.normalize_llm_store(cur)

    if "mode" in update and update["mode"] in ("single", "fallback"):
        store["mode"] = update["mode"]

    if "entries" in update and isinstance(update["entries"], list):
        new_entries = []
        existing_by_id = {e["id"]: e for e in store["entries"]}
        for i, raw in enumerate(update["entries"]):
            if not isinstance(raw, dict):
                continue
            eid = raw.get("id") or f"e{i}-{uuid.uuid4().hex[:6]}"
            prev = existing_by_id.get(eid, {})
            provider = raw.get("provider") if raw.get("provider") is not None else prev.get("provider", "openai")
            model = raw.get("model") if raw.get("model") is not None else prev.get("model", "")
            # apiBase / api_base
            if "apiBase" in raw:
                api_base = raw.get("apiBase") or None
            elif "api_base" in raw:
                api_base = raw.get("api_base") or None
            else:
                api_base = prev.get("api_base")
            # apiKey: empty/omit keeps existing; explicit null clears
            if "apiKey" in raw:
                key_val = raw.get("apiKey")
                if key_val:
                    api_key = key_val
                elif key_val is None or key_val == "":
                    # empty string on replace form means keep; use clearApiKey flag
                    if raw.get("clearApiKey"):
                        api_key = None
                    else:
                        api_key = prev.get("api_key")
                else:
                    api_key = prev.get("api_key")
            elif "api_key" in raw and raw.get("api_key"):
                api_key = raw["api_key"]
            else:
                api_key = prev.get("api_key")
            if raw.get("clearApiKey"):
                api_key = None
            new_entries.append(
                {
                    "id": eid,
                    "provider": provider,
                    "model": model,
                    "api_base": api_base,
                    "api_key": api_key,
                }
            )
        if new_entries:
            store["entries"] = new_entries

    # Legacy flat patch against first entry
    elif any(k in update for k in ("provider", "model", "apiBase", "apiKey", "api_base", "api_key")):
        if not store["entries"]:
            store["entries"] = [dict(_DEFAULT_LLM_STORE["entries"][0])]
        e0 = dict(store["entries"][0])
        if update.get("provider") is not None:
            e0["provider"] = update["provider"]
        if update.get("model") is not None:
            e0["model"] = update["model"]
        if "apiBase" in update:
            e0["api_base"] = update.get("apiBase") or None
        if "api_base" in update:
            e0["api_base"] = update.get("api_base") or None
        if update.get("apiKey"):
            e0["api_key"] = update["apiKey"]
        if update.get("api_key"):
            e0["api_key"] = update["api_key"]
        if update.get("clearApiKey"):
            e0["api_key"] = None
        store["entries"][0] = e0

    if store["mode"] == "single":
        store["entries"] = store["entries"][:1] or [dict(_DEFAULT_LLM_STORE["entries"][0])]
    return store


def seed_demo(db: sqlite3.Connection) -> None:
    if db.execute("SELECT COUNT(*) FROM applications").fetchone()[0] > 0:
        return
    for s in SEED_APPS:
        aid = f"app-{uuid.uuid4().hex[:8]}"
        db.execute(
            """INSERT INTO applications
               (id,company,role,location,employment_type,salary,deadline,start_date,status,notes,match,template,date_label,applied_at,resume_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                aid,
                s["company"],
                s["role"],
                s.get("location"),
                s.get("employmentType"),
                s.get("salary"),
                s.get("deadline"),
                s.get("startDate"),
                s["status"],
                None,
                s["match"],
                s["template"],
                s["dateLabel"],
                None,
                None,
            ),
        )
    db.commit()
