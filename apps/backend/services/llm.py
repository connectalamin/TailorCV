from __future__ import annotations

import json
import re
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator, Optional

import litellm

_usage_op: ContextVar[str] = ContextVar("llm_usage_op", default="other")


@contextmanager
def track_operation(operation: str) -> Iterator[None]:
    token = _usage_op.set((operation or "other").strip() or "other")
    try:
        yield
    finally:
        _usage_op.reset(token)


def _record_call(
    entry: dict,
    *,
    ok: bool,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
) -> None:
    try:
        from db import get_db
        from services import storage

        with get_db() as db:
            storage.record_llm_usage(
                db,
                ok=ok,
                provider=str(entry.get("provider") or "unknown"),
                model=str(entry.get("model") or ""),
                operation=_usage_op.get(),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
            )
    except Exception:
        pass


def _usage_from_response(resp: Any) -> tuple[int, int, int]:
    usage = getattr(resp, "usage", None)
    if usage is None and isinstance(resp, dict):
        usage = resp.get("usage")
    if usage is None:
        return 0, 0, 0
    if isinstance(usage, dict):
        prompt = int(usage.get("prompt_tokens") or 0)
        completion = int(usage.get("completion_tokens") or 0)
        total = int(usage.get("total_tokens") or 0) or (prompt + completion)
        return prompt, completion, total
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    total = int(getattr(usage, "total_tokens", 0) or 0) or (prompt + completion)
    return prompt, completion, total


PROVIDER_INFO: dict[str, dict[str, Any]] = {
    "openai": {"name": "OpenAI", "defaultModel": "gpt-4o-mini", "requiresKey": True},
    "openai_compatible": {
        "name": "OpenAI Compatible",
        "defaultModel": "gpt-4o-mini",
        "requiresKey": True,
        "requiresBase": True,
    },
    "anthropic": {"name": "Anthropic", "defaultModel": "claude-haiku-4-5-20251001", "requiresKey": True},
    "openrouter": {"name": "OpenRouter", "defaultModel": "deepseek/deepseek-chat", "requiresKey": True},
    "gemini": {"name": "Google Gemini", "defaultModel": "gemini-2.0-flash", "requiresKey": True},
    "deepseek": {"name": "DeepSeek", "defaultModel": "deepseek-chat", "requiresKey": True},
    "ollama": {"name": "Ollama (Local)", "defaultModel": "llama3.2", "requiresKey": False},
}

_PREFIX = {"openrouter": "openrouter/", "deepseek": "deepseek/", "gemini": "gemini/"}

_DEFAULT_ENTRY = {
    "id": "primary",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "api_base": None,
    "api_key": None,
}


def normalize_llm_store(stored: Any) -> dict:
    """Migrate legacy single-object config → {mode, entries}."""
    if not isinstance(stored, dict):
        return {"mode": "single", "entries": [dict(_DEFAULT_ENTRY)]}

    if "entries" in stored and isinstance(stored["entries"], list):
        mode = stored.get("mode") or "single"
        if mode not in ("single", "fallback"):
            mode = "single"
        entries = []
        for i, e in enumerate(stored["entries"]):
            if not isinstance(e, dict):
                continue
            entries.append(
                {
                    "id": e.get("id") or f"e{i}-{uuid.uuid4().hex[:6]}",
                    "provider": e.get("provider") or "openai",
                    "model": e.get("model") or "",
                    "api_base": e.get("api_base"),
                    "api_key": e.get("api_key"),
                }
            )
        if not entries:
            entries = [dict(_DEFAULT_ENTRY)]
        if mode == "single":
            entries = entries[:1]
        return {"mode": mode, "entries": entries}

    # Legacy flat shape
    return {
        "mode": "single",
        "entries": [
            {
                "id": "primary",
                "provider": stored.get("provider") or "openai",
                "model": stored.get("model") or "gpt-4o-mini",
                "api_base": stored.get("api_base"),
                "api_key": stored.get("api_key"),
            }
        ],
    }


def entry_configured(entry: dict) -> bool:
    provider = entry.get("provider")
    info = PROVIDER_INFO.get(provider or "")
    if not info:
        return False
    if info["requiresKey"] and not entry.get("api_key"):
        return False
    if info.get("requiresBase") and not (entry.get("api_base") or "").strip():
        return False
    return True


def configured_entries(cfg: dict) -> list[dict]:
    store = normalize_llm_store(cfg)
    entries = store["entries"]
    if store["mode"] == "single":
        entries = entries[:1]
    return [e for e in entries if entry_configured(e)]


def is_configured(cfg: dict) -> bool:
    return bool(configured_entries(cfg))


def primary_entry(cfg: dict) -> dict:
    store = normalize_llm_store(cfg)
    entries = store["entries"]
    for e in entries:
        if entry_configured(e):
            return e
    return entries[0] if entries else dict(_DEFAULT_ENTRY)


