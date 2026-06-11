"""
Topluluk Katmanı Router — Trend akışı, Söz (herkese açık mini yorum),
beğeniler, şikayet (UGC moderasyonu) ve kullanıcı engelleme.

Tasarım notları:
- Söz, movie_notes'tan AYRI tutulur: notlar özel günlük, Söz herkese açıktır.
- Store (App Store/Play) UGC kuralları gereği her herkese açık içerik
  şikayet edilebilir ve yazarı engellenebilir; tüm public okuma yolları
  engellenen kullanıcıların ve 'visible' olmayan içeriğin dışlanmasını uygular.
- Sıfır AI maliyeti: yalnız SQL + mevcut TMDB meta cache'i.
"""
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.auth_utils import optional_user_id, verify_user
from backend.database import cache, _get_connection as _db_conn
from backend.routers.social import _fill_missing_posters
from backend.services.rate_limit import rate_limit_strict

logger = logging.getLogger("community")

router = APIRouter(prefix="/api", tags=["community"])

REVIEW_MAX_LEN = 280

# ─── Yardımcılar ─────────────────────────────────────────────────────────────


async def _blocked_ids(db, user_id: int) -> set:
    """Kullanıcının engellediği + onu engelleyen kullanıcı id'leri (çift yönlü)."""
    if not user_id:
        return set()
    cur = await db.execute(
        "SELECT blocked_id FROM user_blocks WHERE blocker_id = ? "
        "UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = ?",
        (user_id, user_id),
    )
    return {r[0] for r in await cur.fetchall()}


async def _movie_meta(movie_ids: list) -> dict:
    meta = await cache.get_movies_meta_by_ids(movie_ids) if movie_ids else {}
    await _fill_missing_posters(meta, movie_ids)
    return meta


# ─── Trend: "Bu Hafta Toplulukta" ────────────────────────────────────────────
# Son 7 günün topluluk aktivitesinden türetilir; login gerektirmez.
# Skor: 3*topluluk önerisi + 2*Söz + 1*deftere ekleme.
_trending_cache: dict = {"ts": 0.0, "data": None}
_TRENDING_TTL = 3600  # 1 saat


@router.get("/community/trending")
async def get_trending(request: Request, limit: int = 12):
    """Bu haftanın topluluk trendi — herkese açık (soğuk başlangıç çözümü)."""
    limit = max(1, min(limit, 24))
    now = time.time()
    if _trending_cache["data"] is not None and now - _trending_cache["ts"] < _TRENDING_TTL:
        return {"movies": _trending_cache["data"][:limit], "cached": True}

    scores: dict[int, dict] = {}  # tmdb_id -> {score, recommenders: [..]}

    def _bump(tid, pts):
        e = scores.setdefault(int(tid), {"score": 0, "recommenders": []})
        e["score"] += pts

    try:
        async with _db_conn(cache.db_path, user_data=True) as db:
            # Topluluk önerileri (en güçlü sinyal) + önerici avatarları
            cur = await db.execute(
                """SELECT cr.tmdb_id, cr.username, cr.avatar FROM community_recommendations cr
                   WHERE cr.created_at >= datetime('now','-7 days')
                   ORDER BY cr.created_at DESC LIMIT 400"""
            )
            for tid, username, avatar in await cur.fetchall():
                _bump(tid, 3)
                recs = scores[int(tid)]["recommenders"]
                if len(recs) < 3 and username:
                    recs.append({"username": username, "avatar": avatar or ""})

            # Sözler
            try:
                cur = await db.execute(
                    """SELECT tmdb_id FROM movie_reviews
                       WHERE status = 'visible' AND created_at >= datetime('now','-7 days')
                       LIMIT 400"""
                )
                for (tid,) in await cur.fetchall():
                    _bump(tid, 2)
            except Exception:
                pass  # tablo henüz oluşmamış olabilir (ilk açılış)

            # Deftere eklemeler
            cur = await db.execute(
                """SELECT tmdb_id FROM watchlist
                   WHERE added_at >= datetime('now','-7 days') LIMIT 1000"""
            )
            for (tid,) in await cur.fetchall():
                _bump(tid, 1)
    except Exception as e:
        logger.warning("[Trending] sorgu hatası: %s", e)

    ranked = sorted(scores.items(), key=lambda kv: kv[1]["score"], reverse=True)[:24]
    movie_ids = [tid for tid, _ in ranked]
    meta = await _movie_meta(movie_ids)

    movies = []
    for tid, entry in ranked:
        m = meta.get(tid)
        if not m or not m.get("poster_url"):
            continue
        movies.append({
            "id": tid,
            "title": m.get("title", ""),
            "poster_url": m["poster_url"],
            "vote_average": m.get("vote_average"),
            "release_date": m.get("release_date"),
            "trend_score": entry["score"],
            "recommenders": entry["recommenders"],
        })

    _trending_cache["data"] = movies
    _trending_cache["ts"] = now
    return {"movies": movies[:limit], "cached": False}


