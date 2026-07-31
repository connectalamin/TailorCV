# TailorCV — Agent context

Dense project brief for coding agents. Prefer this over rediscovering the repo.

## Product

Upload a **master resume** → paste a **job description** → **tailor** → export **PDF** → track **applications**.

**Now:** frontend-only mock (browser `localStorage`). No FastAPI / LiteLLM / LaTeX yet.

## Run (Docker only)

```bash
docker compose up --build   # apps/frontend → :3000
```

Do **not** `npm install` on the host. Rebuild the image after UI changes.

WSL note: if Hub pull fails with `error getting credentials`, remove `credsStore` from `~/.docker/config.json` (Docker Desktop often rewrites it to `desktop` / `desktop.exe`).

## Layout

```
apps/frontend/          Next.js App Router (standalone Docker)
  app/ds.css            Design-system tokens + chrome components
  app/globals.css       imports ds.css + resume/kanban CSS
  app/(app)/            dashboard, tailor, builder, tracker, settings, resumes/[id]
  components/layout/studio-shell.tsx
  components/resume/    preview templates
  lib/api/              mock API (USE_MOCK until backend)
  lib/types/resume.ts
  lib/utils/keyword-matcher.ts
index.html              Visual prototype (legacy studio; not the product shell)
docs/                   Architecture / rebuild notes (gitignored locally sometimes)
design/                 Template design refs
```

## Routes

| Path | Role |
|------|------|
| `/` | → `/dashboard` |
| `/dashboard` | Metrics, master + create actions, recent activity |
| `/tailor` | Paste JD → mock improve → `/resumes/[id]` |
| `/builder?id=` | Tabs: Resume / Cover / Outreach / JD Match |
| `/tracker` | Kanban DnD (wish → applied → interview → offer) |
| `/settings` | LLM form + preferences + danger zone |
| `/resumes/[id]` | Viewer: enhance / edit / download |

## Design system (source of truth)

Tokens + classes: `apps/frontend/app/ds.css`.

- **Accent:** `#0F6E56` only (`--accent` / `--accent-bg`)
- **Surfaces:** `--surface-0` page `#F7F7F5`, `--surface-1` cards/sidebar `#FFF`
- **Type:** Inter; weights **400 / 500** only (display 600 rare). Sentence case. Caption = uppercase 12px.
- **Chrome:** sidebar **220px** (64px &lt;1024), top bar **56px** (title + **one** primary CTA), content max **1140px**
- **Cards:** metric (no border) · action (0.5px border; featured = 2px accent) · list-row · panel
- **One** accent-filled button per screen; rest secondary/ghost
- Settings = form panel + sub-nav — **not** a dashboard card grid

Do **not** revive: neo-brutal Swiss pack, blue SaaS accents, dark “studio” master cards, dotted canvas chrome, ALL-CAPS body, multi-accent rainbows.

## Mock API

`NEXT_PUBLIC_USE_MOCK` (default on). All UI via `@/lib/api`.

Keys: `tailorcv_resumes`, `master_resume_id`, `tailorcv_apps`, `resume_builder_settings`, `resume_builder_draft`.

Upload accepts `.pdf/.docx/.tex/.txt` → delayed fake parse → sample `ResumeData`. PDF download = stub blob.

## Git hygiene

Ignore: `.docker-config/`, `.env`, `docs/` (per root `.gitignore`). Never commit Docker Desktop config or secrets.

## Default resume format

**LaTeX ATS** (`template: "latex"`): letter, ~0.75in margins, 10.5pt serif, **single column only**, black `\titlerule` under sections, no icons/color/multicol. Order: Objective → Technical Skills → Achievements → Education → Experience → Projects → Certifications → Activities.

Builder tabs: Resume · Cover letter (formal sheet) · Outreach mail (email chrome) · JD match (paste JD + missing/matched + overlap highlight).

## PDF / LaTeX

Docker runner installs TeX Live (`pdflatex`). Compile via `POST /api/compile-resume` with `{ data: ResumeData }` (or raw `tex`). Client download uses this route. Check: `GET /api/compile-resume` → `{ pdflatex: true }`.

## Next real work (when asked)

Wire FastAPI + LiteLLM; keep LaTeX PDF path (or move compile to a worker).

