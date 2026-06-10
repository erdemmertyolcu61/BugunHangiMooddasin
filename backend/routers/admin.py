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


# ─── UGC moderasyonu (Söz / liste şikayetleri) ──────────────────────────────

@router.get("/admin/reports", dependencies=[Depends(verify_admin)])
async def admin_list_reports(status: str = Query("open", max_length=20)):
    """Şikayet kuyruğu. Söz şikayetlerinde içerik metni de gösterilir."""
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            """SELECT id, content_type, content_id, reporter_id, reason, status, created_at
               FROM ugc_reports WHERE status = ? ORDER BY created_at DESC LIMIT 200""",
            (status,),
        )
        rows = await cur.fetchall()
        reports = [
            {"id": r[0], "content_type": r[1], "content_id": r[2], "reporter_id": r[3],
             "reason": r[4], "status": r[5], "created_at": str(r[6] or "")}
            for r in rows
        ]
        # Söz şikayetleri için içerik metnini ekle (admin değerlendirmesi için)
        for rep in reports:
            if rep["content_type"] == "review":
                try:
                    cur = await db.execute(
                        """SELECT r.content, r.status, u.username FROM movie_reviews r
                           JOIN users u ON u.id = r.user_id WHERE r.id = ?""",
                        (int(rep["content_id"]),),
                    )
                    row = await cur.fetchone()
                    if row:
                        rep["review_content"] = row[0]
                        rep["review_status"] = row[1]
                        rep["review_author"] = row[2]
                except Exception:
                    pass
    return {"total": len(reports), "reports": reports}


@router.post("/admin/reports/{report_id}/resolve", dependencies=[Depends(verify_admin)])
async def admin_resolve_report(report_id: int, action: str = Query(..., max_length=20)):
    """Şikayeti sonuçlandır: dismiss (içerik kalır) | hide | remove (Söz gizlenir/kaldırılır)."""
    if action not in ("dismiss", "hide", "remove"):
        raise HTTPException(400, "action 'dismiss', 'hide' veya 'remove' olmalı")
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT content_type, content_id FROM ugc_reports WHERE id = ?", (report_id,)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Şikayet bulunamadı")
        content_type, content_id = row
        if action in ("hide", "remove") and content_type == "review":
            new_status = "hidden" if action == "hide" else "removed"
            await db.execute(
                "UPDATE movie_reviews SET status = ? WHERE id = ?",
                (new_status, int(content_id)),
            )
        if action in ("hide", "remove") and content_type == "list":
            try:
                await db.execute(
                    "UPDATE user_lists SET is_public = 0 WHERE id = ?", (int(content_id),)
                )
            except Exception:
                pass
        await db.execute(
            "UPDATE ugc_reports SET status = ? WHERE id = ?",
            ("resolved" if action != "dismiss" else "dismissed", report_id),
        )
        await db.commit()
    return {"ok": True, "action": action}
