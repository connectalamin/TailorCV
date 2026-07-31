from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import db
from routers import applications, compile as compile_router, jobs, resumes, settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    if config.SEED_DEMO:
        with db.get_db() as conn:
            from services import storage

            storage.seed_demo(conn)
    yield


app = FastAPI(title="TailorCV API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(resumes.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")
app.include_router(compile_router.router, prefix="/api")
