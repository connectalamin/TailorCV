from __future__ import annotations

import json
import re
import uuid
from typing import Any, Optional

import litellm

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
        return resp.choices[0].message.content or ""
    except Exception:
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
        if raw is not None:
            return raw
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


def extract_keywords(jd: str, cfg: dict) -> Optional[list[dict]]:
    if not is_configured(cfg) or not jd.strip():
        return None
    msgs = [
        {
            "role": "system",
            "content": (
                "Extract the most important hiring keywords from a job description. "
                "Return ONLY JSON: {\"keywords\":[{\"k\":\"Term\",\"m\":90},...]} "
                "k is the keyword/phrase, m is importance 50-99. Max 15 items. No prose."
            ),
        },
        {"role": "user", "content": jd[:5000]},
    ]
    raw = _complete(cfg, msgs, json_mode=True, max_tokens=500)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        items = obj.get("keywords") if isinstance(obj, dict) else None
        if not isinstance(items, list):
            return None
        out: list[dict] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            k = str(it.get("k") or "").strip()
            if not k:
                continue
            try:
                m = int(it.get("m") or 70)
            except (TypeError, ValueError):
                m = 70
            out.append({"k": k, "m": max(50, min(99, m))})
        return out[:15] or None
    except json.JSONDecodeError:
        return None


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
    raw = _complete(cfg, msgs, json_mode=True, max_tokens=2000)
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
    raw = _complete(cfg, msgs, json_mode=True, max_tokens=900)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def match_notes(data: dict, jd: str, keywords: list[dict], cfg: dict) -> Optional[str]:
    if not is_configured(cfg) or not jd.strip():
        return None
    keys = ", ".join(str(h.get("k")) for h in keywords[:12] if h.get("k"))
    msgs = [
        {
            "role": "system",
            "content": (
                "Write 3-5 short bullet notes on how well this resume matches the JD "
                "and what to improve. Return ONLY JSON: {\"notes\": \"...\"} plain text with newlines."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Keywords: {keys}\n\nJD:\n{jd[:3000]}\n\n"
                f"Summary: {data.get('summary','')}\n"
                f"Skills: {', '.join((data.get('skills') or [])[:12])}"
            ),
        },
    ]
    raw = _complete(cfg, msgs, json_mode=True, max_tokens=500)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        if isinstance(obj, dict):
            return str(obj.get("notes") or "").strip() or None
    except json.JSONDecodeError:
        return None
    return None


def tailor(data: dict, jd: str, cfg: dict) -> Optional[dict]:
    """Backward-compatible shallow tailor — prefer generate_resume_diffs via improver."""
    return generate_aux(data, jd, cfg)


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
        raw = _complete_one(
            entry,
            [{"role": "user", "content": "Reply with the single word OK."}],
            max_tokens=8,
        )
        if raw is not None:
            return True, f"Connection OK ({entry.get('provider')})"
        last_msg = "Connection failed (check key / model / base URL)"
    return False, last_msg