def _model(entry: dict) -> str:
    provider = entry.get("provider") or ""
    model = entry.get("model") or PROVIDER_INFO.get(provider, {}).get("defaultModel") or ""
    if provider == "openai_compatible":
        if model and not model.startswith("openai/"):
            return f"openai/{model}"
        return model
    pfx = _PREFIX.get(provider)
    if pfx and model and not model.startswith(pfx):
        model = pfx + model
    return model


def _base_kwargs(entry: dict) -> dict:
    kw: dict[str, Any] = {"model": _model(entry)}
    key = entry.get("api_key")
    if key:
        kw["api_key"] = key
    base = (entry.get("api_base") or "").strip()
    if base:
        kw["api_base"] = base
    elif (entry.get("provider") or "") == "ollama":
        kw["api_base"] = "http://host.docker.internal:11434"
    return kw


def _strip_fence(s: str) -> str:
    s = s.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", s, re.S)
    if m:
        return m.group(1).strip()
    return s


def _complete_one(
    entry: dict,
    messages: list[dict],
    *,
    json_mode: bool = False,
    max_tokens: int = 1400,
) -> Optional[str]:
    try:
        kw = _base_kwargs(entry)
        kw.update(messages=messages, max_tokens=max_tokens, temperature=0.2)
        if json_mode:
            kw["response_format"] = {"type": "json_object"}
        resp = litellm.completion(**kw)
        prompt_t, completion_t, total_t = _usage_from_response(resp)
        content = resp.choices[0].message.content or ""
        _record_call(
            entry,
            ok=True,
            prompt_tokens=prompt_t,
            completion_tokens=completion_t,
            total_tokens=total_t,
        )
        return content
    except Exception:
        _record_call(entry, ok=False)
        return None


def _complete(
    cfg: dict,
    messages: list[dict],
    *,
    json_mode: bool = False,
    max_tokens: int = 1400,
    entry_id: Optional[str] = None,
) -> Optional[str]:
    """Try configured entries in order (fallback mode) until one succeeds."""
    store = normalize_llm_store(cfg)
    entries = store["entries"]
    if entry_id:
        entries = [e for e in entries if e.get("id") == entry_id]
    elif store["mode"] == "single":
        entries = entries[:1]
    for entry in entries:
        if not entry_configured(entry):
            continue
        raw = _complete_one(entry, messages, json_mode=json_mode, max_tokens=max_tokens)
        if raw:  # empty string is a failure — keep trying
            return raw
    return None


def _complete_json_text(
    cfg: dict,
    messages: list[dict],
    *,
    max_tokens: int = 1400,
    entry_id: Optional[str] = None,
) -> Optional[str]:
    """
    Get a parseable JSON string from the LLM.
    Some providers (e.g. Gemini + response_format=json_object) truncate mid-object;
    retry without forced JSON mode, then fall through entries.
    """
    store = normalize_llm_store(cfg)
    entries = store["entries"]
    if entry_id:
        entries = [e for e in entries if e.get("id") == entry_id]
    elif store["mode"] == "single":
        entries = entries[:1]

    for entry in entries:
        if not entry_configured(entry):
            continue
        for jm in (True, False):
            raw = _complete_one(entry, messages, json_mode=jm, max_tokens=max_tokens)
            if not raw:
                continue
            try:
                json.loads(_strip_fence(raw))
                return raw
            except json.JSONDecodeError:
                continue
    return None


def is_blob_resume(data: dict) -> bool:
    """True when summary holds a wall of text and structured sections are empty."""
    summary = (data.get("summary") or "").strip()
    if len(summary) < 280:
        return False
    has_sections = bool(data.get("exp") or data.get("skills") or data.get("edu") or data.get("projects"))
    return not has_sections


_SCHEMA_HINT = (
    "Return ONLY a JSON object with these exact keys: "
    "name (string, required), title (string, job headline), "
    "summary (string: 1-2 short Objective sentences ONLY — never dump the whole resume), "
    "contact {email, phone, linkedin, website, github, location}, "
    "exp (array of jobs: co=company, role=job title, meta=dates, loc=location, b=[{t: bullet}]), "
    "projects (array: role=project name, co=tech stack, meta=year, b=[{t}]), "
    "edu (array: co=school/university, role=degree, meta=dates, loc=GPA or honors, b=[]), "
    "skills (array of 4–8 strings ONLY in form 'Category: item, item, item' — "
    "e.g. 'Languages: JavaScript, TypeScript, Python', 'Frontend: React, Next.js'. "
    "NEVER put one technology per array element), "
    "awards (array of [title, detail] for achievements), "
    "certs (array of [name, date]), "
    "langs (array of [activity or language, detail]). "
    "Fill EVERY section present in the source. Empty arrays only when truly absent. No prose, no markdown."
)

_STRICT_HINT = (
    _SCHEMA_HINT
    + " CRITICAL: summary must be under 350 characters. Put experience, skills, education, "
    "and projects into their arrays — do NOT paste them into summary."
)


