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
from services import improver, llm as llm_svc, parser, storage, templates
from services.skills_fmt import categorize_skills

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
    if not (text or "").strip():
        raise HTTPException(422, "Empty extracted text — upload a readable resume")
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
@router.post("/resumes/{rid}/improve/preview", response_model=schemas.ImproveOut)
def improve_preview(
    rid: str, body: schemas.ImproveReq, db: Connection = Depends(get_conn)
):
    """Compute tailored draft + preview_hash. Persists as status=preview until confirm."""
    base = storage.get_resume(db, rid, with_data=True) or storage.get_master(db, with_data=True)
    if not base:
        raise HTTPException(404, "No master resume — upload one first")

    job = storage.get_job(db, body.job_id) if body.job_id else None
    jd = (body.jd or "").strip() or (job or {}).get("description") or (base.get("jobDescription") or "")
    if len(jd.strip()) < 40:
        raise HTTPException(400, "Job description too short — paste a fuller posting")

    parent_id = base["id"]
    storage.delete_stale_previews(db, parent_id)

    data = dict(base.get("data") or {})
    # Identity lock for confirm step
    personal_fingerprint = hashlib.sha256(
        f"{data.get('name','')}|{(data.get('contact') or {}).get('email','')}".encode()
    ).hexdigest()[:16]

    role = base.get("role") or data.get("title") or (job or {}).get("role") or ""
    cfg = storage.get_llm(db)
    intensity = improver.normalize_intensity(body.intensity)

    result = improver.improve_resume(
        data,
        jd,
        cfg,
        intensity=intensity,
        role_hint=role or "",
        hint=(body.hint or "").strip(),
    )
    new_data = result["data"]
    # Re-check personal info unchanged
    if (new_data.get("name") or "") != (data.get("name") or ""):
        new_data["name"] = data.get("name") or ""
    new_data["contact"] = dict(data.get("contact") or {})

    person = (data.get("name") or "").strip() or "Resume"
    company = base.get("company") or (job or {}).get("company") or "Target Company"
    new_id = f"tailored-{int(time.time() * 1000)}"
    preview_hash = result["preview_hash"] + ":" + personal_fingerprint

    storage.create_resume(
        db,
        id=new_id,
        title=f"Tailored · {person}",
        is_master=False,
        status="preview",
        company=company,
        role=new_data.get("title") or role or None,
        data=new_data,
        job_description=jd or None,
        cover_letter=result["cover_letter"],
        outreach_message=result["outreach_message"],
        preview_hash=preview_hash,
        intensity=result["intensity"],
        parent_id=parent_id,
    )

    return schemas.ImproveOut(
        resume_id=new_id,
        preview_hash=preview_hash,
        cover_letter=result["cover_letter"],
        outreach_message=result["outreach_message"],
        intensity=result["intensity"],
        keywords=[schemas.KeywordHit(**h) for h in result["keywords"]],
        status="preview",
        data=schemas.ResumeData.model_validate(new_data),
    )


