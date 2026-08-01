from __future__ import annotations

import re
from io import BytesIO
from typing import Optional

import schemas
from services import llm
from services.skills_fmt import categorize_skills


def _ext(filename: str) -> str:
    return ("." + (filename.rsplit(".", 1)[-1] if "." in filename else "")).lower()


def extract_text(filename: str, content: bytes) -> tuple[str, str]:
    ext = _ext(filename)
    if ext == ".pdf":
        import pdfplumber

        pages = []
        with pdfplumber.open(BytesIO(content)) as pdf:
            for p in pdf.pages:
                t = p.extract_text() or ""
                if t.strip():
                    pages.append(t)
        return "\n\n".join(pages), ext
    if ext == ".docx":
        from docx import Document

        doc = Document(BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs), ext
    for enc in ("utf-8", "latin-1"):
        try:
            return content.decode(enc), ext
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace"), ext


def _name_from_file(filename: str) -> str:
    base = re.sub(r"\.[^.]+$", "", filename)
    base = re.sub(r"[_-]+", " ", base).strip()
    skip = {
        "resume",
        "cv",
        "curriculum",
        "vitae",
        "master",
        "final",
        "draft",
        "copy",
        "updated",
        "new",
    }
    words = [w for w in base.split() if w and w.lower() not in skip]
    if not words:
        return ""
    return " ".join(w[:1].upper() + w[1:] for w in words)


_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
_LINKEDIN = re.compile(r"linkedin\.com/in/[A-Za-z0-9_-]+")
_GITHUB = re.compile(r"github\.com/[A-Za-z0-9_-]+")

_SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "objective": ("objective", "summary", "profile", "about"),
    "skills": ("technical skills", "skills", "core skills", "technologies"),
    "achievements": ("achievements", "awards", "honors"),
    "education": ("education", "academic"),
    "experience": ("experience", "work experience", "employment", "work history"),
    "projects": ("projects", "personal projects", "selected projects"),
    "certs": ("certifications", "certificates", "licenses"),
    "activities": ("activities", "extracurricular", "languages", "extracurricular activities"),
}

_HEADER_RE = re.compile(
    r"(?im)^[ \t]*(?:"
    r"objective|summary|profile|about|"
    r"technical\s+skills|core\s+skills|skills|technologies|"
    r"achievements|awards|honors|"
    r"education|academic|"
    r"work\s+experience|work\s+history|experience|employment|"
    r"personal\s+projects|selected\s+projects|projects|"
    r"certifications|certificates|licenses|"
    r"extracurricular(?:\s+activities)?|activities|languages"
    r")[ \t]*[:\-]?[ \t]*$"
)


def _contact(text: str) -> dict:
    c: dict[str, str] = {}
    m = _LINKEDIN.search(text)
    if m:
        c["linkedin"] = m.group(0)
    m = _GITHUB.search(text)
    if m:
        c["github"] = m.group(0)
    m = _EMAIL.search(text)
    if m:
        c["email"] = m.group(0)
    m = _PHONE.search(text)
    if m:
        c["phone"] = m.group(0).strip()
    return c


def _canon_section(header: str) -> Optional[str]:
    h = re.sub(r"[:\-]+$", "", header.strip().lower())
    h = re.sub(r"\s+", " ", h)
    for key, aliases in _SECTION_ALIASES.items():
        if h in aliases:
            return key
    return None


def _split_sections(text: str) -> dict[str, str]:
    lines = text.replace("\r\n", "\n").split("\n")
    found: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        if _HEADER_RE.match(line.strip()):
            key = _canon_section(line)
            if key:
                found.append((i, key))
    if not found:
        return {}
    out: dict[str, str] = {}
    for idx, (start, key) in enumerate(found):
        end = found[idx + 1][0] if idx + 1 < len(found) else len(lines)
        body = "\n".join(lines[start + 1 : end]).strip()
        if body:
            out[key] = body
    return out


def _bullets_from_block(block: str) -> list[dict]:
    bullets: list[dict] = []
    for line in block.split("\n"):
        t = re.sub(r"^[\s•\-–—*]+", "", line).strip()
        if len(t) > 12:
            bullets.append({"t": t})
    return bullets[:8]


def _parse_skill_lines(block: str) -> list[str]:
    skills: list[str] = []
    for line in block.split("\n"):
        t = re.sub(r"^[\s•\-–—*]+", "", line).strip()
        if not t:
            continue
        if ":" in t or "|" in t or "," in t:
            skills.append(t.replace("|", ",").strip())
        elif len(t) > 2:
            skills.append(t)
    return skills[:16]


