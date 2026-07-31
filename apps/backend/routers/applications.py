from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlite3 import Connection

import schemas
from db import get_conn
from services import storage

router = APIRouter()


@router.get("/applications")
def list_applications(db: Connection = Depends(get_conn)):
    return storage.list_applications(db)


@router.post("/applications", response_model=schemas.Application)
def create_application(body: schemas.AppCreate, db: Connection = Depends(get_conn)):
    return storage.create_application(db, body.model_dump(exclude_unset=False))


@router.patch("/applications/{aid}", response_model=schemas.Application)
def patch_application(
    aid: str, body: schemas.AppPatch, db: Connection = Depends(get_conn)
):
    rec = storage.update_application(db, aid, body.model_dump(exclude_unset=True))
    if not rec:
        raise HTTPException(404, "Application not found")
    return rec


@router.delete("/applications/{aid}", status_code=204)
def delete_application(aid: str, db: Connection = Depends(get_conn)):
    if not storage.delete_application(db, aid):
        raise HTTPException(404, "Application not found")
    return Response(status_code=204)
