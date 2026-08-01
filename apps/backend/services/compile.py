from __future__ import annotations

import io
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class CompileResult:
    ok: bool
    pdf: Optional[bytes] = None
    error: Optional[str] = None
    log: Optional[str] = None
    pages: int = 0


_PAGES_IN_LOG = re.compile(
    r"Output written on .+?\((\d+)\s+pages?",
    re.IGNORECASE,
)


def latex_available() -> bool:
    return shutil.which("pdflatex") is not None


def pdf_page_count(pdf: bytes) -> int:
    """Return page count for a PDF blob (0 if unreadable)."""
    if not pdf or len(pdf) < 100:
        return 0
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf)) as doc:
            return len(doc.pages)
    except Exception:
        pass
    # Fallback: count leaf Page objects (exclude /Pages)
    return len(re.findall(rb"/Type\s*/Page(?!\s*s)", pdf))


def _pages_from_log(log: str) -> int:
    m = _PAGES_IN_LOG.search(log or "")
    if not m:
        return 0
    try:
        return int(m.group(1))
    except ValueError:
        return 0


def compile_pdf(tex_source: str) -> CompileResult:
    with tempfile.TemporaryDirectory(prefix="tailorcv-tex-") as d:
        dirp = Path(d)
        tex_path = dirp / "resume.tex"
        pdf_path = dirp / "resume.pdf"
        log_path = dirp / "resume.log"
        tex_path.write_text(tex_source, encoding="utf-8")

        try:
            subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    f"-output-directory={dirp}",
                    str(tex_path),
                ],
                cwd=str(dirp),
                timeout=60,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
            )
        except subprocess.CalledProcessError as e:
            log = ""
            try:
                log = log_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                pass
            tail = "\n".join(log.splitlines()[-40:])
            return CompileResult(
                ok=False, error=f"pdflatex failed: {e}", log=tail or None
            )
        except subprocess.TimeoutExpired:
            return CompileResult(ok=False, error="pdflatex timed out")
        except FileNotFoundError:
            return CompileResult(ok=False, error="pdflatex not installed")

        if not pdf_path.exists():
            return CompileResult(ok=False, error="pdflatex produced no PDF")
        pdf = pdf_path.read_bytes()
        if len(pdf) < 100 or not pdf[:5] == b"%PDF-":
            return CompileResult(ok=False, error="pdflatex produced an invalid PDF")

        log = ""
        try:
            log = log_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass
        pages = _pages_from_log(log) or pdf_page_count(pdf)
        return CompileResult(ok=True, pdf=pdf, log=log or None, pages=pages)