def _parse_pairs(block: str) -> list[list[str]]:
    pairs: list[list[str]] = []
    for line in block.split("\n"):
        t = re.sub(r"^[\s•\-–—*]+", "", line).strip()
        if not t:
            continue
        m = re.match(r"^(.+?)\s*[\(—\-–]\s*(.+?)[\)]?\s*$", t)
        if m:
            pairs.append([m.group(1).strip(), m.group(2).strip()])
        else:
            pairs.append([t, ""])
    return pairs[:12]


def _parse_entries(block: str, *, kind: str) -> list[dict]:
    """Roughly split experience/education/project blocks into entries."""
    chunks = re.split(r"\n\s*\n+", block.strip())
    if len(chunks) == 1:
        # Try lines that look like title lines
        chunks = [block.strip()]
    items: list[dict] = []
    for chunk in chunks:
        lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
        if not lines:
            continue
        first = re.sub(r"^[\s•\-–—*]+", "", lines[0])
        meta = ""
        role = first
        co = ""
        loc = ""
        # "Role | 2024" or "Role  2024"
        m = re.match(r"^(.+?)\s{2,}(.+)$", first)
        if m:
            role, meta = m.group(1).strip(), m.group(2).strip()
        elif "—" in first or " - " in first:
            parts = re.split(r"\s+[—\-]\s+", first, maxsplit=1)
            if len(parts) == 2 and any(ch.isdigit() for ch in parts[1]):
                role, meta = parts[0].strip(), parts[1].strip()
        rest_start = 1
        if kind == "edu":
            # co=school (prefer first line as school if looks institutional)
            co = role
            role = ""
            if len(lines) > 1:
                role = re.sub(r"^[\s•\-–—*]+", "", lines[1])
                rest_start = 2
                if "gpa" in role.lower() or "cgpa" in role.lower():
                    loc = role
                    role = ""
            if len(lines) > rest_start:
                maybe = re.sub(r"^[\s•\-–—*]+", "", lines[rest_start])
                if "gpa" in maybe.lower() or "cgpa" in maybe.lower():
                    loc = maybe
                    rest_start += 1
        elif kind == "project":
            if len(lines) > 1 and not lines[1].startswith(("•", "-", "*")):
                co = re.sub(r"^[\s•\-–—*]+", "", lines[1])
                rest_start = 2
        else:
            if len(lines) > 1 and not lines[1].lstrip().startswith(("•", "-", "*")):
                co = re.sub(r"^[\s•\-–—*]+", "", lines[1])
                rest_start = 2
        body = "\n".join(lines[rest_start:])
        items.append(
            {
                "co": co,
                "role": role,
                "meta": meta,
                "loc": loc,
                "b": _bullets_from_block(body) if body else _bullets_from_block("\n".join(lines[1:])),
            }
        )
        if len(items) >= 6:
            break
    return items


def _name_from_text(text: str, filename: str) -> str:
    for line in text.split("\n")[:8]:
        t = line.strip()
        if not t or len(t) > 60:
            continue
        if _EMAIL.search(t) or _PHONE.search(t) or "http" in t.lower():
            continue
        if _HEADER_RE.match(t):
            continue
        if re.match(r"^[A-Za-z][A-Za-z .'\-]{1,50}$", t):
            return t
    return _name_from_file(filename) or "Candidate"


def heuristic_structure(filename: str, text: str) -> dict:
    """Section-aware fallback — never dump the whole CV into summary."""
    cleaned = re.sub(r"[ \t]+\n", "\n", text).strip()
    sections = _split_sections(cleaned)
    contact = _contact(cleaned)
    name = _name_from_text(cleaned, filename)

    objective = (sections.get("objective") or "").strip()
    if objective:
        # First 2 sentences / 320 chars max
        parts = re.split(r"(?<=[.!?])\s+", objective)
        objective = " ".join(parts[:2]).strip()[:320]
    elif not sections:
        # No headers found: keep a short snippet only, not 900 chars of mush
        first_para = cleaned.split("\n\n")[0] if cleaned else ""
        objective = re.sub(r"\s+", " ", first_para).strip()[:220]

    data = {
        "name": name,
        "title": "",
        "summary": objective,
        "contact": contact,
        "exp": _parse_entries(sections["experience"], kind="exp") if sections.get("experience") else [],
        "projects": _parse_entries(sections["projects"], kind="project") if sections.get("projects") else [],
        "edu": _parse_entries(sections["education"], kind="edu") if sections.get("education") else [],
        "skills": _parse_skill_lines(sections["skills"]) if sections.get("skills") else [],
        "langs": _parse_pairs(sections["activities"]) if sections.get("activities") else [],
        "certs": _parse_pairs(sections["certs"]) if sections.get("certs") else [],
        "awards": _parse_pairs(sections["achievements"]) if sections.get("achievements") else [],
    }
    return data