def structure(text: str, cfg: dict, *, strict: bool = False) -> Optional[dict]:
    if not is_configured(cfg) or not text.strip():
        return None
    with track_operation("parse"):
        hint = _STRICT_HINT if strict else _SCHEMA_HINT
        msgs = [
            {"role": "system", "content": "You extract a resume into strict ATS JSON sections. " + hint},
            {"role": "user", "content": f"Resume text:\n\n{text[:12000]}"},
        ]
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=4000)
        if not raw:
            return None
        try:
            obj = json.loads(_strip_fence(raw))
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None


def structure_with_retry(text: str, cfg: dict) -> Optional[dict]:
    first = structure(text, cfg, strict=False)
    if first and first.get("name") and not is_blob_resume(first):
        return first
    second = structure(text, cfg, strict=True)
    if second and second.get("name") and not is_blob_resume(second):
        return second
    # Prefer non-blob even without name if sections exist
    for cand in (second, first):
        if cand and not is_blob_resume(cand):
            return cand
    return None


_ATS_KEYWORD_EXTRACT_SYSTEM = """You are an expert ATS keyword extractor. Extract ONLY hard skills, technical tools, platforms, and domain-specific competencies from a job description.

INCLUDE:
- Languages, frameworks, libraries, tools, platforms, databases
- Methodologies when skill-like (Agile, Scrum, CI/CD, SEO, SEM, TDD)
- Domain skills (Microservices, REST APIs, MCQ for EdTech, Financial Modeling, etc.)
- Certifications and standards (PMP, AWS Certified, GDPR, HIPAA)

EXCLUDE (critical):
- Soft skills (communication, teamwork, leadership, problem-solving, analytical, creativity)
- Generic nouns alone (platform, product, form, application, system, tool, solution, service)
- Education/eligibility (CSE, non-CSE, graduate, fresher, Bachelor's, B.Tech)
- Level/tenure (junior, senior, entry-level, 3+ years)
- Employment terms (full-time, remote, salary, benefits)
- Culture fluff (self-starter, fast-paced, passionate)
- Application instructions ("fill the form", "apply now", "join meetings")

Context:
- "form" in "fill the form" → exclude; "React Hook Form" / form validation → include
- bare "platform" → exclude; "Salesforce Platform" → include
- CSE / non-CSE → exclude
- MCQ → include when used as an assessment type

Return ONLY JSON: {"keywords":["skill1","skill2",...]}
Prefer lowercase; keep known acronyms uppercase (AWS, SQL, SEO, CMS, MCQ).
Max 24 items. No explanations."""


def extract_keywords(jd: str, cfg: dict) -> Optional[list[dict]]:
    """AI hard-skill extraction → [{k, m}, ...]. Validated by caller via stop-list."""
    if not is_configured(cfg) or not jd.strip():
        return None
    msgs = [
        {"role": "system", "content": _ATS_KEYWORD_EXTRACT_SYSTEM},
        {
            "role": "user",
            "content": (
                "Extract hard skills from this job description.\n\n"
                f"{jd[:5500]}"
            ),
        },
    ]
    with track_operation("keywords"):
        raw = _complete_json_text(cfg, msgs, max_tokens=700)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
    except json.JSONDecodeError:
        return None

    items: list[Any] = []
    if isinstance(obj, list):
        items = obj
    elif isinstance(obj, dict):
        raw_items = obj.get("keywords") or obj.get("skills") or obj.get("items")
        if isinstance(raw_items, list):
            items = raw_items

    out: list[dict] = []
    seen: set[str] = set()
    for i, it in enumerate(items):
        if isinstance(it, dict):
            k = str(it.get("k") or it.get("skill") or it.get("name") or "").strip()
            try:
                m = int(it.get("m") or max(55, 96 - i * 2))
            except (TypeError, ValueError):
                m = max(55, 96 - i * 2)
        else:
            k = str(it or "").strip()
            m = max(55, 96 - i * 2)
        if not k:
            continue
        key = k.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"k": k, "m": max(50, min(99, m))})
        if len(out) >= 24:
            break
    return out or None


