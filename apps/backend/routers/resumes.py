from __future__ import annotations

import hashlib
import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, Response
from sqlite3 import Connection

import config
import schemas
from db import get_conn
from services import parser, storage, templates
from services import llm as llm_svc

router = APIRouter()


@router.post("/resumes/upload", response_model=schemas.ResumeRecord)
async def upload(file: UploadFile = File(...), db: Connection = Depends(get_conn)):
    name = file.filename or "resume.txt"
    ext = ("." + (name.rsplit(".", 1)[-1] if "." in name else "")).lower()
    if ext not in config.ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported type {ext}. Use PDF, DOCX, TEX, or TXT.")
    content = await file.read()
    if len(content) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 4MB)")
    try:
        text, _ext = parser.extract_text(name, content)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Could not parse file: {e}")
    cfg = storage.get_llm(db)
    data = parser.build_data(name, text, cfg)
    rid = f"master-{uuid.uuid4().hex[:8]}"
    rec = storage.create_resume(
        db,
        id=rid,
        title="Master Resume",
        is_master=True,
        status="ready",
        company=None,
        role=data.get("title") or None,
        data=data,
        source_file=name,
    )
    return rec


@router.get("/resumes", response_model=list[schemas.ResumeListItem])
def list_resumes(
    include_master: bool = Query(True), db: Connection = Depends(get_conn)
):
    return storage.list_resumes(db, include_master=include_master)


@router.get("/resumes/{rid}", response_model=schemas.ResumeRecord)
def get_resume(rid: str, db: Connection = Depends(get_conn)):
    rec = storage.get_resume(db, rid)
    if not rec:
        raise HTTPException(404, "Resume not found")
    return rec


@router.patch("/resumes/{rid}", response_model=schemas.ResumeRecord)
def patch_resume(
    rid: str, body: schemas.ResumePatch, db: Connection = Depends(get_conn)
):
    patch = body.model_dump(exclude_unset=True)
    rec = storage.update_resume(db, rid, patch)
    if not rec:
        raise HTTPException(404, "Resume not found")
    return rec


@router.delete("/resumes/{rid}", status_code=204)
def delete_resume(rid: str, db: Connection = Depends(get_conn)):
    if not storage.delete_resume(db, rid):
        raise HTTPException(404, "Resume not found")
    return Response(status_code=204)


@router.get("/resumes/{rid}/jd")
def get_jd(rid: str, db: Connection = Depends(get_conn)):
    rec = storage.get_resume(db, rid, with_data=False)
    if not rec:
        raise HTTPException(404, "Resume not found")
    full = storage.get_resume(db, rid, with_data=True)
    return JSONResponse(content=full.get("jobDescription") if full else None)


@router.post("/resumes/{rid}/improve", response_model=schemas.ImproveOut)
def improve(rid: str, body: schemas.ImproveReq, db: Connection = Depends(get_conn)):
    base = storage.get_resume(db, rid, with_data=True) or storage.get_master(db, with_data=True)
    if not base:
        raise HTTPException(404, "No master resume — upload one first")
    data = dict(base.get("data") or {})
    jd = (body.jd or "").strip() or (base.get("jobDescription") or "")
    role = base.get("role") or data.get("title") or ""
    cfg = storage.get_llm(db)

    summary = data.get("summary", "")
    cover = ""
    outreach = ""
    tailored = llm_svc.tailor(data, jd, cfg) if llm_svc.is_configured(cfg) else None
    if tailored:
        summary = tailored.get("summary") or summary
        cover = tailored.get("cover_letter") or ""
        outreach = tailored.get("outreach_message") or ""
    if not cover:
        cover = templates.default_cover(data, role or None)
    if not outreach:
        outreach = templates.default_outreach(data, role or None)

    new_data = {**data, "summary": summary}
    new_id = f"tailored-{int(time.time() * 1000)}"
    preview_hash = "sha256:" + hashlib.sha256((new_id + jd).encode()).hexdigest()[:16]
    company = base.get("company") or "Target Company"
    person = (data.get("name") or "").strip() or "Resume"

    storage.create_resume(
        db,
        id=new_id,
        title=f"Tailored · {person}",
        is_master=False,
        status="ready",
        company=company,
        role=role or None,
        data=new_data,
        job_description=jd or None,
        cover_letter=cover,
        outreach_message=outreach,
        preview_hash=preview_hash,
    )
    return schemas.ImproveOut(
        resume_id=new_id,
        preview_hash=preview_hash,
        cover_letter=cover,
        outreach_message=outreach,
    )


@router.post("/resumes/{rid}/confirm", status_code=204)
def confirm(rid: str, body: schemas.ConfirmReq, db: Connection = Depends(get_conn)):
    row = db.execute("SELECT preview_hash FROM resumes WHERE id=?", (rid,)).fetchone()
    if not row:
        raise HTTPException(404, "Resume not found")
    stored = row["preview_hash"]
    if stored and body.preview_hash and stored != body.preview_hash:
        raise HTTPException(409, "preview_hash mismatch — confirm rejected")
    return Response(status_code=204)
