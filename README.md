# .TailorCV

Upload a master resume, tailor it to a job description, export a PDF, and track applications.

## Stack

- **Frontend** — Next.js (`apps/frontend`) on **:3000**
- **Backend** — FastAPI + SQLite + LiteLLM + `pdflatex` (`apps/backend`) on **:8000**

Design tokens: `[apps/frontend/app/ds.css](apps/frontend/app/ds.css)`. Agent brief: `[AGENTS.md](AGENTS.md)`.

## Run with Docker (recommended)

```bash
cp .env.example .env   # once
docker compose up --build
```

- App: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/health](http://localhost:8000/health)
- PDF compile: `POST http://localhost:8000/api/compile-resume`

## Run without Docker

You need **Node.js 22+**, **Python 3.12+**, and `**pdflatex`** on your PATH (TeX Live, or [MiKTeX](https://miktex.org/) on Windows). Without `pdflatex`, the API still runs but PDF export fails.

```bash
cp .env.example .env   # once — keep NEXT_PUBLIC_USE_MOCK=false
```

### 1. Backend

```bash
cd apps/backend
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt

# Optional: SQLite + uploads live under ./data by default
# set DATA_DIR, CORS_ORIGINS, SEED_DEMO if you need them (see .env.example)

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Leave this terminal open. Check [http://localhost:8000/health](http://localhost:8000/health) and [http://localhost:8000/api/compile-resume](http://localhost:8000/api/compile-resume) (should report `pdflatex` ready when TeX is installed).

### 2. Frontend

In a second terminal:

```bash
cd apps/frontend
npm install

# Windows (PowerShell) — bake API URL into the Next.js client
$env:NEXT_PUBLIC_USE_MOCK="false"
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev

# macOS / Linux
# NEXT_PUBLIC_USE_MOCK=false NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `NEXT_PUBLIC_USE_MOCK=true` only if you want the old in-browser localStorage mock (no API; PDF still needs the backend + `pdflatex`).

### Notes

- Configure LLM keys in **Settings** (stored in the backend SQLite DB under `DATA_DIR`, default `apps/backend/data`).
- After changing `NEXT_PUBLIC_*` values, restart `npm run dev`.
- Prefer Docker if you do not want to install TeX on the host

## Product flow

1. **Dashboard** — metrics, master / create actions, recent activity
2. **Tailor** — paste JD → improve → tailored resume
3. **Viewer** — enhance / edit / download
4. **Builder** — Resume · Cover · Outreach · JD Match
5. **Applications** — kanban with drag-and-drop
6. **Settings** — LLM / preferences

Sample resume content under `examples/` and the mock seed data are **fictional**.

## License

MIT — see `[LICENSE](LICENSE)`.