def extract_job_metadata(jd: str, cfg: dict) -> Optional[dict]:
    """Extract company/role/location/type/salary/dates from a JD. Null when uncertain."""
    if not is_configured(cfg) or not jd.strip():
        return None
    msgs = [
        {
            "role": "system",
            "content": (
                "Extract structured metadata from a job description. "
                "Return ONLY a complete JSON object: "
                '{"company":"...","role":"...","location":"...","type":"...",'
                '"salary":"...","deadline":"...","startDate":"..."}. '
                "Rules:\n"
                "- company: hiring organization name. Use phrases like 'Join X', "
                "'at X', 'X is hiring'. Never return marketing fluff as company.\n"
                "- role: clean job title only (e.g. 'Jr. Software Engineer'). "
                "Strip emojis and phrases like 'We're Hiring'.\n"
                "- location: city/region or remote/hybrid. Null if not mentioned.\n"
                "- type: full-time, part-time, contract, or internship. Null if not mentioned.\n"
                "- salary: compensation amount/range as written (include currency/period if present). "
                "Null if not mentioned.\n"
                "- deadline: application deadline as YYYY-MM-DD when a concrete date is given. "
                "Null for vague phrases (rolling, ASAP) or if not mentioned.\n"
                "- startDate: expected start date as YYYY-MM-DD when a concrete date is given. "
                "Null for vague phrases (ASAP, immediate, Q4) or if not mentioned.\n"
                "Do not guess. Use JSON null for unknown fields. Output the full object — never truncate."
            ),
        },
        {"role": "user", "content": jd[:6000]},
    ]
    with track_operation("job_meta"):
        raw = _complete_json_text(cfg, msgs, max_tokens=600)
    if not raw:
        return None
    try:
        data = json.loads(_strip_fence(raw))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    def _field(key: str, *, alt: Optional[str] = None, maxlen: int = 200) -> Optional[str]:
        val = data.get(key)
        if val is None and alt:
            val = data.get(alt)
        if val is None:
            return None
        s = str(val).strip()
        if not s or s.lower() in ("null", "none", "n/a", "unknown"):
            return None
        return s[:maxlen]

    return {
        "company": _field("company"),
        "role": _field("role"),
        "location": _field("location"),
        "type": _field("type"),
        "salary": _field("salary", maxlen=300),
        "deadline": _field("deadline"),
        "startDate": _field("startDate", alt="start_date"),
    }


_DIFF_HINT = {
    "light": (
        "Light polish: Keep almost all original wording. "
        "Weave 3-5 JD keywords (exact phrasing) into the summary and at most 2-3 bullets. "
        "Light level-matching only (trim obviously mismatched terms). "
        "Do not invent employers, metrics, or skills."
    ),
    "balanced": (
        "Balanced match: Rewrite the summary and most bullets to mirror the JD's "
        "exact language everywhere truthfully possible. "
        "Reorder skills so every JD-listed keyword the candidate actually has appears first "
        "in its category. Apply level-matching moderately. "
        "Do not invent employers or fake metrics."
    ),
    "aggressive": (
        "Aggressive rewrite: Aggressively rephrase summary and bullets around the JD's "
        "priorities and terminology. Reorder skills by relevance to JD. "
        "Restructure bullet relevance emphasis (most relevant content first within edits). "
        "Fully apply level-matching: reframe seniority-signaling language to match the JD's level. "
        "If JD is IC-level, emphasize hands-on execution even if candidate has management background. "
        "If JD is senior, elevate scope language where supported by facts. "
        "Still: no invented employers, metrics, or skills."
    ),
}

_INTENSITY_ALIASES = {
    "nudge": "light",
    "keywords": "balanced",
    "full": "aggressive",
}


def _normalize_intensity(raw: str) -> str:
    key = (raw or "balanced").strip().lower()
    key = _INTENSITY_ALIASES.get(key, key)
    return key if key in _DIFF_HINT else "balanced"

