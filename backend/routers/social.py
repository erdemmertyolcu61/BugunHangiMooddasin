"""
Sosyal Ağ Router — "Arkadaşıma Öner" (Direct Film Sharing) + Kullanıcı Yönetimi.

Bu modül main.py'ye `app.include_router(social_router)` ile bağlanır.
Circular import yoktur: yalnızca backend.config (JWT_SECRET) ve backend.database (cache)
import edilir; bunlar router'ı import etmez.

Tüm rotalar JWT tabanlı `get_current_user` bağımlılığından geçer (type == "user").
Beta/admin token'ları bu rotaları kullanamaz — sosyal özellik Google girişi gerektirir.
"""
import base64
import logging
import os
import re
import time
import uuid
from typing import Optional

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.config import JWT_SECRET
from backend.database import cache
from backend.services.rate_limit import rate_limit_strict

logger = logging.getLogger("social")


async def _fill_missing_posters(meta: dict, movie_ids: list) -> None:
    """DB'de bulunamayan filmler için TMDB'den poster çek (lazy fallback)."""
    missing = [mid for mid in movie_ids if mid not in meta or not meta.get(mid, {}).get("poster_url")]
    if not missing:
        return
    try:
        from backend.services.tmdb_service import tmdb_service
        for mid in missing:
            try:
                details = await tmdb_service.get_movie_details(mid)
                if details:
                    meta[mid] = {
                        "title": details.get("title"),
                        "poster_url": details.get("poster_url"),
                        "vote_average": details.get("vote_average"),
                        "release_date": details.get("release_date"),
                    }
            except Exception:
                logger.debug("[social] TMDB fallback failed for movie_id=%s", mid)
    except ImportError:
        logger.warning("[social] tmdb_service import failed for poster fallback")

