import os


def _bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


DATA_DIR = os.environ.get("DATA_DIR", "./data").strip() or "./data"
DB_PATH = os.path.join(DATA_DIR, "tailorcv.db")

SEED_DEMO = _bool("SEED_DEMO", False)

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if o.strip()
]

MAX_UPLOAD_BYTES = 4 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".docx", ".tex", ".txt", ".md"}
