"""Hybrid resume content quality checks (heuristics + optional LLM enrichment)."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any, Optional

from services import llm as llm_svc

_QUANT_RE = re.compile(
    r"(\d|%|\$|\b\d+[xX]\b|\bpercent\b|\bincreased\b|\breduced\b|\bgrew\b)",
    re.I,
)
_WEAK_START = re.compile(
    r"^(responsible for|helped with|worked on|assisted with|duties included)\b",
    re.I,
)


def _status(score: int) -> str:
    if score >= 80:
        return "ok"
    if score >= 55:
        return "warn"
    return "fail"


def _all_bullets(data: dict) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for section in ("exp", "projects", "edu"):
        for i, item in enumerate(data.get(section) or []):
            role = str(item.get("role") or item.get("co") or section)
            for j, b in enumerate(item.get("b") or []):
                t = str(b.get("t") or "").strip()
                if t:
                    out.append((f"{section}[{i}].b[{j}] ({role})", t))
    return out


def _heuristic_categories(
    data: dict, jd: str
) -> tuple[list[dict], list[dict]]:
    """Return (categories, issues) from fast heuristics."""
    issues: list[dict] = []
    bullets = _all_bullets(data)

    # Quantifying impact
    if bullets:
        quantified = sum(1 for _, t in bullets if _QUANT_RE.search(t))
        q_ratio = quantified / len(bullets)
        q_score = int(round(min(100, q_ratio * 120)))
        weak = [(loc, t) for loc, t in bullets if _WEAK_START.search(t)]
        for loc, t in weak[:4]:
            issues.append(
                {
                    "category": "quantifying_impact",
                    "severity": "warn",
                    "message": "Weak or vague bullet opener",
                    "location": loc,
                    "suggestion": f"Lead with a strong verb and a metric where truthful: “{t[:80]}…”",
                }
            )
        if q_ratio < 0.4 and bullets:
            issues.append(
                {
                    "category": "quantifying_impact",
                    "severity": "fail" if q_ratio < 0.2 else "warn",
                    "message": f"Only {quantified}/{len(bullets)} bullets include numbers or scale",
                    "location": "bullets",
                    "suggestion": "Add truthful metrics (%, $, time saved, users) where you have them",
                }
            )
    else:
        q_score = 40
        issues.append(
            {
                "category": "quantifying_impact",
                "severity": "fail",
                "message": "No bullets found to quantify",
                "location": "exp/projects",
                "suggestion": "Add experience or project bullets with measurable outcomes",
            }
        )

    # Repetition
    heads: list[str] = []
    for _, t in bullets:
        words = re.findall(r"[A-Za-z]+", t.lower())
        if words:
            heads.append(" ".join(words[:2]))
    counts = Counter(heads)
    repeated = [(h, n) for h, n in counts.items() if n >= 3 and h]
    r_score = 100
    if repeated:
        r_score = max(35, 100 - 15 * len(repeated))
        for h, n in repeated[:3]:
            issues.append(
                {
                    "category": "repetition",
                    "severity": "warn",
                    "message": f"Repeated bullet start “{h}…” ({n}×)",
                    "location": "bullets",
                    "suggestion": "Vary verbs and sentence openings across bullets",
                }
            )
    else:
        r_score = 92

    # ATS essentials
    ats_issues = 0
    skills = data.get("skills") or []
    categorized = sum(1 for s in skills if isinstance(s, str) and ":" in s)
    summary = str(data.get("summary") or "").strip()
    has_exp = bool(data.get("exp"))
    has_edu = bool(data.get("edu"))
    ats_score = 100
    if llm_svc.is_blob_resume(data):
        ats_score -= 40
        ats_issues += 1
        issues.append(
            {
                "category": "ats_essentials",
                "severity": "fail",
                "message": "Objective looks like a full resume dump",
                "location": "summary",
                "suggestion": "Run Re-parse structure so sections fill correctly",
            }
        )
    elif len(summary) > 350:
        ats_score -= 15
        ats_issues += 1
        issues.append(
            {
                "category": "ats_essentials",
                "severity": "warn",
                "message": "Objective is longer than ~2 sentences",
                "location": "summary",
                "suggestion": "Keep Objective to 1–2 tight sentences",
            }
        )
    if skills and categorized < max(1, len(skills) // 2):
        ats_score -= 20
        ats_issues += 1
        issues.append(
            {
                "category": "ats_essentials",
                "severity": "warn",
                "message": "Skills should use Category: item lines",
                "location": "skills",
                "suggestion": "e.g. Languages: Python, TypeScript",
            }
        )
    if not has_exp:
        ats_score -= 15
        ats_issues += 1
        issues.append(
            {
                "category": "ats_essentials",
                "severity": "warn",
                "message": "Missing Experience section",
                "location": "exp",
            }
        )
    if not has_edu:
        ats_score -= 10
        ats_issues += 1
        issues.append(
            {
                "category": "ats_essentials",
                "severity": "info",
                "message": "No Education section",
                "location": "edu",
            }
        )
    if not str(data.get("name") or "").strip():
        ats_score -= 20
        ats_issues += 1
        issues.append(
            {
                "category": "ats_essentials",
                "severity": "fail",
                "message": "Missing candidate name",
                "location": "name",
            }
        )
    ats_score = max(0, min(100, ats_score))

    # Spelling placeholder (LLM fills); mild heuristic for ALL CAPS shouting
    g_score = 78
    shout = [loc for loc, t in bullets if t.isupper() and len(t) > 12]
    if shout:
        g_score = 60
        issues.append(
            {
                "category": "spelling_grammar",
                "severity": "warn",
                "message": "ALL-CAPS bullet text looks unprofessional",
                "location": shout[0],
                "suggestion": "Use sentence case",
            }
        )

    categories = [
        {
            "id": "spelling_grammar",
            "label": "Spelling & Grammar",
            "score": g_score,
            "issueCount": sum(
                1 for i in issues if i["category"] == "spelling_grammar"
            ),
            "status": _status(g_score),
        },
        {
            "id": "quantifying_impact",
            "label": "Quantifying Impact",
            "score": q_score,
            "issueCount": sum(
                1 for i in issues if i["category"] == "quantifying_impact"
            ),
            "status": _status(q_score),
        },
        {
            "id": "repetition",
            "label": "Repetition",
            "score": r_score,
            "issueCount": sum(1 for i in issues if i["category"] == "repetition"),
            "status": _status(r_score),
        },
        {
            "id": "ats_essentials",
            "label": "ATS Essentials",
            "score": ats_score,
            "issueCount": sum(
                1 for i in issues if i["category"] == "ats_essentials"
            ),
            "status": _status(ats_score),
        },
    ]

    jd = (jd or "").strip()
    if jd:
        # Light keyword overlap signal; LLM can refine
        plain = " ".join(
            [
                summary,
                " ".join(str(s) for s in skills),
                " ".join(t for _, t in bullets),
            ]
        ).lower()
        tokens = {
            w
            for w in re.findall(r"[a-z][a-z0-9+#.]{2,}", jd.lower())
            if w
            not in {
                "the",
                "and",
                "for",
                "with",
                "you",
                "will",
                "our",
                "are",
                "this",
                "that",
                "from",
                "have",
                "your",
                "job",
                "role",
                "team",
                "work",
                "experience",
                "years",
                "ability",
                "strong",
                "using",
                "including",
            }
        }
        hits = sum(1 for t in list(tokens)[:40] if t in plain)
        denom = max(8, min(40, len(tokens)))
        t_score = int(round(100 * hits / denom)) if denom else 50
        t_score = max(20, min(95, t_score))
        if t_score < 55:
            issues.append(
                {
                    "category": "tailoring",
                    "severity": "warn",
                    "message": "Limited overlap with JD keywords",
                    "location": "resume",
                    "suggestion": "Re-tailor for JD or weave in truthful JD terms",
                }
            )
        categories.append(
            {
                "id": "tailoring",
                "label": "Tailoring",
                "score": t_score,
                "issueCount": sum(1 for i in issues if i["category"] == "tailoring"),
                "status": _status(t_score),
            }
        )

    return categories, issues


def _merge_llm(
    categories: list[dict],
    issues: list[dict],
    llm_out: Optional[dict],
) -> tuple[list[dict], list[dict]]:
    if not llm_out or not isinstance(llm_out, dict):
        return categories, issues

    by_id = {c["id"]: dict(c) for c in categories}
    for raw in llm_out.get("categories") or []:
        if not isinstance(raw, dict):
            continue
        cid = str(raw.get("id") or "").strip()
        if cid not in by_id:
            continue
        try:
            score = int(raw.get("score"))
        except (TypeError, ValueError):
            continue
        score = max(0, min(100, score))
        # Blend: heuristics 45%, LLM 55% for spelling; more heuristic weight elsewhere
        w_llm = 0.65 if cid == "spelling_grammar" else 0.4
        blended = int(round((1 - w_llm) * by_id[cid]["score"] + w_llm * score))
        by_id[cid]["score"] = blended
        by_id[cid]["status"] = _status(blended)

    for raw in llm_out.get("issues") or []:
        if not isinstance(raw, dict):
            continue
        msg = str(raw.get("message") or "").strip()
        cat = str(raw.get("category") or "spelling_grammar").strip()
        if not msg:
            continue
        sev = str(raw.get("severity") or "warn").strip().lower()
        if sev not in ("info", "warn", "fail"):
            sev = "warn"
        issues.append(
            {
                "category": cat if cat in by_id else "spelling_grammar",
                "severity": sev,
                "message": msg[:280],
                "location": (str(raw.get("location") or "").strip() or None),
                "suggestion": (str(raw.get("suggestion") or "").strip() or None),
            }
        )

    # Refresh issue counts
    out_cats = []
    for c in categories:
        cid = c["id"]
        merged = by_id[cid]
        merged["issueCount"] = sum(1 for i in issues if i["category"] == cid)
        merged["status"] = _status(merged["score"])
        out_cats.append(merged)
    return out_cats, issues


def run_content_check(
    data: dict, cfg: dict, jd: str = ""
) -> dict[str, Any]:
    categories, issues = _heuristic_categories(data, jd)
    llm_out = None
    if llm_svc.is_configured(cfg):
        llm_out = llm_svc.content_check(data, cfg, jd=jd)
    categories, issues = _merge_llm(categories, issues, llm_out)

    if not categories:
        return {"score": 0, "issueCount": 0, "categories": [], "issues": []}

    weights = {
        "spelling_grammar": 1.2,
        "quantifying_impact": 1.1,
        "repetition": 0.9,
        "ats_essentials": 1.3,
        "tailoring": 1.0,
    }
    total_w = 0.0
    acc = 0.0
    for c in categories:
        w = weights.get(c["id"], 1.0)
        acc += c["score"] * w
        total_w += w
    overall = int(round(acc / total_w)) if total_w else 0
    fail_warn = [i for i in issues if i.get("severity") in ("warn", "fail")]
    return {
        "score": overall,
        "issueCount": len(fail_warn),
        "categories": categories,
        "issues": issues[:40],
    }


def run_content_fix(
    data: dict,
    cfg: dict,
    *,
    jd: str = "",
    issues: Optional[list] = None,
) -> Optional[dict]:
    """Return polished ResumeData dict, or None on failure."""
    from services.improver import apply_diffs
    from services.skills_fmt import categorize_skills

    if not llm_svc.is_configured(cfg):
        return None
    diffs = llm_svc.content_fix(data, cfg, issues=issues or [], jd=jd)
    if not diffs:
        return None
    out = apply_diffs(data, diffs)
    if "skills" in out:
        out["skills"] = categorize_skills(out.get("skills") or [])
    return out
