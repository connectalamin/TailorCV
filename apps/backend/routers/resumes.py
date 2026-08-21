from __future__ import annotations

import hashlib
import re
import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, Response
from sqlite3 import Connection

import config
import schemas
from db import get_conn
from services import improver, llm as llm_svc, parser, storage, templates
from services import content_check as content_check_svc
from services import keywords as kw_svc
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

    job_company = (job or {}).get("company") or None
    job_role = (job or {}).get("role") or None
    job_location = (job or {}).get("location") or None
    job_employment_type = (job or {}).get("employment_type") or None
    job_salary = (job or {}).get("salary") or None
    job_deadline = (job or {}).get("deadline") or None
    job_start_date = (job or {}).get("start_date") or None
    cfg = storage.get_llm(db)

    # Re-extract when job row is missing company/role (LLM miss, old jobs, or no job_id).
    placeholders = {"target company", "untitled co", "untitled", "company"}
    need_meta = (
        not job_company
        or not job_role
        or (job_company or "").strip().lower() in placeholders
    )
    if need_meta and jd.strip():
        meta = improver.extract_job_metadata(jd, cfg)
        if meta.get("company") and (
            not job_company
            or (job_company or "").strip().lower() in placeholders
        ):
            job_company = meta["company"]
        job_role = job_role or meta.get("role")
        job_location = job_location or meta.get("location")
        job_employment_type = job_employment_type or meta.get("type")
        job_salary = job_salary or meta.get("salary")
        job_deadline = job_deadline or meta.get("deadline")
        job_start_date = job_start_date or meta.get("startDate")

    role = job_role or base.get("role") or data.get("title") or ""
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
    # Prefer JD metadata for tracker/application fields; resume title stays in data
    company = (job_company or "").strip() or None
    if not company or company.lower() in placeholders:
        company = "Target Company"
    app_role = job_role or new_data.get("title") or role or None
    location = job_location or base.get("location") or None
    employment_type = job_employment_type or base.get("employmentType") or None
    salary = job_salary or base.get("salary") or None
    deadline = job_deadline or base.get("deadline") or None
    start_date = job_start_date or base.get("startDate") or None
    new_id = f"tailored-{int(time.time() * 1000)}"
    preview_hash = result["preview_hash"] + ":" + personal_fingerprint

    storage.create_resume(
        db,
        id=new_id,
        title=f"Tailored · {person}",
        is_master=False,
        status="preview",
        company=company,
        role=app_role,
        location=location,
        employment_type=employment_type,
        salary=salary,
        deadline=deadline,
        start_date=start_date,
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
        company=None if company == "Target Company" else company,
        role=app_role,
        location=location,
        employmentType=employment_type,
        salary=salary,
    )


