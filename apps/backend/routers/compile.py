from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response

import schemas
from services import compile as tex_compile
from services import latex as tex_gen

router = APIRouter()


@router.get("/compile-resume")
def compile_status():
    ok = tex_compile.latex_available()
    return {"pdflatex": ok, "status": "ready" if ok else "missing"}


@router.post("/compile-resume")
def compile_resume(body: schemas.CompileReq):
    if not tex_compile.latex_available():
        return JSONResponse(
            {"error": "pdflatex is not installed in the backend image."},
            status_code=503,
        )
    tex = (body.tex or "").strip()
    if not tex:
        if not body.data or not body.data.name:
            return JSONResponse(
                {"error": "Provide `data` (ResumeData) or raw `tex`"}, status_code=400
            )
        tex = tex_gen.build(
            body.data.model_dump(mode="json"),
            page_size=body.pageSize or "A4",
            margin_in=body.marginIn if body.marginIn is not None else 0.6,
            projects_two_column=bool(body.projectsTwoColumn)
            if body.projectsTwoColumn is not None
            else False,
            ats_safe=bool(body.atsSafe) if body.atsSafe is not None else True,
        )
    result = tex_compile.compile_pdf(tex)
    if not result.ok or not result.pdf:
        payload: dict = {"error": result.error or "compile failed"}
        if result.log:
            payload["log"] = result.log
        return JSONResponse(payload, status_code=422)
    name = (body.filename or (body.data.name if body.data else "resume") or "resume")
    name = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)[:80]
    return Response(
        content=result.pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{name}.pdf"',
            "Cache-Control": "no-store",
        },
    )
