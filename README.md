# TailorCV

Upload a master resume, tailor it to a job description, export a PDF, and track applications.

## Status

Frontend-only mock. Design system + agent brief: [`AGENTS.md`](AGENTS.md) · tokens: [`apps/frontend/app/ds.css`](apps/frontend/app/ds.css).

**Run via Docker only.** Image includes `pdflatex` for ATS resume PDF export.

## Run

```bash
docker compose up --build
```

App on port **3000**. PDF: `POST /api/compile-resume` (also used by Download).

## Product flow

1. **Dashboard** — metrics, master / create actions, recent activity  
2. **Tailor** — paste JD → processing → tailored resume  
3. **Viewer** — enhance / edit / download  
4. **Builder** — Resume · Cover · Outreach · JD Match  
5. **Applications** — kanban with drag-and-drop  
6. **Settings** — LLM / preferences / danger zone  

Mock: no real OCR/LLM yet. Resume PDF is compiled with **pdflatex** in Docker.
