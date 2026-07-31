from __future__ import annotations

import time

from fastapi import APIRouter

import schemas
from services import keywords

router = APIRouter()


@router.post("/jobs", response_model=schemas.JobsOut)
def create_job(body: schemas.JobsReq):
    return schemas.JobsOut(job_id=f"job-{int(time.time() * 1000)}")


@router.post("/jobs/analyze", response_model=list[schemas.KeywordHit])
def analyze(body: schemas.AnalyzeReq):
    return [schemas.KeywordHit(**h) for h in keywords.extract(body.jd)]