# ─── Söz: herkese açık mini yorum (≤280 karakter) ───────────────────────────


class ReviewBody(BaseModel):
    content: str = Field(..., min_length=2, max_length=REVIEW_MAX_LEN)
    has_spoiler: bool = False


@router.post("/movies/{tmdb_id}/reviews", dependencies=[Depends(rate_limit_strict)])
async def upsert_review(tmdb_id: int, body: ReviewBody, user: dict = Depends(verify_user)):
    """Film için Söz yaz/güncelle (kullanıcı başına film başına 1 Söz)."""
    uid = user["user_id"]
    content = body.content.strip()
    if len(content) < 2:
        raise HTTPException(400, "Söz çok kısa.")
    async with _db_conn(cache.db_path, user_data=True) as db:
        await db.execute(
            """INSERT INTO movie_reviews (tmdb_id, user_id, content, has_spoiler, status)
               VALUES (?, ?, ?, ?, 'visible')
               ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
                 content = excluded.content,
                 has_spoiler = excluded.has_spoiler,
                 status = 'visible',
                 updated_at = CURRENT_TIMESTAMP""",
            (int(tmdb_id), uid, content, int(body.has_spoiler)),
        )
        await db.commit()
        # Yeni/mevcut review'ı geri oku
        cur = await db.execute(
            """SELECT r.id, r.tmdb_id, r.user_id, r.content, r.has_spoiler,
                      r.created_at, r.updated_at,
                      u.username, u.picture
               FROM movie_reviews r
               JOIN users u ON u.id = r.user_id
               WHERE r.tmdb_id = ? AND r.user_id = ?""",
            (int(tmdb_id), uid),
        )
        row = await cur.fetchone()
    # Trend cache'i tazelensin (Söz sinyali değişti)
    _trending_cache["ts"] = 0.0
    if row:
        return {
            "ok": True,
            "review": {
                "id": row[0],
                "tmdb_id": row[1],
                "user_id": row[2],
                "content": row[3],
                "has_spoiler": bool(row[4]),
                "created_at": str(row[5] or ""),
                "username": row[7] or "",
                "avatar": row[8] or "",
                "like_count": 0,
                "liked_by_me": False,
                "is_mine": True,
            }
        }
    return {"ok": True}


@router.get("/movies/{tmdb_id}/reviews")
async def list_reviews(tmdb_id: int, request: Request, limit: int = 20, offset: int = 0):
    """Filmin görünür Sözleri — login gerektirmez. Engellenen yazarlar dışlanır."""
    limit = max(1, min(limit, 50))
    viewer_id = optional_user_id(request)
    async with _db_conn(cache.db_path, user_data=True) as db:
        blocked = await _blocked_ids(db, viewer_id)
        cur = await db.execute(
            """SELECT r.id, r.tmdb_id, r.user_id, r.content, r.has_spoiler,
                      r.created_at, r.updated_at,
                      u.username, u.picture,
                      (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id) AS like_count,
                      (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id AND rl.user_id = ?) AS liked_by_me
               FROM movie_reviews r
               JOIN users u ON u.id = r.user_id
               WHERE r.tmdb_id = ? AND r.status = 'visible'
               ORDER BY like_count DESC, r.created_at DESC
               LIMIT ? OFFSET ?""",
            (viewer_id or 0, int(tmdb_id), limit, offset),
        )
        rows = await cur.fetchall()

    reviews = []
    for r in rows:
        if r[2] in blocked:
            continue
        reviews.append({
            "id": r[0],
            "tmdb_id": r[1],
            "user_id": r[2],
            "content": r[3],
            "has_spoiler": bool(r[4]),
            "created_at": str(r[5] or ""),
            "username": r[7] or "",
            "avatar": r[8] or "",
            "like_count": r[9] or 0,
            "liked_by_me": bool(r[10]),
            "is_mine": bool(viewer_id and r[2] == viewer_id),
        })
    return {"reviews": reviews, "count": len(reviews)}