_RESUME_OPTIMIZER_SYSTEM = """ROLE: You are a resume optimization engine. You take a candidate's master resume and a job description, then produce a TARGETED resume diff optimized for both ATS parsing and human review.

OUTPUT FORMAT:
Return raw JSON only. No markdown code blocks, no preamble, no trailing commentary. The JSON must contain exactly these keys:

{
  "summary": "string",
  "title": "string",
  "skills": "string",
  "bullet_edits": [
    {
      "original_bullet": "string (verbatim from resume)",
      "revised_bullet": "string",
      "reason": "string (1 sentence)"
    }
  ],
  "cover_letter": "string",
  "outreach_message": "string",
  "level_gap_note": "string"
}

FIELD DEFINITIONS:
- summary: Short Objective, 1-2 sentences. Framed toward this specific JD.
- title: The candidate's current/most recent title, adjusted to mirror JD terminology if the candidate's actual role supports it. Do not invent titles.
- skills: Plain text, comma or line-separated using "Category: items" format. No icons, no tables, no nested formatting. Front-load each category with JD-matching items the candidate actually possesses.
- bullet_edits: Array of objects. Only include bullets that changed. If a bullet is unchanged, omit it. Each object contains the original bullet (verbatim), the revised bullet, and a one-sentence reason for the change.
- cover_letter: A concise, tailored cover letter paragraph (3-5 sentences) bridging the candidate's background to this JD.
- outreach_message: A short LinkedIn-style connection note (2-3 sentences) referencing the JD and the candidate's fit.
- level_gap_note: One honest sentence acknowledging a seniority gap if the candidate is underqualified for the JD's level, and reframing transferable skills. If no gap, return empty string "".

GLOBAL RULES (apply at every intensity):

ATS RULES:
- Mirror the JD's exact terminology where truthful (e.g., if JD says "cross-functional stakeholder management" and resume has equivalent experience, use that exact phrase — ATS keyword match is often literal string match).
- Match the JD's job title language in the title field if the candidate's actual experience supports it (e.g., "Software Engineer" vs "SWE" vs "Software Developer" — use whichever the JD uses).
- Include both the spelled-out term and acronym on first use where space allows (e.g., "Search Engine Optimization (SEO)") since ATS systems vary in which they index.
- Skills section: plain comma/line-separated 'Category: items' — no icons, no tables, no nested formatting. Front-load each category with JD-matching items, keep the rest after.
- Do not keyword-stuff unnaturally — every inserted keyword must fit a real, truthful sentence. Density without fabrication.
- Standard section content only — no invented certifications, tools, or employers to hit keyword counts.

LEVEL-MATCHING RULES:
- Infer the JD's seniority level from title, years-of-experience requirement, and language (e.g., "leads," "mentors," "owns roadmap" = senior; "assists," "supports," "under guidance" = junior/entry).
- If the candidate's resume signals a HIGHER level than the JD, de-emphasize or trim leadership/scope language that isn't relevant to this JD's level. Do not delete factual history, but:
  - Shorten or remove leadership/scope language irrelevant to this JD's level.
  - Drop skills/tools clearly above the JD's stated scope unless the JD wants that background.
  - Reframe bullets to emphasize hands-on/IC work if the JD is IC-level, even if the candidate also has management experience.
- If the candidate's resume signals a LOWER level than the JD, do not fabricate seniority — use level_gap_note instead of inventing scope.
- Never delete employers, titles, or dates to hide overqualification — only adjust bullet emphasis, skills ordering, and summary framing.

SAFETY RULES:
- Do not invent employers, metrics, certifications, tools, or skills at any intensity.
- If the resume contains no truthful basis for a JD keyword, do not include that keyword.
- Do not change company names, schools, or dates.
- If the JD is vague, optimize for the clearest signals available (required skills, title, responsibilities) and leave ambiguous areas unchanged.
- original_bullet must be copied VERBATIM from the resume (exact text of the bullet line, without the leading "- ").
- Only emit bullet_edits for bullets that actually change; omit unchanged bullets.

INTENSITY LEVELS:

1. Light polish (light):
- Keep almost all original wording.
- Weave 3-5 JD keywords (exact phrasing) into the summary and at most 2-3 bullets.
- Light level-matching only (trim obviously mismatched terms).
- Do not invent employers, metrics, or skills.

2. Balanced match (balanced):
- Rewrite the summary and most bullets to mirror the JD's exact language everywhere truthfully possible.
- Reorder skills so every JD-listed keyword the candidate actually has appears first in its category.
- Apply level-matching moderately.
- Do not invent employers or fake metrics.

3. Aggressive rewrite (aggressive):
- Aggressively rephrase summary and bullets around the JD's priorities and terminology.
- Reorder skills by relevance to JD.
- Restructure bullet order by relevance to JD (most relevant bullets first) only via revised_bullet text; do not invent bullets.
- Fully apply level-matching: reframe seniority-signaling language to match the JD's level. If JD is IC-level, emphasize hands-on execution even if candidate has management background. If JD is senior, elevate scope language where supported by facts.
- Still: no invented employers, metrics, or skills.

CONTENT QUALITY:
- Fix spelling, grammar, and punctuation in every edited field.
- Prefer strong action verbs; avoid weak openers (Responsible for, Helped with, Worked on).
- Keep tense consistent within each role (prefer past for prior roles, present for current).
- Reduce repetition of the same bullet openings and filler phrases.
- Prefer quantified bullets when the resume already implies numbers/scope — never invent metrics.
- Keep Objective to 1–2 clear sentences; never dump whole sections into summary.
"""


