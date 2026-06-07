"""Admin yonetim router'i — main.py'den cikarilan rotalar."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth_utils import verify_admin
from backend.database import cache, _get_connection as _db_conn
from backend.services.rate_limit import rate_limit_general

logger = logging.getLogger("film_elestirimeni")
router = APIRouter(prefix="/api", tags=["admin"], dependencies=[Depends(rate_limit_general)])


@router.get("/admin/users", dependencies=[Depends(verify_admin)])
async def admin_list_users():
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT id, email, name, created_at FROM users ORDER BY id DESC"
        )
        rows = await cur.fetchall()
    users = [
        {"id": r[0], "email": r[1], "name": r[2], "created_at": r[3]}
        for r in rows
    ]
    return {"total": len(users), "users": users}


@router.post("/admin/fix-avatar-column", dependencies=[Depends(verify_admin)])
async def admin_fix_avatar_column():
    from backend.database import _turso_client as _tc
    if _tc is None:
        raise HTTPException(503, "Turso client aktif degil — belki local SQLite kullaniliyor")
    try:
        await _tc.execute("ALTER TABLE users ADD COLUMN avatar_data BLOB")
        return {"ok": True, "message": "avatar_data kolonu eklendi"}
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        if "duplicate" in str(e).lower():
            return {"ok": True, "message": "avatar_data kolonu zaten var"}
        raise HTTPException(500, f"Migration basarisiz: {err}")


@router.post("/admin/warm-ustad", dependencies=[Depends(verify_admin)])
async def admin_warm_ustad(limit: int = Query(10, ge=1, le=50)):
    from backend.tasks.ustad_pipeline import warm_ustad_notes
    summary = await warm_ustad_notes(limit=limit)
    return summary