@router.delete("/movies/{tmdb_id}/reviews")
async def delete_own_review(tmdb_id: int, user: dict = Depends(verify_user)):
    """Kendi Söz'ünü sil."""
    uid = user["user_id"]
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT id FROM movie_reviews WHERE tmdb_id = ? AND user_id = ?",
            (int(tmdb_id), uid),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Söz bulunamadı.")
        await db.execute("DELETE FROM review_likes WHERE review_id = ?", (row[0],))
        await db.execute("DELETE FROM movie_reviews WHERE id = ?", (row[0],))
        await db.commit()
    return {"ok": True}


# ─── Söz beğenileri ──────────────────────────────────────────────────────────


@router.post("/reviews/{review_id}/like", dependencies=[Depends(rate_limit_strict)])
async def like_review(review_id: int, user: dict = Depends(verify_user)):
    uid = user["user_id"]
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT 1 FROM movie_reviews WHERE id = ? AND status = 'visible'", (review_id,)
        )
        if not await cur.fetchone():
            raise HTTPException(404, "Söz bulunamadı.")
        await db.execute(
            "INSERT OR IGNORE INTO review_likes (review_id, user_id) VALUES (?, ?)",
            (review_id, uid),
        )
        await db.commit()
    return {"ok": True}


@router.delete("/reviews/{review_id}/like")
async def unlike_review(review_id: int, user: dict = Depends(verify_user)):
    uid = user["user_id"]
    async with _db_conn(cache.db_path, user_data=True) as db:
        await db.execute(
            "DELETE FROM review_likes WHERE review_id = ? AND user_id = ?",
            (review_id, uid),
        )
        await db.commit()
    return {"ok": True}


# ─── Şikayet (UGC moderasyonu) — store zorunluluğu ──────────────────────────

VALID_REPORT_TYPES = {"review", "list", "profile"}
VALID_REPORT_REASONS = {"spam", "hakaret", "spoiler", "uygunsuz", "diger"}


class ReportBody(BaseModel):
    content_type: str = Field(..., max_length=20)
    content_id: str = Field(..., max_length=60)
    reason: str = Field(default="diger", max_length=20)


@router.post("/reports", dependencies=[Depends(rate_limit_strict)])
async def create_report(body: ReportBody, user: dict = Depends(verify_user)):
    """Herkese açık bir içeriği şikayet et (Söz / liste / profil)."""
    if body.content_type not in VALID_REPORT_TYPES:
        raise HTTPException(400, f"content_type şunlardan biri olmalı: {sorted(VALID_REPORT_TYPES)}")
    reason = body.reason if body.reason in VALID_REPORT_REASONS else "diger"
    async with _db_conn(cache.db_path, user_data=True) as db:
        await db.execute(
            """INSERT INTO ugc_reports (content_type, content_id, reporter_id, reason)
               VALUES (?, ?, ?, ?)""",
            (body.content_type, body.content_id, user["user_id"], reason),
        )
        await db.commit()
    return {"ok": True, "message": "Şikayetin alındı, en kısa sürede incelenecek."}


# ─── Kullanıcı engelleme ─────────────────────────────────────────────────────


@router.post("/users/{user_id}/block", dependencies=[Depends(rate_limit_strict)])
async def block_user(user_id: int, user: dict = Depends(verify_user)):
    """Bir kullanıcıyı engelle — içeriği sana görünmez olur, arkadaşlık düşer."""
    me = user["user_id"]
    if user_id == me:
        raise HTTPException(400, "Kendini engelleyemezsin.")
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
        if not await cur.fetchone():
            raise HTTPException(404, "Kullanıcı bulunamadı.")
        await db.execute(
            "INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)",
            (me, user_id),
        )
        # Varsa arkadaşlığı / bekleyen istekleri kaldır
        await db.execute(
            """DELETE FROM friendships
               WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)""",
            (me, user_id, user_id, me),
        )
        await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}/block")
async def unblock_user(user_id: int, user: dict = Depends(verify_user)):
    async with _db_conn(cache.db_path, user_data=True) as db:
        await db.execute(
            "DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?",
            (user["user_id"], user_id),
        )
        await db.commit()
    return {"ok": True}


