"""Diff-based resume improvement: keywords → diffs → apply → safety nets."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any, Literal, Optional

from services import keywords as kw_svc
from services import llm as llm_svc
from services.skills_fmt import categorize_skills

Intensity = Literal["light", "balanced", "aggressive"]

_INTENSITY_ALIASES = {
    "nudge": "light",
    "keywords": "balanced",
    "full": "aggressive",
}

_INTENSITY_HINT = {
    "light": (
        "Light polish: Keep almost all original wording. "
        "Weave 3-5 JD keywords into the summary and at most 2-3 bullets. "
        "Do not invent employers, metrics, or skills."
    ),
    "balanced": (
        "Balanced match: Rewrite summary and most bullets to mirror JD "
        "language where truthful. Reorder skills to surface JD matches. "
        "Do not invent employers or fake metrics."
    ),
    "aggressive": (
        "Aggressive rewrite: Aggressively rephrase around JD priorities and terminology. "
        "Fully apply level-matching. Still: no invented employers, metrics, or skills."
    ),
}


def normalize_intensity(raw: Optional[str]) -> Intensity:
    """Map current + legacy intensity ids to light|balanced|aggressive."""
    key = (raw or "balanced").strip().lower()
    key = _INTENSITY_ALIASES.get(key, key)
    if key in _INTENSITY_HINT:
        return key  # type: ignore[return-value]
    return "balanced"


def preview_hash_for(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return "sha256:" + hashlib.sha256(raw.encode()).hexdigest()[:24]


def extract_job_keywords(jd: str, cfg: dict) -> list[dict]:
    """
    AI-primary hard-skill extraction with local pattern fallback.
    Returns KeywordHit-shaped dicts [{k, m}, ...].
    """
    keys, _source = extract_jd_skill_list(jd, cfg)
    return kw_svc.hits_from_keywords(keys)


def extract_jd_skill_list(jd: str, cfg: dict) -> tuple[list[str], str]:
    """
    Plain skill strings + source ('ai'|'local').
    Primary: LLM extract → stop-list / context validation.
    Fallback: local extract_overlap_keywords when AI unavailable or <3 skills.
    """
    text = (jd or "").strip()
    if not text:
        return [], "local"

    if llm_svc.is_configured(cfg):
        llm_hits = llm_svc.extract_keywords(text, cfg)
        if llm_hits:
            raw = [str(h.get("k") or "").strip() for h in llm_hits if h.get("k")]
            validated = kw_svc.validate_extracted_keywords(raw, text, limit=24)
            if len(validated) >= 3:
                return validated, "ai"

    return kw_svc.extract_overlap_keywords(text, limit=40), "local"


_BAD_COMPANY = re.compile(
    r"^(?:target\s+company|untitled(?:\s+co)?|company|the\s+company|"
    r"our\s+company|employer|organization|organisation|hiring\s+team|"
    r"about\s+us|n/?a|unknown|null|none|"
    r"remote|hybrid|onsite|on-site|worldwide|global|"
    r"berlin|london|paris|amsterdam|munich|zurich|dublin|nyc|sf|"
    r"san\s+francisco|new\s+york|los\s+angeles|toronto|singapore)$",
    re.I,
)


_ROLE_TITLE = (
    r"(?:Jr\.?|Junior|Senior|Sr\.?|Staff|Principal|Lead|Head(?:\s+of)?|"
    r"Associate|Intern(?:ship)?|Entry[- ]Level)?\s*"
    r"(?:Full[- ]?Stack|Front[- ]?End|Back[- ]?End|Software|Platform|"
    r"DevOps|SRE|Data|ML|AI|Mobile|iOS|Android|Product|QA|Security|"
    r"Cloud|Infrastructure)?\s*"
    r"(?:Engineer(?:ing)?|Developer|Programmer|Architect|Scientist|"
    r"Analyst|Designer|Manager|Consultant|Specialist|Intern)"
    r"(?:\s+[IVX]+|\s+II+|\s+\d+)?"
)


def _clean_meta_field(val: Optional[str], *, maxlen: int = 200) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip().strip("\"'`")
    s = re.sub(r"\s+", " ", s)
    if not s or s.lower() in ("null", "none", "n/a", "unknown", "-"):
        return None
    return s[:maxlen]


def _looks_like_company(name: str) -> bool:
    s = (name or "").strip()
    if len(s) < 2 or len(s) > 80:
        return False
    if _BAD_COMPANY.match(s):
        return False
    # Location-ish fragments: "Berlin / Hybrid", "Remote - US"
    if re.search(r"(?i)\b(remote|hybrid|onsite|on-site)\b", s) and len(s.split()) <= 4:
        return False
    if re.fullmatch(r"[A-Za-z .]+(?:\s*/\s*[A-Za-z .]+)+", s) and len(s) < 40:
        # "Berlin / Hybrid" style — not a company
        if not re.search(r"(?i)\b(inc|llc|ltd|gmbh|corp|labs?|soft|tech|systems?)\b", s):
            return False
    if re.search(_ROLE_TITLE, s, re.I) and len(s.split()) <= 4:
        return False
    if re.search(r"https?://|www\.|@", s, re.I):
        return False
    return bool(re.search(r"[A-Za-z]", s))


def heuristic_job_metadata(jd: str) -> dict:
    """
    Best-effort company/role/location/type from plain JD text when LLM is
    unavailable or returns empty fields.
    """
    text = (jd or "").strip()
    meta: dict = {
        "company": None,
        "role": None,
        "location": None,
        "type": None,
        "salary": None,
        "deadline": None,
        "startDate": None,
    }
    if not text:
        return meta

    lines = [ln.strip() for ln in text.replace("\r\n", "\n").split("\n") if ln.strip()]
    head = "\n".join(lines[:12])
    head_flat = re.sub(r"\s+", " ", head)

    company_patterns = [
        r"(?i)\b(?:at|@)\s+([A-Z][\w.&'’-]+(?:\s+[A-Z][\w.&'’-]+){0,4})\b",
        r"(?i)\bjoin\s+([A-Z][\w.&'’-]+(?:\s+[A-Z][\w.&'’-]+){0,4})\b",
        r"(?i)\b([A-Z][\w.&'’-]+(?:\s+[A-Z][\w.&'’-]+){0,4})\s+is\s+hiring\b",
        r"(?i)\b(?:company|employer|organization|organisation)\s*[:\-–—]\s*([^\n|,;]{2,80})",
        r"(?i)\babout\s+([A-Z][\w.&'’-]+(?:\s+[A-Z][\w.&'’-]+){0,4})\b",
        r"(?i)\b(?:working|work)\s+(?:at|with)\s+([A-Z][\w.&'’-]+(?:\s+[A-Z][\w.&'’-]+){0,4})\b",
    ]
    for pat in company_patterns:
        m = re.search(pat, head)
        if not m:
            continue
        cand = _clean_meta_field(m.group(1))
        if cand and _looks_like_company(cand):
            meta["company"] = cand
            break

    if not meta["company"]:
        # "Role — Company" / "Role at Company" on first line
        first = lines[0] if lines else ""
        m = re.match(
            rf"(?i)^({_ROLE_TITLE})\s*(?:[-–—|@]|at)\s+(.+)$",
            first,
        )
        if m:
            role = _clean_meta_field(m.group(1))
            company = _clean_meta_field(m.group(2).split("|")[0].split(",")[0])
            if role:
                meta["role"] = role
            if company and _looks_like_company(company):
                meta["company"] = company

    if not meta["company"]:
        # apply@acme.com / careers@acme.io → Acme
        m = re.search(
            r"(?i)\b(?:apply|careers|jobs|talent|hr)@([a-z0-9-]+)\.(?:com|io|co|ai|dev|net|org)\b",
            text,
        )
        if m:
            slug = m.group(1).replace("-", " ").strip()
            if slug and slug.lower() not in ("gmail", "yahoo", "outlook", "hotmail", "email"):
                meta["company"] = slug.title()

    if not meta["role"]:
        m = re.search(rf"(?i)\b({_ROLE_TITLE})\b", head_flat)
        if m:
            meta["role"] = _clean_meta_field(m.group(1))

    if not meta["location"]:
        m = re.search(
            r"(?i)\b(?:location|based\s+in|office)\s*[:\-–—]?\s*"
            r"([A-Za-z][A-Za-z .,/()-]{1,60})",
            head,
        )
        if m:
            loc = _clean_meta_field(m.group(1).split("\n")[0])
            if loc and not re.search(r"(?i)\b(requirements?|responsibilit)", loc):
                meta["location"] = loc
        elif re.search(r"(?i)\bremote\b", head_flat):
            meta["location"] = "Remote"
        elif re.search(r"(?i)\bhybrid\b", head_flat):
            meta["location"] = "Hybrid"

    if not meta["type"]:
        if re.search(r"(?i)\bfull[-\s]?time\b", text):
            meta["type"] = "full-time"
        elif re.search(r"(?i)\bpart[-\s]?time\b", text):
            meta["type"] = "part-time"
        elif re.search(r"(?i)\bcontract(?:or|ing)?\b", text):
            meta["type"] = "contract"
        elif re.search(r"(?i)\bintern(?:ship)?\b", text):
            meta["type"] = "internship"

    if not meta["salary"]:
        m = re.search(
            r"(?i)(?:salary|compensation|pay)\s*[:\-–—]?\s*"
            r"([€$£][\d,.]+\s*[kK]?(?:\s*[-–—to]+\s*[€$£]?[\d,.]+\s*[kK]?)?"
            r"(?:\s*(?:per\s+year|/yr|/year|annually|a year))?)|"
            r"([€$£][\d,.]+\s*[kK]?\s*[-–—]\s*[€$£]?[\d,.]+\s*[kK]?)",
            text,
        )
        if m:
            meta["salary"] = _clean_meta_field(next(g for g in m.groups() if g), maxlen=300)

    return meta


def extract_job_metadata(jd: str, cfg: dict) -> dict:
    """
    Company/role plus optional location/type/salary/deadline/startDate from a JD.
    LLM first when configured; heuristic fills any gaps (and runs alone without LLM).
    """
    heuristic = heuristic_job_metadata(jd)
    meta = dict(heuristic)

    if not (jd or "").strip():
        return meta

    if llm_svc.is_configured(cfg):
        llm_meta = llm_svc.extract_job_metadata(jd, cfg)
        if llm_meta:
            for key in meta:
                val = _clean_meta_field(llm_meta.get(key), maxlen=300 if key == "salary" else 200)
                if not val:
                    continue
                if key == "company" and not _looks_like_company(val):
                    continue
                meta[key] = val

    # Never keep placeholder company names
    if meta.get("company") and _BAD_COMPANY.match(str(meta["company"])):
        meta["company"] = heuristic.get("company")

    return meta


def _resume_blob(data: dict) -> str:
    parts: list[str] = [
        str(data.get("summary") or ""),
        " ".join(data.get("skills") or []),
    ]
    for section in ("exp", "projects", "edu"):
        for item in data.get(section) or []:
            parts.append(str(item.get("co") or ""))
            parts.append(str(item.get("role") or ""))
            parts.append(str(item.get("meta") or ""))
            for b in item.get("b") or []:
                parts.append(str(b.get("t") or ""))
    return " ".join(parts).lower()


def generate_diffs(
    data: dict,
    jd: str,
    keyword_hits: list[dict],
    intensity: Intensity,
    cfg: dict,
    *,
    hint: str = "",
) -> Optional[dict]:
    if not llm_svc.is_configured(cfg) or not jd.strip():
        return None
    from services import parser as parser_svc

    return llm_svc.generate_resume_diffs(
        data,
        jd,
        keyword_hits,
        intensity,
        cfg,
        hint=hint,
        resume_text=parser_svc.data_to_plain_text(data),
    )


def _norm_bullet(text: str) -> str:
    t = str(text or "").strip()
    t = re.sub(r"^[\-\u2022\*\u2013\u2014]+\s*", "", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def _skills_from_diff(raw: Any) -> list[str]:
    """Accept skills as a multiline Category: string or a string[]."""
    if isinstance(raw, list):
        return [str(s).strip() for s in raw if str(s).strip()]
    if not isinstance(raw, str) or not raw.strip():
        return []
    text = raw.strip()
    # Prefer one Category: line per newline
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]
    if len(lines) > 1:
        return lines
    # Single blob: split on "; " or " | " between category blocks when possible
    if ":" in text and (";" in text or " |" in text):
        parts = re.split(r"\s*[;|]\s*(?=[A-Za-z][^:]{0,40}:)", text)
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) > 1:
            return parts
    return [text]


def apply_diffs(original: dict, diffs: Optional[dict]) -> dict:
    out = copy.deepcopy(original)
    if not diffs or not isinstance(diffs, dict):
        return out

    if isinstance(diffs.get("summary"), str) and diffs["summary"].strip():
        out["summary"] = diffs["summary"].strip()

    if isinstance(diffs.get("title"), str) and diffs["title"].strip():
        # Target role line only — never overwrite personal name
        out["title"] = diffs["title"].strip()

    skill_lines = _skills_from_diff(diffs.get("skills"))
    if skill_lines:
        out["skills"] = skill_lines

    # Index bullets for verbatim / normalized match
    bullet_index: dict[str, list[tuple[str, int, int]]] = {}
    for section in ("exp", "projects"):
        for ii, item in enumerate(out.get(section) or []):
            for bi, b in enumerate(item.get("b") or []):
                key = _norm_bullet(b.get("t") or "")
                if not key:
                    continue
                bullet_index.setdefault(key, []).append((section, ii, bi))

    for edit in diffs.get("bullet_edits") or []:
        if not isinstance(edit, dict):
            continue

        # Legacy path-based edits: {path, t}
        path = str(edit.get("path") or "")
        legacy_text = str(edit.get("t") or "").strip()
        if path and legacy_text:
            m = re.fullmatch(r"(exp|projects)\.(\d+)\.b\.(\d+)", path)
            if m:
                section, ii, bi = m.group(1), int(m.group(2)), int(m.group(3))
                items = out.get(section) or []
                if ii < len(items):
                    bullets = items[ii].get("b") or []
                    if bi < len(bullets):
                        bullets[bi] = {**bullets[bi], "t": legacy_text}
                        items[ii]["b"] = bullets
                        out[section] = items
            continue

        # Text-matched edits: {original_bullet, revised_bullet, reason}
        original_b = str(
            edit.get("original_bullet") or edit.get("original") or ""
        ).strip()
        revised = str(
            edit.get("revised_bullet") or edit.get("revised") or ""
        ).strip()
        if not original_b or not revised:
            continue
        key = _norm_bullet(original_b)
        locs = bullet_index.get(key) or []
        if not locs:
            continue
        section, ii, bi = locs.pop(0)
        if not locs:
            bullet_index.pop(key, None)
        items = out.get(section) or []
        if ii >= len(items):
            continue
        bullets = items[ii].get("b") or []
        if bi >= len(bullets):
            continue
        bullets[bi] = {**bullets[bi], "t": revised}
        items[ii]["b"] = bullets
        out[section] = items

    return out


def safety_nets(original: dict, improved: dict, keyword_hits: list[dict]) -> dict:
    """Preserve identity / employers / dates; constrain skills."""
    out = copy.deepcopy(improved)

    out["name"] = original.get("name") or out.get("name") or ""
    out["contact"] = copy.deepcopy(original.get("contact") or {})

    blob = _resume_blob(original)
    orig_skills = [str(s) for s in (original.get("skills") or [])]
    orig_lower = {s.lower() for s in orig_skills}
    jd_keys = [str(h.get("k") or "") for h in keyword_hits if h.get("k")]

    allowed_new: list[str] = []
    for k in jd_keys:
        if k.lower() in blob and k.lower() not in orig_lower:
            allowed_new.append(k)

    new_skills: list[str] = []
    seen: set[str] = set()
    for s in out.get("skills") or []:
        sl = str(s).strip()
        if not sl:
            continue
        low = sl.lower()
        if low in seen:
            continue
        if low in orig_lower or any(low == a.lower() for a in allowed_new):
            new_skills.append(sl)
            seen.add(low)
    # Keep any original skills the model dropped
    for s in orig_skills:
        low = s.lower()
        if low not in seen:
            new_skills.append(s)
            seen.add(low)
    out["skills"] = categorize_skills(new_skills[:24] if new_skills else orig_skills)

    for section in ("exp", "projects", "edu"):
        orig_items = original.get(section) or []
        new_items = out.get(section) or []
        merged = []
        for i, oi in enumerate(orig_items):
            ni = new_items[i] if i < len(new_items) else {}
            item = copy.deepcopy(oi)
            # Never rename employers / schools / dates
            item["co"] = oi.get("co") or ""
            item["meta"] = oi.get("meta") or ""
            item["loc"] = oi.get("loc") or ""
            if section != "edu" and isinstance(ni.get("role"), str) and ni["role"].strip():
                # Allow light role-title alignment only for exp/projects
                item["role"] = ni["role"].strip()
            else:
                item["role"] = oi.get("role") or ""
            ob = oi.get("b") or []
            nb = ni.get("b") or []
            bullets = []
            for j, obullet in enumerate(ob):
                if j < len(nb) and isinstance(nb[j], dict) and str(nb[j].get("t") or "").strip():
                    bullets.append({**obullet, "t": str(nb[j]["t"]).strip()})
                else:
                    bullets.append(copy.deepcopy(obullet))
            item["b"] = bullets
            merged.append(item)
        out[section] = merged

    return out


def refine_keywords(data: dict, keyword_hits: list[dict]) -> dict:
    """Light polish: ensure summary mentions at least one top keyword when possible."""
    out = copy.deepcopy(data)
    summary = (out.get("summary") or "").strip()
    if not summary or not keyword_hits:
        return out
    top = [str(h["k"]) for h in keyword_hits[:5] if h.get("k")]
    lower = summary.lower()
    if any(t.lower() in lower for t in top):
        return out
    # Soft append only if a keyword already exists in resume body
    blob = _resume_blob(out)
    for t in top:
        if t.lower() in blob:
            out["summary"] = f"{summary} Experienced with {t}."
            break
    return out


def _merge_shortened(original: dict, shortened: dict) -> dict:
    """Merge LLM one-page compression into the resume; lock identity fields."""
    out = copy.deepcopy(original)
    if isinstance(shortened.get("summary"), str):
        text = shortened["summary"].strip()
        if text:
            out["summary"] = text[:400]
    if "skills" in shortened:
        skills = _skills_from_diff(shortened.get("skills"))
        if skills:
            out["skills"] = categorize_skills(skills)
    for key in ("exp", "projects", "edu", "awards", "certs", "activities", "langs"):
        val = shortened.get(key)
        if isinstance(val, list) and val:
            out[key] = val
    out["name"] = original.get("name") or out.get("name")
    out["contact"] = dict(original.get("contact") or {})
    if original.get("title") and not out.get("title"):
        out["title"] = original.get("title")
    return out


def _compile_pages(
    data: dict,
    *,
    page_size: str = "A4",
    margin_in: float = 0.6,
) -> tuple[int, bool]:
    """Return (page_count, compile_ok). page_count is 0 when compile fails."""
    from services import compile as tex_compile
    from services import latex as tex_gen

    if not tex_compile.latex_available():
        return 0, False
    tex = tex_gen.build(
        data,
        page_size=page_size,
        margin_in=margin_in,
        ats_safe=True,
    )
    result = tex_compile.compile_pdf(tex)
    if not result.ok:
        return 0, False
    return max(int(result.pages or 0), 1), True


def fit_to_one_page(
    data: dict,
    cfg: dict,
    *,
    page_size: str = "A4",
    margin_in: float = 0.6,
) -> tuple[dict, dict[str, Any]]:
    """
    Layout-first one-page fit: compile with A4 defaults; only call the LLM
    to shorten when the PDF is still more than one page.
    """
    meta: dict[str, Any] = {
        "pages_before": 0,
        "pages_after": 0,
        "shortened": False,
        "skipped": None,
    }
    pages, ok = _compile_pages(data, page_size=page_size, margin_in=margin_in)
    if not ok:
        meta["skipped"] = "compile_unavailable"
        return data, meta

    meta["pages_before"] = pages
    meta["pages_after"] = pages
    if pages <= 1:
        return data, meta

    if not llm_svc.is_configured(cfg):
        meta["skipped"] = "llm_not_configured"
        return data, meta

    out = copy.deepcopy(data)
    for aggressive in (False, True):
        patch = llm_svc.shorten_for_one_page(
            out,
            cfg,
            page_size=page_size,
            margin_in=margin_in,
            pages=pages,
            aggressive=aggressive,
        )
        if not patch:
            meta["skipped"] = "llm_failed"
            break
        out = _merge_shortened(out, patch)
        out["skills"] = categorize_skills(out.get("skills") or [])
        meta["shortened"] = True
        pages2, ok2 = _compile_pages(out, page_size=page_size, margin_in=margin_in)
        if ok2:
            meta["pages_after"] = pages2
            pages = pages2
            if pages2 <= 1:
                meta["skipped"] = None
                break
        else:
            break

    return out, meta


def improve_resume(
    data: dict,
    jd: str,
    cfg: dict,
    *,
    intensity: Intensity = "balanced",
    role_hint: str = "",
    source_text: str = "",
    hint: str = "",
) -> dict[str, Any]:
    """
    Full preview pipeline.
    Returns: data, keywords, cover_letter, outreach_message, intensity, preview_payload
    """
    from services import parser as parser_svc

    intensity = normalize_intensity(intensity)
    base = copy.deepcopy(data)

    # Rehydrate blob masters into ATS sections before tailoring
    if llm_svc.is_blob_resume(base):
        text = (source_text or "").strip() or parser_svc.data_to_plain_text(base)
        rebuilt = parser_svc.build_data("master.txt", text, cfg)
        if rebuilt and not llm_svc.is_blob_resume(rebuilt):
            base = rebuilt
        elif llm_svc.is_configured(cfg):
            structured = llm_svc.structure_with_retry(text, cfg)
            if structured and not llm_svc.is_blob_resume(structured):
                base = structured

    # Never leave a wall-of-text objective after improve
    if len(str(base.get("summary") or "")) > 400 and (
        base.get("exp") or base.get("skills") or base.get("edu")
    ):
        parts = re.split(r"(?<=[.!?])\s+", str(base["summary"]).strip())
        base["summary"] = " ".join(parts[:2]).strip()[:320]

    base["skills"] = categorize_skills(base.get("skills") or [])

    keyword_hits = extract_job_keywords(jd, cfg)

    diffs = generate_diffs(base, jd, keyword_hits, intensity, cfg, hint=hint)
    improved = apply_diffs(base, diffs)
    improved = safety_nets(base, improved, keyword_hits)
    improved = refine_keywords(improved, keyword_hits)
    improved, fit_meta = fit_to_one_page(improved, cfg)

    # Cover / outreach are on-demand in the builder — never auto-generate during tailor.
    level_gap = ""
    if diffs and isinstance(diffs, dict):
        level_gap = str(diffs.get("level_gap_note") or "").strip()

    payload = {
        "intensity": intensity,
        "data": improved,
        "jd": jd,
        "keywords": keyword_hits,
        "cover_letter": "",
        "outreach_message": "",
        "level_gap_note": level_gap,
        "fit": fit_meta,
    }
    improved["skills"] = categorize_skills(improved.get("skills") or [])
    payload["data"] = improved
    return {
        "data": improved,
        "keywords": keyword_hits,
        "cover_letter": "",
        "outreach_message": "",
        "intensity": intensity,
        "level_gap_note": level_gap,
        "fit": fit_meta,
        "preview_hash": preview_hash_for(payload),
        "preview_payload": payload,
    }
