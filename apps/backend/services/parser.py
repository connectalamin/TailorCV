from __future__ import annotations

import re
from io import BytesIO
from typing import Optional

import schemas
from services import llm


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
    # tex / txt / md / unknown
    for enc in ("utf-8", "latin-1"):
        try:
            return content.decode(enc), ext
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace"), ext


def _name_from_file(filename: str) -> str:
    base = re.sub(r"\.[^.]+$", "", filename)
    base = re.sub(r"[_-]+", " ", base).strip()
    # Drop document-type words so "alamin_resume.pdf" → "Alamin"
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


def _fallback(filename: str, text: str) -> dict:
    cleaned = re.sub(r"\s+\n", "\n", text).strip()
    summary = cleaned[:900].strip()
    name = _name_from_file(filename) or "Candidate"
    data = {
        "name": name,
        "title": "",
        "summary": summary,
        "contact": _contact(text),
        "exp": [],
        "projects": [],
        "edu": [],
        "skills": [],
        "langs": [],
        "certs": [],
        "awards": [],
    }
    return data


def build_data(filename: str, text: str, cfg: Optional[dict] = None) -> dict:
    structured: Optional[dict] = None
    if cfg and llm.is_configured(cfg):
        structured = llm.structure(text, cfg)
    if structured and structured.get("name"):
        raw = structured
    else:
        raw = _fallback(filename, text)
        if structured:
            for k, v in structured.items():
                if v and k in raw and not raw[k]:
                    raw[k] = v
            if not raw.get("name") and structured.get("name"):
                raw["name"] = structured["name"]
    if not raw.get("name"):
        raw["name"] = _name_from_file(filename) or "Candidate"
    try:
        return schemas.ResumeData.model_validate(raw).model_dump(mode="json")
    except Exception:
        return schemas.ResumeData.model_validate(_fallback(filename, text)).model_dump(mode="json")