def generate_resume_diffs(
    data: dict,
    jd: str,
    keyword_hits: list[dict],
    intensity: str,
    cfg: dict,
    *,
    hint: str = "",
    resume_text: str = "",
) -> Optional[dict]:
    if not is_configured(cfg) or not jd.strip():
        return None
    intensity = _normalize_intensity(intensity)
    intensity_hint = _DIFF_HINT[intensity]
    keys = ", ".join(str(h.get("k")) for h in keyword_hits[:12] if h.get("k"))

    text = (resume_text or "").strip()
    if not text:
        # Fallback structured dump (caller should prefer plain text)
        text = json.dumps(
            {
                "title": data.get("title"),
                "summary": data.get("summary"),
                "skills": data.get("skills") or [],
                "exp": data.get("exp") or [],
                "projects": data.get("projects") or [],
            },
            ensure_ascii=False,
        )

    user_parts = [
        f"intensity: {intensity}",
        f"Intensity guidance: {intensity_hint}",
        f"JD keywords (hints only — still apply SAFETY RULES): {keys or '(none)'}",
        f"job_description:\n{jd[:5000]}",
        f"resume_text:\n{text[:9000]}",
    ]
    if (hint or "").strip():
        user_parts.insert(2, f"hint: {hint.strip()[:500]}")

    msgs = [
        {"role": "system", "content": _RESUME_OPTIMIZER_SYSTEM},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]
    with track_operation("improve"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=3200)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def rewrite_section(
    data: dict,
    section: str,
    jd: str,
    cfg: dict,
    *,
    intensity: str = "balanced",
) -> Optional[dict]:
    """Rewrite one ATS section. Returns patch dict with updated fields."""
    if not is_configured(cfg):
        return None
    intensity = _normalize_intensity(intensity)
    hint = _DIFF_HINT[intensity]
    section = (section or "").strip().lower()
    allowed = {
        "summary",
        "objective",
        "skills",
        "exp",
        "experience",
        "projects",
        "edu",
        "education",
        "awards",
        "achievements",
    }
    if section not in allowed:
        return None
    msgs = [
        {
            "role": "system",
            "content": (
                f"Rewrite ONLY the '{section}' part of this ATS resume for the job. {hint} "
                "CONTENT QUALITY: fix spelling/grammar; strong verbs; consistent tense; "
                "avoid repetition; quantify only with truthful metrics; no invented employers/skills. "
                "Return ONLY JSON. For objective/summary: {\"summary\": \"...\"} (1-2 sentences). "
                "For skills: {\"skills\": [\"Category: items\", ...]}. "
                "For experience: {\"exp\": [...same shape as input, rewritten bullets only...]}. "
                "For projects: {\"projects\": [...]}. For education: {\"edu\": [...]} (keep school/dates). "
                "For achievements/awards: {\"awards\": [[title, detail], ...]}. "
                "Never invent employers, schools, or fake metrics. No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Job description:\n{jd[:3500]}\n\n"
                f"Full resume JSON:\n{json.dumps(data, ensure_ascii=False)[:8000]}"
            ),
        },
    ]
    with track_operation("rewrite"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=2000)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def content_check(data: dict, cfg: dict, *, jd: str = "") -> Optional[dict]:
    """LLM enrichment for spelling/grammar and phrasing issues."""
    if not is_configured(cfg):
        return None
    from services import parser as parser_svc

    plain = parser_svc.data_to_plain_text(data)[:7000]
    jd_part = f"\n\nJob description (for Tailoring only):\n{jd[:2500]}" if (jd or "").strip() else ""
    cats = (
        "spelling_grammar, quantifying_impact, repetition, ats_essentials"
        + (", tailoring" if (jd or "").strip() else "")
    )
    msgs = [
        {
            "role": "system",
            "content": (
                "You are a resume content checker. Find spelling, grammar, weak verbs, "
                "tense inconsistencies, vague phrasing, and repetition. "
                "Return ONLY JSON:\n"
                "{"
                '"categories":[{"id":"spelling_grammar","score":0-100},...],'
                '"issues":[{"category":"...","severity":"info|warn|fail",'
                '"message":"...","location":"...","suggestion":"..."}]'
                "}\n"
                f"Category ids allowed: {cats}. "
                "score 100 = clean. List at most 12 concrete issues. "
                "Do not invent problems. No markdown."
            ),
        },
        {
            "role": "user",
            "content": f"Resume text:\n{plain}{jd_part}",
        },
    ]
    with track_operation("content_check"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=1200)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def content_fix(
    data: dict,
    cfg: dict,
    *,
    issues: Optional[list] = None,
    jd: str = "",
) -> Optional[dict]:
    """Return improve-shaped diffs focused on content quality polish."""
    if not is_configured(cfg):
        return None
    from services import parser as parser_svc

    plain = parser_svc.data_to_plain_text(data)[:8000]
    issue_lines = []
    for it in (issues or [])[:20]:
        if not isinstance(it, dict):
            continue
        msg = str(it.get("message") or "").strip()
        if not msg:
            continue
        loc = str(it.get("location") or "").strip()
        sug = str(it.get("suggestion") or "").strip()
        issue_lines.append(f"- [{it.get('category','')}] {msg}" + (f" @ {loc}" if loc else "") + (f" → {sug}" if sug else ""))
    msgs = [
        {
            "role": "system",
            "content": (
                "Polish this ATS resume for spelling, grammar, weak verbs, tense consistency, "
                "and repetition. Prefer quantified bullets only when facts already support metrics. "
                "Never invent employers, skills, schools, dates, or metrics. "
                "Keep section structure. Return ONLY JSON with keys: "
                "summary (string), title (string or \"\"), skills (Category: lines as string or string[]), "
                "bullet_edits ([{original_bullet, revised_bullet, reason}]), "
                "cover_letter (\"\"), outreach_message (\"\"), level_gap_note (\"\"). "
                "original_bullet must be VERBATIM from the resume. Omit unchanged bullets. No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                ("Known issues to fix:\n" + "\n".join(issue_lines) + "\n\n" if issue_lines else "")
                + (f"Optional JD context:\n{jd[:2000]}\n\n" if (jd or "").strip() else "")
                + f"resume_text:\n{plain}"
            ),
        },
    ]
    with track_operation("content_fix"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=2800)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def generate_aux(data: dict, jd: str, cfg: dict) -> Optional[dict]:
    if not is_configured(cfg):
        return None
    role = data.get("title") or "the role"
    msgs = [
        {
            "role": "system",
            "content": (
                "Write application materials. Return ONLY JSON with keys: "
                "cover_letter (formal, 3 short paragraphs), "
                "outreach_message (60-90 word cold email). No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Target role: {role}\n\nJob description:\n{jd[:3000]}\n\n"
                f"Candidate summary: {data.get('summary','')}\n"
                f"Skills: {', '.join((data.get('skills') or [])[:8])}\n"
                f"Name: {data.get('name','')}"
            ),
        },
    ]
    with track_operation("aux"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=900)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def shorten_for_one_page(
    data: dict,
    cfg: dict,
    *,
    page_size: str = "A4",
    margin_in: float = 0.6,
    pages: int = 2,
    aggressive: bool = False,
) -> Optional[dict]:
    """
    Compress resume JSON so it fits one page. Called only after a real compile
    reports pages > 1. Returns a partial/full ResumeData-shaped dict to merge.
    """
    if not is_configured(cfg):
        return None
    paper = "A4" if str(page_size).upper() == "A4" else "US Letter"
    aggressiveness = (
        "Aggressive pass: cut harder. Projects → one line each. "
        "Oldest experience → at most 1–2 bullets. Objective ≤ 2 short sentences. "
        "Drop low-value activities/cert fluff if needed. Keep all employers and dates."
        if aggressive
        else (
            "First pass: keep all jobs and projects. Shorten bullets to ≤12 words where possible. "
            "Projects: 1 line each (Built X using Y, achieving Z). Objective ≤ 2 lines. "
            "Skills stay as Category: items lines. Do not invent content."
        )
    )
    msgs = [
        {
            "role": "system",
            "content": (
                "You compress an ATS resume to fit ONE page. Return ONLY JSON with the same "
                "shape as the input (keys you change: summary, skills, exp, projects, edu, "
                "awards, certs, activities). Keep name/contact/title unchanged in spirit — "
                "omit them or copy verbatim. Never invent employers, schools, metrics, or skills. "
                "Do not delete employers or change dates. Skills must stay categorized "
                "('Languages: a, b'). No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Constraint: must fit one {paper} page with {margin_in:.2f}-inch margins "
                f"and ~10.5pt font. Current PDF is {pages} pages.\n"
                f"{aggressiveness}\n\n"
                f"Resume JSON:\n{json.dumps(data, ensure_ascii=False)[:12000]}"
            ),
        },
    ]
    with track_operation("fit_one_page"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=3200)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def match_notes(data: dict, jd: str, keywords: list[dict], cfg: dict) -> Optional[str]:
    """Backward-compatible notes-only helper; prefer ats_assess."""
    out = ats_assess(data, jd, keywords, cfg)
    if not out:
        return None
    notes = str(out.get("notes") or "").strip()
    return notes or None


