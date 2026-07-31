from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlite3 import Connection

import schemas
from db import get_conn
from services import llm as llm_svc
from services import storage

router = APIRouter()


def _out(cfg: dict) -> schemas.LLMConfigOut:
    base = cfg.get("api_base")
    return schemas.LLMConfigOut(
        provider=cfg.get("provider") or "openai",
        model=cfg.get("model") or "",
        apiBase=base if base else None,
        hasApiKey=bool(cfg.get("api_key")),
    )


@router.get("/llm", response_model=schemas.LLMConfigOut)
def get_llm(db: Connection = Depends(get_conn)):
    return _out(storage.get_llm(db))


@router.put("/llm", response_model=schemas.LLMConfigOut)
def put_llm(body: schemas.LLMUpdate, db: Connection = Depends(get_conn)):
    cfg = storage.put_llm(db, body.model_dump(exclude_unset=True))
    return _out(cfg)


@router.post("/llm/test", response_model=schemas.TestOut)
def test_llm(
    body: schemas.LLMUpdate | None = None, db: Connection = Depends(get_conn)
):
    cfg = storage.get_llm(db)
    if body is not None:
        cfg = storage.merge_llm(cfg, body.model_dump(exclude_unset=True))
    ok, msg = llm_svc.test(cfg)
    return schemas.TestOut(ok=ok, message=msg)


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