@router.post("/resumes/{rid}/confirm", status_code=204)
@router.post("/resumes/{rid}/improve/confirm", status_code=204)
def confirm(rid: str, body: schemas.ConfirmReq, db: Connection = Depends(get_conn)):
    """Persist tailored resume only if preview_hash matches."""
    row = db.execute(
        "SELECT preview_hash, status, parent_id, company, role, location, employment_type, salary, deadline, start_date, intensity FROM resumes WHERE id=?",
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
        match = storage.match_rate_for_resume(db, rid)
        company = (row["company"] or "").strip() or "Target Company"
        app_role = (row["role"] or "").strip() or "Role"
        location = row["location"]
        employment_type = row["employment_type"]
        salary = row["salary"]
        deadline = row["deadline"]
        start_date = row["start_date"]

        placeholders = {"target company", "untitled co", "untitled", "company", "role"}
        if company.lower() in placeholders or app_role.lower() in placeholders:
            full = storage.get_resume(db, rid, with_data=True) or {}
            jd = (full.get("jobDescription") or "").strip()
            if jd:
                meta = improver.extract_job_metadata(jd, storage.get_llm(db))
                if company.lower() in placeholders and meta.get("company"):
                    company = meta["company"]
                    db.execute(
                        "UPDATE resumes SET company=?, role=COALESCE(?, role), "
                        "location=COALESCE(?, location), employment_type=COALESCE(?, employment_type), "
                        "salary=COALESCE(?, salary) WHERE id=?",
                        (
                            company,
                            meta.get("role") or app_role,
                            meta.get("location") or location,
                            meta.get("type") or employment_type,
                            meta.get("salary") or salary,
                            rid,
                        ),
                    )
                if app_role.lower() in placeholders and meta.get("role"):
                    app_role = meta["role"]
                location = location or meta.get("location")
                employment_type = employment_type or meta.get("type")
                salary = salary or meta.get("salary")
                deadline = deadline or meta.get("deadline")
                start_date = start_date or meta.get("startDate")

        storage.create_application(
            db,
            {
                "company": company,
                "role": app_role,
                "location": location,
                "employmentType": employment_type,
                "salary": salary,
                "deadline": deadline,
                "startDate": start_date,
                "status": "wish",
                "resumeId": rid,
                "match": match,
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
    if llm_svc.is_configured(cfg):
        cover = llm_svc.generate_cover_letter(data, jd or "general application", cfg) or ""
    if not cover:
        cover = templates.default_cover(data, data.get("title"))
    return schemas.AiAuxOut(cover_letter=cover, outreach_message="")


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
    outreach = ""
    if llm_svc.is_configured(cfg):
        outreach = llm_svc.generate_outreach(data, jd or "general application", cfg) or ""
    if not outreach:
        outreach = templates.default_outreach(data, data.get("title"))
    return schemas.AiAuxOut(cover_letter="", outreach_message=outreach)


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

    # AI-primary skill list (local fallback) → coverage evidence for ATS score.
    skill_keys, keyword_source = improver.extract_jd_skill_list(jd, cfg)
    heuristic = kw_svc.score_overlap(
        data, jd, keywords=skill_keys, keyword_source=keyword_source
    )
    heuristic_rate = int(heuristic.get("rate") or 0)
    local_keywords = list(heuristic.get("keywords") or [])
    local_matched = list(heuristic.get("matched") or heuristic.get("matches") or [])
    local_missing = list(heuristic.get("missing") or [])
    keyword_total = int(heuristic.get("total_keywords") or len(local_keywords))
    keyword_found = len(local_matched)

    panel_hits = kw_svc.hits_from_keywords(local_keywords)

    source: str = "keyword"
    score = heuristic_rate
    notes = ""
    categories: list[schemas.AiMatchCategory] = []
    missing_skills = [str(k) for k in local_missing[:12]]

    if llm_svc.is_configured(cfg):
        assessed = llm_svc.ats_assess(
            data,
            jd,
            panel_hits,
            cfg,
            heuristic_rate=heuristic_rate,
            local_keywords=local_keywords,
            local_matched=local_matched,
            local_missing=local_missing,
        )
        if assessed:
            source = "llm"
            try:
                score = max(0, min(100, int(assessed.get("score"))))
            except (TypeError, ValueError):
                score = heuristic_rate
            notes = str(assessed.get("notes") or "").strip()
            llm_missing: list[str] = []
            for raw in assessed.get("missing_skills") or []:
                s = str(raw).strip()
                if not s:
                    continue
                parts = [p for p in re.split(r"[\s,/|]+", s.lower()) if p]
                # Accept AI missing skills after stop-list validation
                validated = kw_svc.validate_extracted_keywords([s], jd, limit=1)
                if not validated and not any(kw_svc.is_skill_keyword(p) for p in parts):
                    continue
                if s not in llm_missing:
                    llm_missing.append(validated[0] if validated else s)
                if len(llm_missing) >= 12:
                    break
            if llm_missing:
                merged = list(local_missing[:10])
                for s in llm_missing:
                    low = s.lower()
                    if not any(low in m.lower() or m.lower() in low for m in merged):
                        merged.append(s)
                    if len(merged) >= 12:
                        break
                missing_skills = merged
            for raw in assessed.get("categories") or []:
                if not isinstance(raw, dict):
                    continue
                cid = str(raw.get("id") or "").strip()
                label = str(raw.get("label") or cid).strip()
                if not cid:
                    continue
                try:
                    cscore = max(0, min(100, int(raw.get("score"))))
                except (TypeError, ValueError):
                    continue
                categories.append(
                    schemas.AiMatchCategory(id=cid, label=label or cid, score=cscore)
                )
        else:
            notes = (
                "AI analysis unavailable — showing keyword coverage only. "
                "Check your model/API key in Settings, then re-check."
            )
    else:
        notes = (
            "AI analysis unavailable — showing keyword coverage only. "
            "Add an API key in Settings for a full ATS fit score."
        )

    if not any(c.id == "keywords" for c in categories):
        categories.insert(
            0,
            schemas.AiMatchCategory(
                id="keywords", label="Keyword coverage", score=heuristic_rate
            ),
        )

    if jd and jd != (rec.get("jobDescription") or ""):
        storage.update_resume(db, rid, {"jobDescription": jd})
    storage.set_applications_match(db, rid, score)

    soft = kw_svc.entry_level_soft_skills(jd, kw_svc.resume_to_plain(data))

    return schemas.AiMatchOut(
        keywords=[schemas.KeywordHit(**h) for h in panel_hits],
        notes=notes,
        score=score,
        heuristicRate=heuristic_rate,
        keywordFound=keyword_found,
        keywordTotal=keyword_total,
        matchedSkills=[str(k) for k in local_matched[:24]],
        missingSkills=missing_skills,
        categories=categories,
        source=source,  # type: ignore[arg-type]
        keywordSource=keyword_source if keyword_source in ("ai", "local") else "local",  # type: ignore[arg-type]
        entryLevel=bool(soft.get("is_entry_level")),
        softSkillsNote=str(soft.get("note") or ""),
        softSkillsInJd=[str(x) for x in (soft.get("in_jd") or [])],
        softSkillsMissing=[str(x) for x in (soft.get("missing") or [])],
    )


@router.post("/resumes/{rid}/ai/content-check", response_model=schemas.AiContentCheckOut)
def ai_content_check(
    rid: str, body: schemas.AiContentCheckReq | None = None, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    data = (
        body.data.model_dump(mode="json") if body and body.data else None
    ) or dict(rec.get("data") or {})
    jd = (
        (body.jd if body else None) or rec.get("jobDescription") or ""
    ).strip()
    result = content_check_svc.run_content_check(data, cfg, jd=jd)
    return schemas.AiContentCheckOut(
        score=int(result.get("score") or 0),
        issueCount=int(result.get("issueCount") or 0),
        categories=[
            schemas.ContentCategoryScore(**c) for c in (result.get("categories") or [])
        ],
        issues=[schemas.ContentIssue(**i) for i in (result.get("issues") or [])],
    )


@router.post("/resumes/{rid}/ai/content-fix", response_model=schemas.AiContentFixOut)
def ai_content_fix(
    rid: str, body: schemas.AiContentFixReq | None = None, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    if not llm_svc.is_configured(cfg):
        raise HTTPException(400, "LLM not configured — add an API key in Settings")
    data = (
        body.data.model_dump(mode="json") if body and body.data else None
    ) or dict(rec.get("data") or {})
    jd = (
        (body.jd if body else None) or rec.get("jobDescription") or ""
    ).strip()
    issues = []
    if body and body.issues:
        issues = [i.model_dump(mode="json") for i in body.issues]
    fixed = content_check_svc.run_content_fix(data, cfg, jd=jd, issues=issues)
    if not fixed:
        raise HTTPException(502, "Content fix failed — try another model or check the API key")
    try:
        validated = schemas.ResumeData.model_validate(fixed)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Invalid AI response shape: {e}")
    return schemas.AiContentFixOut(data=validated)


@router.post("/resumes/{rid}/ai/ats-chat", response_model=schemas.AiAtsChatOut)
def ai_ats_chat(
    rid: str, body: schemas.AiAtsChatReq, db: Connection = Depends(get_conn)
):
    rec = storage.get_resume(db, rid, with_data=True)
    if not rec:
        raise HTTPException(404, "Resume not found")
    cfg = storage.get_llm(db)
    if not llm_svc.is_configured(cfg):
        raise HTTPException(400, "LLM not configured — add an API key in Settings")
    message = (body.message or "").strip()
    if len(message) < 2:
        raise HTTPException(400, "Message too short")
    data = (
        body.data.model_dump(mode="json") if body.data else None
    ) or dict(rec.get("data") or {})
    jd = (body.jd or rec.get("jobDescription") or "").strip()
    if len(jd) < 40:
        raise HTTPException(400, "Paste a fuller job posting first")
    history = [h.model_dump(mode="json") for h in (body.history or [])]
    raw = llm_svc.ats_coach(
        data,
        jd,
        message,
        cfg,
        missing_skills=list(body.missingSkills or []),
        history=history,
    )
    if not raw:
        raise HTTPException(502, "ATS coach failed — try another model or check the API key")
    reply = str(raw.get("reply") or "").strip() or "Done."
    apply = bool(raw.get("apply"))
    if not apply:
        return schemas.AiAtsChatOut(reply=reply, applied=False, data=None)

    diffs = {
        "summary": raw.get("summary"),
        "skills": raw.get("skills"),
        "bullet_edits": raw.get("bullet_edits") or [],
    }
    out = improver.apply_diffs(data, diffs)
    if "skills" in out:
        out["skills"] = categorize_skills(out.get("skills") or [])
    try:
        validated = schemas.ResumeData.model_validate(out)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Invalid AI response shape: {e}")
    return schemas.AiAtsChatOut(reply=reply, applied=True, data=validated)