def ats_assess(
    data: dict,
    jd: str,
    keywords: list[dict],
    cfg: dict,
    *,
    heuristic_rate: int = 0,
    local_keywords: list[str] | None = None,
    local_matched: list[str] | None = None,
    local_missing: list[str] | None = None,
) -> Optional[dict]:
    """LLM ATS / JD-fit assessment → score, categories, missing skills, notes."""
    if not is_configured(cfg) or not jd.strip():
        return None
    from services import parser as parser_svc

    keys = ", ".join(str(h.get("k")) for h in keywords[:16] if h.get("k"))
    local = [str(k).strip() for k in (local_keywords or []) if str(k).strip()]
    local_s = ", ".join(local[:40]) if local else keys
    matched_s = ", ".join((local_matched or [])[:24]) or "(none yet)"
    missing_s = ", ".join((local_missing or [])[:24]) or "(none flagged)"
    plain = parser_svc.data_to_plain_text(data)[:6500]
    msgs = [
        {
            "role": "system",
            "content": (
                "You are an ATS + recruiter screening assistant. Score how well this "
                "resume fits the job description for Applicant Tracking Systems and a "
                "human screener. Be honest and conservative — do not invent skills or "
                "experience the resume does not show.\n"
                "Consider:\n"
                "1. Keyword coverage (synonyms and implied experience count)\n"
                "2. Depth of experience relative to the posting\n"
                "3. ATS format / parsing risk (clear headers, scannable skills)\n"
                "4. Missing high-priority skills from the JD\n"
                "Use the extracted skill keywords as ground truth for what the JD asks for; "
                "do not invent extra stack terms.\n"
                "Return ONLY JSON:\n"
                "{"
                '"score":0-100,'
                '"notes":"3-6 short newline-separated bullets on fit and what to improve",'
                '"missing_skills":["high-priority skill or phrase from JD not evidenced"],'
                '"categories":['
                '{"id":"keywords","label":"Keyword match","score":0-100},'
                '{"id":"skills","label":"Skills fit","score":0-100},'
                '{"id":"experience","label":"Experience fit","score":0-100},'
                '{"id":"ats_format","label":"ATS format","score":0-100}'
                "]"
                "}\n"
                "Scoring guide: 80+ strong fit, 55-79 partial, below 55 weak. "
                "missing_skills: at most 10 concrete tools, technologies, frameworks, "
                "or hard skills from the JD (e.g. Next.js, Strapi, CMS). "
                "Never list soft adjectives, adverbs, or filler "
                "(exactly, flexible, genuine, meetings, monthly, hands-on, etc.). "
                "No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Extracted skill keywords from JD: {local_s or '(none)'}\n"
                f"Local matcher — found on resume: {matched_s}\n"
                f"Local matcher — missing from resume: {missing_s}\n"
                f"Local keyword coverage (reference only): {heuristic_rate}%\n"
                f"Panel keywords: {keys or '(none)'}\n\n"
                f"Job description:\n{jd[:4000]}\n\n"
                f"Resume text:\n{plain}"
            ),
        },
    ]
    with track_operation("ats"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=1100)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def tailor(data: dict, jd: str, cfg: dict) -> Optional[dict]:
    """Backward-compatible shallow tailor — prefer generate_resume_diffs via improver."""
    return generate_aux(data, jd, cfg)