def _normalize_edu(data: dict) -> dict:
    """Ensure edu uses co=school, role=degree (swap if inverted by older parsers)."""
    edu = data.get("edu") or []
    fixed = []
    for e in edu:
        if not isinstance(e, dict):
            continue
        item = dict(e)
        co = str(item.get("co") or "")
        role = str(item.get("role") or "")
        # Heuristic: degree-like strings often contain B.Sc / Bachelor / M.Sc
        degree_re = re.compile(r"(b\.?\s*sc|bachelor|master|m\.?\s*sc|ph\.?\s*d|diploma|degree)", re.I)
        if co and role and degree_re.search(co) and not degree_re.search(role):
            item["co"], item["role"] = role, co
        fixed.append(item)
    data["edu"] = fixed
    return data


def build_data(filename: str, text: str, cfg: Optional[dict] = None) -> dict:
    structured: Optional[dict] = None
    used_heuristic = False
    if cfg and llm.is_configured(cfg):
        structured = llm.structure_with_retry(text, cfg)

    if structured and structured.get("name") and not llm.is_blob_resume(structured):
        raw = structured
    else:
        raw = heuristic_structure(filename, text)
        used_heuristic = True
        if structured:
            for k, v in structured.items():
                if v and k in raw and not raw[k]:
                    raw[k] = v
            if structured.get("name"):
                raw["name"] = structured["name"]
            # If LLM gave skills/exp but was marked blob due to long summary, merge sections
            if llm.is_blob_resume(structured):
                for key in ("exp", "projects", "edu", "skills", "awards", "certs", "langs"):
                    if structured.get(key) and not raw.get(key):
                        raw[key] = structured[key]
                # Trim blob summary if we have sections now
                if not llm.is_blob_resume(raw) and len(str(raw.get("summary") or "")) > 350:
                    raw["summary"] = str(raw["summary"])[:320].rsplit(" ", 1)[0]

    if not raw.get("name"):
        raw["name"] = _name_from_file(filename) or "Candidate"
    raw = _normalize_edu(raw)
    raw["skills"] = categorize_skills(raw.get("skills") or [])
    raw["_used_heuristic"] = used_heuristic  # stripped by pydantic validate below

    try:
        cleaned = {k: v for k, v in raw.items() if not k.startswith("_")}
        out = schemas.ResumeData.model_validate(cleaned).model_dump(mode="json")
        return out
    except Exception:
        fb = heuristic_structure(filename, text)
        fb["skills"] = categorize_skills(fb.get("skills") or [])
        return schemas.ResumeData.model_validate(fb).model_dump(mode="json")


def restructure_from_text(filename: str, text: str, cfg: Optional[dict] = None) -> dict:
    """Force re-parse of raw text into ATS sections."""
    return build_data(filename or "resume.txt", text, cfg)


def data_to_plain_text(data: dict) -> str:
    """Reconstruct approximate source text from structured data (for restructure without file)."""
    parts: list[str] = []
    if data.get("name"):
        parts.append(str(data["name"]))
    contact = data.get("contact") or {}
    bits = [contact.get(k) for k in ("location", "email", "phone", "linkedin", "github", "website")]
    parts.append(" | ".join(str(b) for b in bits if b))
    if data.get("summary"):
        parts.append("Objective\n" + str(data["summary"]))
    if data.get("skills"):
        parts.append("Technical Skills\n" + "\n".join(str(s) for s in data["skills"]))
    if data.get("awards"):
        parts.append(
            "Achievements\n"
            + "\n".join(f"{a[0]}" + (f" — {a[1]}" if len(a) > 1 and a[1] else "") for a in data["awards"])
        )
    if data.get("edu"):
        lines = ["Education"]
        for e in data["edu"]:
            lines.append(f"{e.get('co','')}  {e.get('meta','')}")
            if e.get("role"):
                lines.append(str(e["role"]))
            if e.get("loc"):
                lines.append(str(e["loc"]))
        parts.append("\n".join(lines))
    for section, title in (("exp", "Experience"), ("projects", "Projects")):
        items = data.get(section) or []
        if not items:
            continue
        lines = [title]
        for e in items:
            lines.append(f"{e.get('role','')}  {e.get('meta','')}")
            if e.get("co"):
                lines.append(str(e["co"]))
            for b in e.get("b") or []:
                lines.append(f"- {b.get('t','')}")
        parts.append("\n".join(lines))
    if data.get("certs"):
        parts.append(
            "Certifications\n"
            + "\n".join(f"{a[0]}" + (f" ({a[1]})" if len(a) > 1 and a[1] else "") for a in data["certs"])
        )
    if data.get("langs"):
        parts.append(
            "Activities\n"
            + "\n".join(f"{a[0]}" + (f" ({a[1]})" if len(a) > 1 and a[1] else "") for a in data["langs"])
        )
    # If still blob-like, prefer original summary as source
    if llm.is_blob_resume(data) and data.get("summary"):
        return str(data["summary"])
    return "\n\n".join(p for p in parts if p)