# ─── Kişi keşfi ──────────────────────────────────────────────────────────────


def _taste_vector(profile: dict) -> dict:
    """taste profile JSON'undan mood dağılımı vektörü çıkar."""
    import json as _json
    if isinstance(profile, str):
        try:
            profile = _json.loads(profile)
        except Exception:
            return {}
    if not isinstance(profile, dict):
        return {}
    dist = profile.get("mood_distribution") or {}
    if isinstance(dist, list):
        dist = {d.get("mood_id", d.get("id", "")): d.get("pct", d.get("value", 0)) for d in dist if isinstance(d, dict)}
    return {k: float(v) for k, v in dist.items() if isinstance(v, (int, float))}


def _cosine(a: dict, b: dict) -> float:
    keys = set(a) | set(b)
    if not keys:
        return 0.0
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    na = sum(v * v for v in a.values()) ** 0.5
    nb = sum(v * v for v in b.values()) ** 0.5
    if not na or not nb:
        return 0.0
    return dot / (na * nb)


@router.get("/community/similar-users")
async def similar_users(user: dict = Depends(verify_user)):
    """Zevk haritası bana en çok benzeyen kullanıcılar (arkadaşlar + engelliler hariç)."""
    me = user["user_id"]
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT profile_data FROM user_taste_profiles WHERE user_id = ?", (me,)
        )
        my_row = await cur.fetchone()
        if not my_row or not my_row[0]:
            return {"users": [], "reason": "no_profile"}
        my_vec = _taste_vector(my_row[0])
        if not my_vec:
            return {"users": [], "reason": "no_profile"}

        blocked = await _blocked_ids(db, me)
        cur = await db.execute(
            """SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END
               FROM friendships
               WHERE (user_id = ? OR friend_id = ?) AND status IN ('ACCEPTED','PENDING')""",
            (me, me, me),
        )
        friends = {r[0] for r in await cur.fetchall()}
        excluded = blocked | friends | {me}

        cur = await db.execute(
            """SELECT t.user_id, t.profile_data, u.username, u.name, u.picture
               FROM user_taste_profiles t JOIN users u ON u.id = t.user_id
               WHERE t.updated_at >= datetime('now','-30 days')
               ORDER BY t.updated_at DESC LIMIT 300"""
        )
        candidates = await cur.fetchall()

    results = []
    for uid, pdata, username, name, picture in candidates:
        if uid in excluded or not username:
            continue
        sim = _cosine(my_vec, _taste_vector(pdata))
        if sim <= 0.1:
            continue
        results.append({
            "id": uid, "username": username, "name": name or "",
            "avatar": picture or "", "match": round(sim * 100),
        })
    results.sort(key=lambda r: r["match"], reverse=True)
    return {"users": results[:10]}


@router.get("/community/top-recommenders")
async def top_recommenders(request: Request):
    """Son 30 günün en aktif film önericileri — herkese açık."""
    viewer_id = optional_user_id(request)
    async with _db_conn(cache.db_path, user_data=True) as db:
        blocked = await _blocked_ids(db, viewer_id)
        cur = await db.execute(
            """SELECT cr.user_id, u.username, u.name, u.picture, COUNT(*) AS rec_count
               FROM community_recommendations cr JOIN users u ON u.id = cr.user_id
               WHERE cr.created_at >= datetime('now','-30 days')
               GROUP BY cr.user_id ORDER BY rec_count DESC LIMIT 20"""
        )
        rows = await cur.fetchall()
    users = [
        {"id": r[0], "username": r[1] or "", "name": r[2] or "",
         "avatar": r[3] or "", "rec_count": r[4]}
        for r in rows if r[0] not in blocked and r[1]
    ]
    return {"users": users[:10]}


@router.get("/users/blocks")
async def list_blocks(user: dict = Depends(verify_user)):
    """Engellediğim kullanıcılar (ayarlar sayfası yönetimi için)."""
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            """SELECT u.id, u.username, u.name, u.picture
               FROM user_blocks b JOIN users u ON u.id = b.blocked_id
               WHERE b.blocker_id = ? ORDER BY b.created_at DESC""",
            (user["user_id"],),
        )
        rows = await cur.fetchall()
    return {"blocked": [
        {"id": r[0], "username": r[1] or "", "name": r[2] or "", "avatar": r[3] or ""}
        for r in rows
    ]}