def ats_coach(
    data: dict,
    jd: str,
    message: str,
    cfg: dict,
    *,
    missing_skills: Optional[list[str]] = None,
    history: Optional[list[dict]] = None,
) -> Optional[dict]:
    """
    Conversational ATS coach. Returns:
      { reply: str, apply: bool, summary?, skills?, bullet_edits? }
    Diff keys match improve/content_fix for apply_diffs.
    """
    if not is_configured(cfg) or not (message or "").strip():
        return None
    from services import parser as parser_svc

    plain = parser_svc.data_to_plain_text(data)[:7000]
    gap = ", ".join(str(s).strip() for s in (missing_skills or [])[:16] if str(s).strip())
    hist_lines: list[str] = []
    for turn in (history or [])[-6:]:
        if not isinstance(turn, dict):
            continue
        role = str(turn.get("role") or "").strip().lower()
        content = str(turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            hist_lines.append(f"{role}: {content[:500]}")
    hist_block = "\n".join(hist_lines) if hist_lines else "(none)"
    msgs = [
        {
            "role": "system",
            "content": (
                "You are an ATS coach helping improve resume↔JD fit. "
                "The user chats with you; you may edit the resume when they ask to raise the score "
                "or close a skills gap.\n"
                "RULES:\n"
                "- Never invent employers, schools, dates, certifications, or metrics.\n"
                "- Only weave JD keywords the candidate can truthfully claim from existing experience.\n"
                "- Prefer editing Objective, Technical Skills (Category: items), and bullet wording.\n"
                "- If the user only asks a question, set apply=false and answer in reply.\n"
                "- If they want edits (raise score, close gap, apply suggestions), set apply=true "
                "and fill summary / skills / bullet_edits as needed.\n"
                "Return ONLY JSON:\n"
                "{"
                '"reply":"short plain-text message to the user (1-4 sentences)",'
                '"apply":true|false,'
                '"summary":"optional new Objective or \\"\\"",'
                '"skills":"optional Category: lines as string or string[]",'
                '"bullet_edits":[{"original_bullet":"verbatim","revised_bullet":"...","reason":"..."}]'
                "}\n"
                "original_bullet must be VERBATIM from the resume. Omit unchanged bullets. No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Job description:\n{(jd or '')[:4000]}\n\n"
                f"Skills gap (missing on resume):\n{gap or '(none listed)'}\n\n"
                f"Recent chat:\n{hist_block}\n\n"
                f"User message:\n{message.strip()[:1500]}\n\n"
                f"resume_text:\n{plain}"
            ),
        },
    ]
    with track_operation("ats_coach"):
        raw = _complete(cfg, msgs, json_mode=True, max_tokens=2800)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def test(cfg: dict, entry_id: Optional[str] = None) -> tuple[bool, str]:
    store = normalize_llm_store(cfg)
    entries = store["entries"]
    if entry_id:
        entries = [e for e in entries if e.get("id") == entry_id]
        if not entries:
            return False, f"Unknown entry: {entry_id}"
    else:
        entries = entries[:1] if store["mode"] == "single" else entries

    last_msg = "No configured API entry"
    for entry in entries:
        info = PROVIDER_INFO.get(entry.get("provider") or "")
        if not info:
            last_msg = f"Unknown provider: {entry.get('provider')}"
            continue
        if info["requiresKey"] and not entry.get("api_key"):
            last_msg = "API key not configured"
            continue
        if info.get("requiresBase") and not (entry.get("api_base") or "").strip():
            last_msg = "Base URL is required for OpenAI Compatible"
            continue
        with track_operation("test"):
            raw = _complete_one(
                entry,
                [{"role": "user", "content": "Reply with the single word OK."}],
                max_tokens=8,
            )
        if raw is not None:
            return True, f"Connection OK ({entry.get('provider')})"
        last_msg = "Connection failed (check key / model / base URL)"
    return False, last_msg
