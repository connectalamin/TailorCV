# TailorCV

Upload a master resume, tailor it to a job description, export a PDF, and track applications.

## Status

Frontend-only mock. **UI** follows teal Resume Studio (`index.html`). **Flows** match docs / product screens (dashboard modules, upload modal, tailor, builder tabs, JD match).

**Run via Docker only.**

## Run

```bash
docker compose up --build
```

App on port **3000**.

## Product flow

1. **Dashboard** — Initialize master / Create resume modules + upload modal  
2. **Tailor** — paste JD → processing → tailored resume  
3. **Viewer** — Enhance / Edit / Download  
4. **Builder** — tabs: Resume · Cover Letter · Outreach · JD Match  
5. **Applications** — kanban with drag-and-drop  

Mock: no real OCR/LLM/LaTeX yet.
