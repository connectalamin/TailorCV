from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlite3 import Connection

import schemas
from db import get_conn
from services import llm as llm_svc
from services import storage

router = APIRouter()


def _entry_out(e: dict) -> schemas.LLMEntryOut:
    base = e.get("api_base")
    return schemas.LLMEntryOut(
        id=e.get("id") or "primary",
        provider=e.get("provider") or "openai",
        model=e.get("model") or "",
        apiBase=base if base else None,
        hasApiKey=bool(e.get("api_key")),
    )


def _out(store: dict) -> schemas.LLMConfigOut:
    store = llm_svc.normalize_llm_store(store)
    entries = [_entry_out(e) for e in store["entries"]]
    first = entries[0] if entries else _entry_out({})
    return schemas.LLMConfigOut(
        mode=store.get("mode") or "single",
        entries=entries,
        provider=first.provider,
        model=first.model,
        apiBase=first.apiBase,
        hasApiKey=first.hasApiKey,
    )


@router.get("/llm", response_model=schemas.LLMConfigOut)
def get_llm(db: Connection = Depends(get_conn)):
    return _out(storage.get_llm(db))


@router.put("/llm", response_model=schemas.LLMConfigOut)
def put_llm(body: schemas.LLMUpdate, db: Connection = Depends(get_conn)):
    raw = body.model_dump(exclude_unset=True)
    if raw.get("entries"):
        raw["entries"] = [
            e if isinstance(e, dict) else e
            for e in raw["entries"]
        ]
    cfg = storage.put_llm(db, raw)
    return _out(cfg)


@router.delete("/llm/entries/{entry_id}", response_model=schemas.LLMConfigOut)
def delete_llm_entry(entry_id: str, db: Connection = Depends(get_conn)):
    cfg = storage.delete_llm_entry(db, entry_id)
    return _out(cfg)


@router.post("/llm/test", response_model=schemas.TestOut)
def test_llm(
    body: schemas.LLMUpdate | None = None, db: Connection = Depends(get_conn)
):
    cfg = storage.get_llm(db)
    entry_id = None
    if body is not None:
        raw = body.model_dump(exclude_unset=True)
        entry_id = raw.pop("entryId", None)
        cfg = storage.merge_llm(cfg, raw)
    ok, msg = llm_svc.test(cfg, entry_id=entry_id)
    return schemas.TestOut(ok=ok, message=msg)


def _stats_out(raw: dict) -> schemas.LlmStatsOut:
    by_op = {
        k: schemas.LlmOpStats(**v) if isinstance(v, dict) else schemas.LlmOpStats()
        for k, v in (raw.get("byOperation") or {}).items()
    }
    by_prov = {
        k: schemas.LlmOpStats(**v) if isinstance(v, dict) else schemas.LlmOpStats()
        for k, v in (raw.get("byProvider") or {}).items()
    }
    return schemas.LlmStatsOut(
        since=raw.get("since") or "",
        calls=int(raw.get("calls") or 0),
        successes=int(raw.get("successes") or 0),
        failures=int(raw.get("failures") or 0),
        promptTokens=int(raw.get("promptTokens") or 0),
        completionTokens=int(raw.get("completionTokens") or 0),
        totalTokens=int(raw.get("totalTokens") or 0),
        byOperation=by_op,
        byProvider=by_prov,
        lastCallAt=raw.get("lastCallAt"),
    )


@router.get("/llm/stats", response_model=schemas.LlmStatsOut)
def get_llm_stats(db: Connection = Depends(get_conn)):
    return _stats_out(storage.get_llm_stats(db))


@router.delete("/llm/stats", response_model=schemas.LlmStatsOut)
def reset_llm_stats(db: Connection = Depends(get_conn)):
    return _stats_out(storage.reset_llm_stats(db))


@router.get("/status", response_model=schemas.SystemStatus)
def status(db: Connection = Depends(get_conn)):
    cfg = storage.get_llm(db)
    resumes, applications = storage.counts(db)
    return schemas.SystemStatus(
        backend="ok",
        llm="ok" if llm_svc.is_configured(cfg) else "unconfigured",
        resumes=resumes,
        applications=applications,
        lastChecked=datetime.now(timezone.utc).isoformat(),
    )
