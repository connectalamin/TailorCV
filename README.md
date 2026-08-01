# TailorCV

Upload a master resume, tailor it to a job description, export a PDF, and track applications.

## Stack

- **Frontend** — Next.js (`apps/frontend`) on **:3000**
- **Backend** — FastAPI + SQLite + LiteLLM + `pdflatex` (`apps/backend`) on **:8000**

Design tokens: [`apps/frontend/app/ds.css`](apps/frontend/app/ds.css). Agent brief: [`AGENTS.md`](AGENTS.md).

**Run via Docker only** — no host `npm install` / no host Python venv.

## Run

```bash
cp .env.example .env   # once
docker compose up --build
```

- App: http://localhost:3000  
- API health: http://localhost:8000/health  
- PDF compile: `POST http://localhost:8000/api/compile-resume`

Set `NEXT_PUBLIC_USE_MOCK=true` only if you want the old in-browser localStorage mock (no API; PDF needs the backend).

## Product flow

1. **Dashboard** — metrics, master / create actions, recent activity  
2. **Tailor** — paste JD → improve → tailored resume  
3. **Viewer** — enhance / edit / download  
4. **Builder** — Resume · Cover · Outreach · JD Match  
5. **Applications** — kanban with drag-and-drop  
6. **Settings** — LLM / preferences  

LLM keys are configured in **Settings** (stored in the backend SQLite volume).

Sample resume content under `examples/` and the mock seed data are **fictional**.

## License

MIT — see [`LICENSE`](LICENSE).