router = APIRouter(prefix="/api", tags=["social"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]{3,20}$")


# ─── Auth bağımlılığı (dependency injection) ─────────────────────────────────
async def get_current_user(request: Request) -> dict:
    """JWT'yi çöz, type == 'user' doğrula, payload döndür. Aksi halde 401."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Giriş gerekli")
    token = auth[7:].strip()
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Oturum süresi doldu")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    if payload.get("type") != "user" or not payload.get("user_id"):
        raise HTTPException(status_code=401, detail="Bu işlem için Google ile giriş yapmalısın")
    return payload


# ─── Request body modelleri ──────────────────────────────────────────────────
class UsernameBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)


class RespondBody(BaseModel):
    action: str = Field(..., description="ACCEPT veya DECLINE")


class RecommendBody(BaseModel):
    receiver_id: int
    movie_id: int
    user_note: Optional[str] = Field(default="", max_length=250)


# ─── Kullanıcı bilgisi / username kurulumu ──────────────────────────────────
@router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    """JWT'deki kullanıcının public profil bilgisi + has_custom_username flag'i."""
    uid = user["user_id"]
    is_auto = await cache.is_auto_username(uid)
    info = await cache.get_user_by_username_by_id(uid)
    picture = (info or {}).get("picture", "") or ""

    # avatar_data varsa ama picture Google URL'i ise → internal URL'e çevir
    avatar_data = await cache.get_user_avatar_data(uid)
    if avatar_data and picture.startswith("https://lh3"):
        picture = f"/api/users/{uid}/avatar?v={int(time.time())}"
        await cache.update_user_picture(uid, picture)

    hide_activity = await cache.get_hide_activity(uid)

    return {
        "id": uid,
        "username": info.get("username", "") if info else "",
        "name": info.get("name", "") if info else "",
        "email": info.get("email", "") if info else user.get("email", ""),
        "picture": picture,
        "has_custom_username": not is_auto,
        "hide_activity": hide_activity,
    }


@router.put("/users/set-username")
async def set_username(body: UsernameBody, user: dict = Depends(get_current_user)):
    """Kullanıcı adını doğrulayıp güncelle. Türkçe + büyük harf destekli."""
    un = body.username.strip()
    if not USERNAME_RE.match(un):
        raise HTTPException(
            status_code=400,
            detail="Kullanıcı adı 3-20 karakter, harf (Türkçe dahil), rakam ve alt çizgi içerebilir.",
        )
    ok = await cache.set_custom_username(user["user_id"], un)
    if not ok:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış.")
    return {"ok": True, "username": un}


# ─── Arkadaşlık rotaları ─────────────────────────────────────────────────────
@router.post("/friends/request/{friend_username}", dependencies=[Depends(rate_limit_strict)])
async def send_friend_request(friend_username: str, user: dict = Depends(get_current_user)):
    """Kullanıcı adına göre PENDING arkadaşlık isteği gönder."""
    me = user["user_id"]
    target = await cache.get_user_by_username(friend_username)
    if not target:
        raise HTTPException(status_code=404, detail="Böyle bir kullanıcı bulunamadı")
    if target["id"] == me:
        raise HTTPException(status_code=400, detail="Kendini arkadaş ekleyemezsin")
    result = await cache.create_friend_request(me, target["id"])
    # Push: hedefe yeni arkadaşlık isteği bildirimi (no-op if push disabled)
    try:
        from backend.services.push_service import send_push_to_user
        sender = await cache.get_user_by_username_by_id(me)
        sender_name = (sender or {}).get("username") or (sender or {}).get("name") or "Biri"
        await send_push_to_user(
            target["id"],
            "Sinemood",
            f"{sender_name} seni arkadaş eklemek istiyor 🤝",
            url="/profil?tab=social", tag="friend-request",
        )
    except Exception:
        pass
    return {
        "ok": True,
        "target": {"id": target["id"], "username": target["username"],
                   "name": target["name"], "avatar": target["picture"]},
        **result,
    }


@router.post("/friends/respond/{request_id}")
async def respond_friend_request(request_id: int, body: RespondBody,
                                 user: dict = Depends(get_current_user)):
    """Gelen isteği ACCEPT veya DECLINE et (yalnızca alıcı yanıtlayabilir)."""
    action = (body.action or "").strip().upper()
    if action not in ("ACCEPT", "DECLINE"):
        raise HTTPException(status_code=400, detail="action 'ACCEPT' veya 'DECLINE' olmalı")
    ok = await cache.respond_friend_request(request_id, user["user_id"], action)
    if not ok:
        raise HTTPException(status_code=404, detail="İstek bulunamadı ya da yetkin yok")
    return {"ok": True, "status": "ACCEPTED" if action == "ACCEPT" else "DECLINED"}


@router.get("/friends/list")
async def list_friends(user: dict = Depends(get_current_user)):
    """ACCEPTED arkadaşların id/username/name/avatar dizisi."""
    return {"friends": await cache.get_friends(user["user_id"])}


@router.get("/friends/requests")
async def incoming_requests(user: dict = Depends(get_current_user)):
    """Bana gelen bekleyen (PENDING) arkadaşlık istekleri."""
    return {"requests": await cache.get_incoming_requests(user["user_id"])}


@router.delete("/friends/{friend_id}")
async def remove_friend(friend_id: int, user: dict = Depends(get_current_user)):
    """Aktif arkadaşlığı kaldır."""
    ok = await cache.remove_friend(user["user_id"], friend_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Arkadaşlık bulunamadı")
    return {"ok": True}


# ─── Doğrudan film paylaşımı ─────────────────────────────────────────────────
@router.post("/movies/recommend", dependencies=[Depends(rate_limit_strict)])
async def recommend_movie(body: RecommendBody, user: dict = Depends(get_current_user)):
    """
    Bir arkadaşına film öner (not ekiyle).
    Güvenlik: aktif ACCEPTED arkadaşlık yoksa 403 Forbidden.
    """
    me = user["user_id"]
    if body.receiver_id == me:
        raise HTTPException(status_code=400, detail="Kendine film öneremezsin")
    if not await cache.are_friends(me, body.receiver_id):
        raise HTTPException(status_code=403, detail="Sadece arkadaşlarına film önerebilirsin")
    await cache.create_direct_recommendation(me, body.receiver_id, body.movie_id, body.user_note or "")
    # Push: alıcıya yeni film önerisi bildirimi (no-op if push disabled)
    try:
        from backend.services.push_service import send_push_to_user
        sender = await cache.get_user_by_username_by_id(me)
        sender_name = (sender or {}).get("username") or (sender or {}).get("name") or "Bir arkadaşın"
        await send_push_to_user(
            body.receiver_id,
            "Sinemood",
            f"{sender_name} sana bir film gönderdi 🎬 Üstad seni bekliyor.",
            url="/profil?tab=social", tag="movie-rec",
        )
    except Exception:
        pass
    return {"ok": True, "message": "Öneri Üstadın Güverciniyle gönderildi! ✨"}


@router.get("/notifications/shares")
async def get_shares(user: dict = Depends(get_current_user)):
    """Sadece okunmamış paylaşımları film metadata'sıyla (başlık, afiş) kronolojik döndür."""
    shares = await cache.get_unread_shares(user["user_id"])
    movie_ids = list({s["movie_id"] for s in shares})
    meta = await cache.get_movies_meta_by_ids(movie_ids) if movie_ids else {}
    await _fill_missing_posters(meta, movie_ids)
    for s in shares:
        m = meta.get(s["movie_id"], {})
        s["movie_title"] = m.get("title")
        s["poster_url"] = m.get("poster_url")
        s["vote_average"] = m.get("vote_average")
        s["release_date"] = m.get("release_date")
    return {"shares": shares, "unread_count": len(shares)}


@router.delete("/movies/recommend/{rec_id}")
async def retract_recommendation(rec_id: int, user: dict = Depends(get_current_user)):
    """Gönderdiğim film önerisini geri al."""
    ok = await cache.delete_sent_recommendation(rec_id, user["user_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Öneri bulunamadı veya sana ait değil.")
    return {"ok": True}


@router.get("/notifications/recommendations")
async def get_recommendation_history(user: dict = Depends(get_current_user)):
    """Profil için kalıcı öneri geçmişi: gelen (okunsa da kaybolmaz) + gönderilen."""
    uid = user["user_id"]
    received = await cache.get_received_recommendations(uid)
    sent = await cache.get_sent_recommendations(uid)
    movie_ids = list({s["movie_id"] for s in (received + sent)})
    meta = await cache.get_movies_meta_by_ids(movie_ids) if movie_ids else {}
    await _fill_missing_posters(meta, movie_ids)
    for s in (received + sent):
        m = meta.get(s["movie_id"], {})
        s["movie_title"] = m.get("title")
        s["poster_url"] = m.get("poster_url")
        s["vote_average"] = m.get("vote_average")
        s["release_date"] = m.get("release_date")
    return {"received": received, "sent": sent}


@router.get("/notifications/count")
async def unread_count(user: dict = Depends(get_current_user)):
    """Zil rozetini beslemek için toplam bildirim sayısı (film önerileri + arkadaşlık istekleri)."""
    uid = user["user_id"]
    share_count = await cache.count_unread_shares(uid)
    request_count = await cache.count_pending_requests(uid)
    return {
        "unread_count": share_count + request_count,
        "shares": share_count,
        "requests": request_count,
    }


@router.post("/notifications/shares/read")
async def mark_shares_read(user: dict = Depends(get_current_user)):
    """Tüm paylaşımları okundu olarak işaretle (rozeti sıfırlar)."""
    await cache.mark_shares_read(user["user_id"])
    return {"ok": True}


@router.post("/notifications/shares/{share_id}/read")
async def mark_share_read(share_id: int, user: dict = Depends(get_current_user)):
    """Tek bir paylaşımı okundu işaretle."""
    await cache.mark_shares_read(user["user_id"], share_ids=[share_id])
    return {"ok": True}


@router.post("/notifications/shares/{share_id}/dismiss")
async def dismiss_share(share_id: int, user: dict = Depends(get_current_user)):
    """Bir öneriyi kalıcı gizle ('Okundu' butonu) — panelde bir daha görünmez."""
    await cache.dismiss_recommendation(user["user_id"], share_id)
    return {"ok": True}


# ─── Profil Düzenleme ────────────────────────────────────────────────────────

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads", "avatars")
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2MB


@router.put("/users/profile")
async def update_profile(request: Request, user: dict = Depends(get_current_user)):
    """Profil bilgilerini güncelle: name ve/veya username."""
    body = await request.json()
    uid = user["user_id"]

    # Username değiştir
    if body.get("username"):
        un = body["username"].strip()
        if not USERNAME_RE.match(un):
            raise HTTPException(400, "Geçersiz kullanıcı adı. 3-20 karakter, harf (Türkçe dahil), rakam ve _ kullanın.")
        ok = await cache.set_custom_username(uid, un)
        if not ok:
            raise HTTPException(400, "Bu kullanıcı adı zaten alınmış.")

    # Name değiştir
    if body.get("name"):
        name = body["name"].strip()[:50]
        await cache.update_user_name(uid, name)

    return {"ok": True}


@router.post("/users/avatar")
async def upload_avatar(request: Request, user: dict = Depends(get_current_user)):
    """
    Avatar yükle — base64 encoded resim.
    Max 2MB, JPEG/PNG/WebP kabul edilir.
    Binary veri SQLite'a BLOB olarak kaydedilir (filesystem gerekmez, Render restart'ta kaybolmaz).
    """
    body = await request.json()
    image_data = body.get("image", "")

    if not image_data:
        raise HTTPException(400, "Resim verisi bulunamadı.")

    # data:image/... prefix'ini kaldır
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    try:
        raw = base64.b64decode(image_data)
    except Exception:
        raise HTTPException(400, "Geçersiz base64 formatı.")

    if len(raw) > MAX_AVATAR_BYTES:
        raise HTTPException(400, "Resim boyutu 2MB'ı aşamaz.")

    # Dosya tipi kontrolü (magic bytes)
    if raw[:2] == b'\xff\xd8':
        pass  # JPEG
    elif raw[:8] == b'\x89PNG\r\n\x1a\n':
        pass  # PNG
    elif raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
        pass  # WebP
    else:
        raise HTTPException(400, "Sadece JPEG, PNG ve WebP formatları kabul edilir.")

    uid = user["user_id"]

    # BLOB olarak DB'ye kaydet (filesystem kullanma)
    ok = await cache.update_user_avatar_data(uid, raw)
    if not ok:
        logger.error(f"[Avatar] avatar_data UPDATE failed for uid={uid} — kolon Turso'da eksik")
        raise HTTPException(500, "Avatar verisi yazılamadı (sistem yapılandırma hatası, yöneticiye başvurun)")

    # URL: /api/users/{id}/avatar endpoint'i üzerinden servis edilir.
    # Sürüm parametresi (?v=ts) immutable cache'i kırar → yeni foto anında görünür.
    picture_url = f"/api/users/{uid}/avatar?v={int(time.time())}"
    await cache.update_user_picture(uid, picture_url)

    # Readback: avatar_data'nın yazıldığını doğrula (sadece uyarı, veri yazıldı)
    verify = await cache.get_user_avatar_data(uid)
    if not verify:
        logger.warning(f"[Avatar] avatar_data readback failed for uid={uid}")

    return {"ok": True, "picture": picture_url}


@router.get("/users/public/{username}")
async def get_public_profile(username: str):
    """
    Herkese açık profil — kimlik doğrulama gerekmez.
    Kullanıcının adı, avatarı, istatistikleri, taste map'i ve son izledikleri döner.
    """
    user_info = await cache.get_user_by_username(username)
    if not user_info:
        raise HTTPException(404, "Kullanıcı bulunamadı.")

    uid = user_info["id"]

    # Watchlist stats
    try:
        watchlist = await cache.get_watchlist(uid)
    except Exception:
        logger.warning("[Profile] get_watchlist failed for uid=%d", uid)
        watchlist = []

    watched = [m for m in watchlist if m.get("watched")]
    saved_count = len(watchlist)
    watched_count = len(watched)

    # This month count
    from datetime import datetime
    now = datetime.now()
    this_month_count = 0
    for m in watchlist:
        try:
            d = datetime.fromisoformat(str(m.get("added_at", "")).replace(" ", "T"))
            if d.month == now.month and d.year == now.year:
                this_month_count += 1
        except Exception:
            logger.warning("[Profile] invalid added_at for watchlist item, skipping")

    # Recent watched (last 4)
    recent_watched = watched[:4]

    # Taste map
    taste_map = None
    try:
        cached_profile = await cache.get_taste_profile(uid)
        if cached_profile and cached_profile.get("profile_data"):
            taste_map = cached_profile["profile_data"]
    except Exception:
        logger.warning("[Profile] get_taste_profile failed for uid=%d", uid)

    # Avatar URL — saklı picture'ı (sürümlü /api/.../avatar?v= veya Google URL) doğrudan kullan
    avatar_url = user_info.get("picture") or ""

    # Topluluk önerileri: kullanıcının önerdiği filmler (poster + title)
    community_recs = []
    try:
        from backend.database import _get_connection as _db_conn
        async with _db_conn(cache.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT tmdb_id FROM community_recommendations
                   WHERE user_id = ? GROUP BY tmdb_id
                   ORDER BY MAX(created_at) DESC LIMIT 8""",
                (uid,),
            )
            rec_ids = [r[0] for r in await cur.fetchall()]
        if rec_ids:
            meta = await cache.get_movies_meta_by_ids(rec_ids)
            await _fill_missing_posters(meta, rec_ids)
            for tid in rec_ids:
                m = meta.get(tid)
                if m and m.get("poster_url"):
                    community_recs.append({
                        "tmdb_id": tid,
                        "title": m.get("title", ""),
                        "poster_url": m["poster_url"],
                        "vote_average": m.get("vote_average"),
                    })
    except Exception:
        logger.warning("[PublicProfile] community_recs failed for uid=%d", uid)

    # Top moods: taste map'ten çıkar
    top_moods = []
    if taste_map and isinstance(taste_map, dict):
        top_moods = taste_map.get("top_moods", [])

    # Herkese açık Sözler (son 3) + toplam sayı
    review_count = 0
    recent_reviews = []
    try:
        from backend.database import _get_connection as _db_conn_r
        async with _db_conn_r(cache.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT COUNT(*) FROM movie_reviews WHERE user_id = ? AND status = 'visible'",
                (uid,),
            )
            row = await cur.fetchone()
            review_count = row[0] if row else 0
            cur = await db.execute(
                """SELECT tmdb_id, content, created_at FROM movie_reviews
                   WHERE user_id = ? AND status = 'visible'
                   ORDER BY created_at DESC LIMIT 3""",
                (uid,),
            )
            rev_rows = await cur.fetchall()
        rev_ids = [r[0] for r in rev_rows]
        rev_meta = await cache.get_movies_meta_by_ids(rev_ids) if rev_ids else {}
        for r in rev_rows:
            m = rev_meta.get(r[0], {})
            recent_reviews.append({
                "tmdb_id": r[0],
                "content": r[1],
                "created_at": str(r[2] or ""),
                "movie_title": m.get("title", ""),
                "poster_url": m.get("poster_url", ""),
            })
    except Exception:
        logger.warning("[PublicProfile] reviews failed for uid=%d", uid)

    return {
        "id": uid,
        "username": user_info.get("username", ""),
        "name": user_info.get("name", ""),
        "picture": avatar_url,
        "created_at": None,  # Not exposed publicly
        "watched_count": watched_count,
        "saved_count": saved_count,
        "this_month_count": this_month_count,
        "recent_watched": recent_watched,
        "taste_map": taste_map,
        "community_recs": community_recs,
        "top_moods": top_moods,
        "review_count": review_count,
        "recent_reviews": recent_reviews,
    }


@router.get("/users/{user_id}/avatar")
async def get_user_avatar(user_id: int):
    """
    Kullanıcı avatar'ını DB'den okuyup image olarak döndür.
    Kimlik doğrulama gerekmez — herkese açık (sadece binary veri, kişisel veri yok).
    """
    try:
        data = await cache.get_user_avatar_data(user_id)
    except Exception:
        logging.getLogger("social").exception("avatar read failed user_id=%s", user_id)
        data = None
    if not data:
        # 500 yerine 404: frontend <img> onError ile baş harfe düşer
        raise HTTPException(404, "Avatar bulunamadı.")

    # Magic bytes'a göre content-type belirle
    if data[:4] == b'RIFF' and len(data) > 12 and data[8:12] == b'WEBP':
        content_type = "image/webp"
    elif data[:2] == b'\xff\xd8':
        content_type = "image/jpeg"
    else:
        content_type = "image/png"

    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


# ─── Arkadaş Aktivite Akışı ─────────────────────────────────────────────────

@router.get("/activity/friends")
async def friends_activity(user: dict = Depends(get_current_user)):
    """Arkadaşların son 14 günde eklediği/izlediği filmler."""
    uid = user["user_id"]
    activities = await cache.get_friends_activity(uid, limit=20)
    return {"activities": activities}


class ActivityVisibilityBody(BaseModel):
    hide_activity: bool = False


@router.patch("/user/activity-visibility")
async def set_activity_visibility(body: ActivityVisibilityBody, user: dict = Depends(get_current_user)):
    """Kullanıcının aktivitesini arkadaşlarından gizle/göster."""
    uid = user["user_id"]
    await cache.set_hide_activity(uid, body.hide_activity)
    return {"ok": True, "hide_activity": body.hide_activity}


@router.get("/friends/{user_id}/profile")
async def get_friend_profile(user_id: int, current_user: dict = Depends(get_current_user)):
    """Arkadaşın detaylı profili (auth + arkadaş kontrolü)."""
    me = current_user["user_id"]

    if not await cache.are_friends(me, user_id):
        raise HTTPException(403, "Bu kullanıcı arkadaşın değil")

    friend_info = await cache.get_user_by_username_by_id(user_id)
    if not friend_info:
        raise HTTPException(404, "Kullanıcı bulunamadı")

    # Katılma tarihi — users tablosundan doğrudan çek
    created_at = None
    try:
        from backend.database import _get_connection as _db_conn_inner
        async with _db_conn_inner(cache.db_path, user_data=True) as db:
            cur = await db.execute("SELECT created_at FROM users WHERE id = ?", (user_id,))
            row = await cur.fetchone()
            if row and row[0]:
                created_at = str(row[0])
    except Exception:
        pass

    # Aktivite gizliyse sadece temel bilgileri dön (watchlist, taste map, community recs gizlenir)
    try:
        if await cache.get_hide_activity(user_id):
            return {
                "id": user_id,
                "username": friend_info.get("username", ""),
                "name": friend_info.get("name", ""),
                "picture": friend_info.get("picture") or "",
                "created_at": created_at,
                "profile_hidden": True,
                "watched_count": 0,
                "saved_count": 0,
                "this_month_count": 0,
                "watchlist_preview": [],
                "taste_map": None,
                "community_recs": [],
                "activity": [],
                "top_moods": [],
            }
    except Exception:
        pass

    # Watchlist + istatistikler
    try:
        watchlist = await cache.get_watchlist(user_id)
    except Exception:
        logger.warning("[FriendProfile] get_watchlist failed for uid=%d", user_id)
        watchlist = []

    watched = [m for m in watchlist if m.get("watched")]
    watchlist_preview = watchlist[:10]

    # Bu ay sayısı
    from datetime import datetime
    now = datetime.now()
    this_month_count = 0
    for m in watchlist:
        try:
            d = datetime.fromisoformat(str(m.get("added_at", "")).replace(" ", "T"))
            if d.month == now.month and d.year == now.year:
                this_month_count += 1
        except Exception:
            pass

    # Taste map
    taste_map = None
    try:
        cached_profile = await cache.get_taste_profile(user_id)
        if cached_profile and cached_profile.get("profile_data"):
            taste_map = cached_profile["profile_data"]
    except Exception:
        logger.warning("[FriendProfile] get_taste_profile failed for uid=%d", user_id)

    # Top moods
    top_moods = []
    if taste_map and isinstance(taste_map, dict):
        top_moods = taste_map.get("top_moods", [])

    # Son aktivite (hide_activity=0 ise)
    activity = []
    try:
        if not await cache.get_hide_activity(user_id):
            activity = await cache.get_user_activity(user_id, limit=15)
    except Exception:
        logger.warning("[FriendProfile] get_user_activity failed for uid=%d", user_id)

    # Topluluk önerileri (son 4)
    community_recs = []
    try:
        from backend.database import _get_connection as _db_conn
        async with _db_conn(cache.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT tmdb_id FROM community_recommendations
                   WHERE user_id = ? GROUP BY tmdb_id
                   ORDER BY MAX(created_at) DESC LIMIT 4""",
                (user_id,),
            )
            rec_ids = [r[0] for r in await cur.fetchall()]
        if rec_ids:
            meta = await cache.get_movies_meta_by_ids(rec_ids)
            await _fill_missing_posters(meta, rec_ids)
            for tid in rec_ids:
                m = meta.get(tid)
                if m and m.get("poster_url"):
                    community_recs.append({
                        "tmdb_id": tid,
                        "title": m.get("title", ""),
                        "poster_url": m["poster_url"],
                        "vote_average": m.get("vote_average"),
                    })
    except Exception:
        logger.warning("[FriendProfile] community_recs failed for uid=%d", user_id)

    return {
        "id": user_id,
        "username": friend_info.get("username", ""),
        "name": friend_info.get("name", ""),
        "picture": friend_info.get("picture") or "",
        "created_at": created_at,
        "watched_count": len(watched),
        "saved_count": len(watchlist),
        "this_month_count": this_month_count,
        "watchlist_preview": watchlist_preview,
        "taste_map": taste_map,
        "community_recs": community_recs,
        "activity": activity,
        "top_moods": top_moods,
    }


# ─── Mood Paylaşımı ─────────────────────────────────────────

class MoodShareBody(BaseModel):
    mood_id: str = Field(..., max_length=30)

@router.post("/mood/share", dependencies=[Depends(rate_limit_strict)])
async def share_mood(body: MoodShareBody, user: dict = Depends(get_current_user)):
    """Kullanıcının güncel mood'unu kaydet."""
    await cache.save_user_mood(user["user_id"], body.mood_id)
    return {"ok": True, "mood_id": body.mood_id}

@router.get("/mood/friends")
async def get_friends_moods(user: dict = Depends(get_current_user)):
    """Arkadaşların son 24 saatteki mood seçimleri."""
    moods = await cache.get_friends_moods(user["user_id"])
    return {"moods": moods}


# ─── Öneri Reaksiyonları ─────────────────────────────────────

VALID_REACTIONS = {"izlerim", "pas", "izledim", "bu-aksam-degil"}

class ReactionBody(BaseModel):
    reaction: str = Field(..., max_length=20)

@router.post("/movies/recommend/{rec_id}/reaction")
async def react_to_recommendation(rec_id: int, body: ReactionBody,
                                   user: dict = Depends(get_current_user)):
    """Alınan bir öneriye reaksiyon koy."""
    if body.reaction not in VALID_REACTIONS:
        raise HTTPException(400, f"Geçersiz reaksiyon. Seçenekler: {VALID_REACTIONS}")
    ok = await cache.set_recommendation_reaction(rec_id, user["user_id"], body.reaction)
    if not ok:
        raise HTTPException(404, "Öneri bulunamadı veya sana ait değil")
    return {"ok": True, "reaction": body.reaction}


# ─── Hesap Silme (store zorunluluğu: Apple hesap silme ister) ───────────────

@router.delete("/auth/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Hesabı ve TÜM kullanıcı verilerini kalıcı olarak sil (KVKK + App Store şartı)."""
    uid = user["user_id"]
    from backend.database import _get_connection as _db_conn
    async with _db_conn(cache.db_path, user_data=True) as db:
        # Kullanıcının listelerine bağlı öğeler
        try:
            cur = await db.execute("SELECT id FROM user_lists WHERE user_id = ?", (uid,))
            list_ids = [r[0] for r in await cur.fetchall()]
            for lid in list_ids:
                await db.execute("DELETE FROM list_items WHERE list_id = ?", (lid,))
        except Exception:
            pass
        # Söz beğenileri (kendi beğendikleri + Sözlerine gelenler)
        try:
            await db.execute("DELETE FROM review_likes WHERE user_id = ?", (uid,))
            await db.execute(
                "DELETE FROM review_likes WHERE review_id IN "
                "(SELECT id FROM movie_reviews WHERE user_id = ?)", (uid,))
        except Exception:
            pass
        for table, col in (
            ("movie_reviews", "user_id"),
            ("ugc_reports", "reporter_id"),
            ("watchlist", "user_id"),
            ("movie_notes", "user_id"),
            ("future_plans", "user_id"),
            ("movie_ratings", "user_id"),
            ("user_lists", "user_id"),
            ("community_recommendations", "user_id"),
            ("user_taste_profiles", "user_id"),
            ("push_subscriptions", "user_id"),
            ("user_moods", "user_id"),
        ):
            try:
                await db.execute(f"DELETE FROM {table} WHERE {col} = ?", (uid,))
            except Exception:
                logger.warning("[AccountDelete] %s silinemedi (uid=%d)", table, uid)
        # Çift kolonlu ilişki tabloları
        for stmt in (
            "DELETE FROM friendships WHERE user_id = ? OR friend_id = ?",
            "DELETE FROM direct_recommendations WHERE sender_id = ? OR receiver_id = ?",
            "DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?",
            "DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?",
        ):
            try:
                await db.execute(stmt, (uid, uid))
            except Exception:
                logger.warning("[AccountDelete] ilişki tablosu silinemedi (uid=%d)", uid)
        await db.execute("DELETE FROM users WHERE id = ?", (uid,))
        await db.commit()
    logger.info("[AccountDelete] uid=%d hesabı ve tüm verileri silindi", uid)
    return {"ok": True, "message": "Hesabın ve tüm verilerin kalıcı olarak silindi."}


# ─── Sosyal Akış (Feed) ─────────────────────────────────────

@router.get("/feed")
async def social_feed(user: dict = Depends(get_current_user)):
    """Birleşik sosyal akış: arkadaş mood'ları + aktivite + öneriler."""
    uid = user["user_id"]
    moods = await cache.get_friends_moods(uid)
    activities = await cache.get_friends_activity(uid, limit=15)
    received = await cache.get_received_recommendations(uid, limit=5)
    # Öneri meta verisini doldur
    movie_ids = [r["movie_id"] for r in received]
    meta = {}
    if movie_ids:
        meta = await cache.get_movies_meta_by_ids(movie_ids)
        await _fill_missing_posters(meta, movie_ids)
    for r in received:
        m = meta.get(r["movie_id"], {})
        r["movie_title"] = m.get("title", "")
        r["poster_url"] = m.get("poster_url", "")
        r["vote_average"] = m.get("vote_average")
    return {
        "friend_moods": moods,
        "activities": activities,
        "recommendations": received,
    }
