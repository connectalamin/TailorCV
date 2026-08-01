# TailorCV — Agent context

Dense project brief for coding agents. Prefer this over rediscovering the repo.

## Product

Upload a **master resume** → paste a **job description** → **tailor** → export **PDF** → track **applications**.

## Run (Docker only)

```bash
docker compose up --build
# frontend :3000 · backend :8000
```

Do **not** `npm install` or create a Python venv on the host. Recreate images after code changes (`docker compose up --build`).

WSL note: if Hub pull fails with `error getting credentials`, remove `credsStore` from `~/.docker/config.json` (Docker Desktop often rewrites it to `desktop` / `desktop.exe`).

## Layout

```
apps/frontend/          Next.js App Router (standalone Docker)
  app/ds.css            Design-system tokens + chrome
  lib/api/              Client: real API when NEXT_PUBLIC_USE_MOCK≠true
apps/backend/           FastAPI + SQLite + LiteLLM + pdflatex
  routers/              resumes, jobs, applications, settings, compile
  services/             storage, parser, llm, latex, compile
docker-compose.yml      backend + frontend + tailorcv_data volume
```

## Routes (UI)

| Path | Role |
|------|------|
| `/` | → `/dashboard` |
| `/dashboard` | Metrics, master + create actions, recent activity |
| `/tailor` | Paste JD → improve → `/resumes/[id]` |
| `/builder?id=` | Tabs: Resume / Cover / Outreach / JD Match |
| `/tracker` | Kanban DnD |
| `/settings` | LLM form + preferences |
| `/resumes/[id]` | Viewer |

## API (backend)

Prefix `/api/v1` for app data; compile is `/api/compile-resume`.

- `POST /api/v1/resumes/upload` · `GET/PATCH/DELETE /api/v1/resumes/{id}`
- `POST /api/v1/jobs` · `POST /api/v1/jobs/analyze`
- `GET/POST /api/v1/applications` · `PATCH/DELETE /api/v1/applications/{id}`
- `GET/PUT /api/v1/llm` · `POST /api/v1/llm/test` · `GET /api/v1/status`
- `GET/POST /api/compile-resume` (pdflatex in **backend** image)

Browser calls `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

## Design system

Tokens: `apps/frontend/app/ds.css` — **Estilo Deep Learning High-Tech** (dark, NVIDIA green `#76B900`, Roboto Mono). Resume sheet stays monochrome ATS.

## Env

See `.env.example`. Important: `NEXT_PUBLIC_USE_MOCK=false` (default) · `SEED_DEMO=0` (opt-in demo apps) · `CORS_ORIGINS` must include the frontend origin.

## Default resume format

**LaTeX ATS** (`template: "latex"`): letter, ~0.75in, 10.5pt, single column, black `\titlerule`. Order: Objective → Skills → Achievements → Education → Experience → Projects → Certs → Activities.

Skills must be categorized lines (`Languages: …`, `Frontend: …`), not one tech per bullet. See `.cursor/skills/tailorcv-ats-resume/`.

## Agent skills

Project skills live in `.cursor/skills/` (committed with the repo — any Cursor agent in this workspace can load them):

| Skill | Use when |
|-------|----------|
| `tailorcv-ats-resume` | Resume structure, LaTeX/PDF, mashed Objective, flat skills |
| `tailorcv-docker-workflow` | `docker compose` run, image updates, stale UI |

Always-on rule `.cursor/rules/tailorcv-agent-skills.mdc` tells agents which project + Cursor skills to open for a task.

## Git hygiene

Ignore: `.docker-config/`, `.env`, `docs/`, `design/`, `__pycache__/`, venvs. Never commit secrets.
