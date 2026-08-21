from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from sqlite3 import Connection

import schemas
from db import get_conn
from services import improver, storage

router = APIRouter()


@router.post("/jobs", response_model=schemas.JobsOut)
def create_job(body: schemas.JobsReq, db: Connection = Depends(get_conn)):
    descriptions = [d.strip() for d in (body.descriptions or []) if d and d.strip()]
    if not descriptions:
        raise HTTPException(400, "At least one job description is required")
    jd = descriptions[0]
    cfg = storage.get_llm(db)
    hits = improver.extract_job_keywords(jd, cfg)
    meta = improver.extract_job_metadata(jd, cfg)
    rec = storage.create_job(
        db,
        description=jd,
        resume_id=body.resume_id or None,
        keywords=hits,
        company=meta.get("company"),
        role=meta.get("role"),
        location=meta.get("location"),
        employment_type=meta.get("type"),
        salary=meta.get("salary"),
        deadline=meta.get("deadline"),
        start_date=meta.get("startDate"),
    )
    return schemas.JobsOut(
        job_id=rec["job_id"],
        company=meta.get("company"),
        role=meta.get("role"),
        location=meta.get("location"),
        employmentType=meta.get("type"),
        salary=meta.get("salary"),
    )


@router.post("/jobs/analyze", response_model=list[schemas.KeywordHit])
def analyze(body: schemas.AnalyzeReq, db: Connection = Depends(get_conn)):
    hits = improver.extract_job_keywords(body.jd or "", storage.get_llm(db))
    return [schemas.KeywordHit(**h) for h in hits]


@router.get("/jobs/{jid}")
def get_job(jid: str, db: Connection = Depends(get_conn)):
    job = storage.get_job(db, jid)
    if not job:
        raise HTTPException(404, "Job not found")
    return job