@router.post("/resumes/{rid}/confirm", status_code=204)
@router.post("/resumes/{rid}/improve/confirm", status_code=204)
def confirm(rid: str, body: schemas.ConfirmReq, db: Connection = Depends(get_conn)):
    """Persist tailored resume only if preview_hash matches."""
    row = db.execute(
        "SELECT preview_hash, status, parent_id, company, role, intensity FROM resumes WHERE id=?",
        (rid,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Resume not found")
    stored = row["preview_hash"] or ""
    if stored and body.preview_hash and stored != body.preview_hash:
        raise HTTPException(409, "preview_hash mismatch — confirm rejected")

    rec = storage.confirm_preview(db, rid, body.preview_hash or stored)
    if not rec:
        raise HTTPException(409, "preview_hash mismatch — confirm rejected")

    parent_id = row["parent_id"] or ""
    storage.create_improvement(
        db,
        original_id=parent_id or rid,
        tailored_id=rid,
        job_id=None,
        intensity=row["intensity"],
        preview_hash=stored,
    )

    if body.create_application:
        storage.create_application(
            db,
            {
                "company": row["company"] or "Target Company",
                "role": row["role"] or "Role",
                "status": "applied",
                "resumeId": rid,
                "notes": f"Tailored ({row['intensity'] or 'balanced'})",
            },
        )
    return Response(status_code=204)


@router.post("/resumes/{rid}/restructure", response_model=schemas.ResumeRecord)
def restructure_resume(rid: str, db: Connection = Depends(get_conn)):
    """Re-parse stored resume into ATS sections (fix blob Objective)."""
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    data = dict(rec.get("data") or {})
    text = parser.data_to_plain_text(data)
    # Prefer blob summary as source when present
    if llm_svc.is_blob_resume(data) and data.get("summary"):
        text = str(data["summary"])
    new_data = parser.build_data(rec.get("sourceFile") or "resume.txt", text, cfg)
    # Preserve contact/name if restructure empties them
    if not new_data.get("name"):
        new_data["name"] = data.get("name") or "Candidate"
    if data.get("contact") and not any((new_data.get("contact") or {}).values()):
        new_data["contact"] = data["contact"]
    updated = storage.update_resume(db, rid, {"data": new_data})
    if not updated:
        raise HTTPException(404, "Resume not found")
    return updated


@router.post("/resumes/{rid}/ai/rewrite-section", response_model=schemas.AiRewriteOut)
def ai_rewrite_section(
    rid: str, body: schemas.AiRewriteReq, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    if not llm_svc.is_configured(cfg):
        raise HTTPException(400, "LLM not configured — add an API key in Settings")
    data = (body.data.model_dump(mode="json") if body.data else None) or dict(
        rec.get("data") or {}
    )
    jd = (body.jd or rec.get("jobDescription") or "").strip()
    patch = llm_svc.rewrite_section(
        data, body.section, jd, cfg, intensity=improver.normalize_intensity(body.intensity)
    )
    if not patch:
        raise HTTPException(502, "AI rewrite failed — try another model or check the API key")
    out = dict(data)
    for key in ("summary", "skills", "exp", "projects", "edu", "awards", "title"):
        if key in patch and patch[key] is not None:
            out[key] = patch[key]
    if "skills" in out:
        out["skills"] = categorize_skills(out.get("skills") or [])
    # Map objective alias
    if "summary" not in patch and body.section.lower() in ("objective", "summary"):
        if isinstance(patch.get("objective"), str):
            out["summary"] = patch["objective"]
    try:
        validated = schemas.ResumeData.model_validate(out)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Invalid AI response shape: {e}")
    return schemas.AiRewriteOut(data=validated)


@router.post("/resumes/{rid}/ai/generate-cover", response_model=schemas.AiAuxOut)
def ai_generate_cover(
    rid: str, body: schemas.AiAuxReq | None = None, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    data = (
        body.data.model_dump(mode="json") if body and body.data else None
    ) or dict(rec.get("data") or {})
    jd = ((body.jd if body else None) or rec.get("jobDescription") or "").strip()
    cover = ""
    outreach = ""
    if llm_svc.is_configured(cfg):
        aux = llm_svc.generate_aux(data, jd or "general application", cfg)
        if aux:
            cover = str(aux.get("cover_letter") or "")
            outreach = str(aux.get("outreach_message") or "")
    if not cover:
        cover = templates.default_cover(data, data.get("title"))
    return schemas.AiAuxOut(cover_letter=cover, outreach_message=outreach)


@router.post("/resumes/{rid}/ai/generate-outreach", response_model=schemas.AiAuxOut)
def ai_generate_outreach(
    rid: str, body: schemas.AiAuxReq | None = None, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    data = (
        body.data.model_dump(mode="json") if body and body.data else None
    ) or dict(rec.get("data") or {})
    jd = ((body.jd if body else None) or rec.get("jobDescription") or "").strip()
    cover = ""
    outreach = ""
    if llm_svc.is_configured(cfg):
        aux = llm_svc.generate_aux(data, jd or "general application", cfg)
        if aux:
            cover = str(aux.get("cover_letter") or "")
            outreach = str(aux.get("outreach_message") or "")
    if not outreach:
        outreach = templates.default_outreach(data, data.get("title"))
    return schemas.AiAuxOut(cover_letter=cover, outreach_message=outreach)


@router.post("/resumes/{rid}/ai/match", response_model=schemas.AiMatchOut)
def ai_match(
    rid: str, body: schemas.AiMatchReq, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    jd = (body.jd or "").strip()
    if len(jd) < 40:
        raise HTTPException(400, "Job description too short")
    cfg = storage.get_llm(db)
    data = (body.data.model_dump(mode="json") if body.data else None) or dict(
        rec.get("data") or {}
    )
    keywords = improver.extract_job_keywords(jd, cfg)
    notes = ""
    if llm_svc.is_configured(cfg):
        notes = llm_svc.match_notes(data, jd, keywords, cfg) or ""
    return schemas.AiMatchOut(
        keywords=[schemas.KeywordHit(**h) for h in keywords],
        notes=notes,
    )
