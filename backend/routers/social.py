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

logger = logging.getLogger("social")

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
    return {
        "id": uid,
        "username": info.get("username", "") if info else "",
        "name": info.get("name", "") if info else "",
        "email": info.get("email", "") if info else user.get("email", ""),
        "picture": info.get("picture", "") if info else "",
        "has_custom_username": not is_auto,
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
@router.post("/friends/request/{friend_username}")
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
@router.post("/movies/recommend")
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
    """Okunmamış paylaşımları film metadata'sıyla (başlık, afiş) kronolojik döndür."""
    shares = await cache.get_unread_shares(user["user_id"])
    movie_ids = list({s["movie_id"] for s in shares})
    meta = await cache.get_movies_meta_by_ids(movie_ids) if movie_ids else {}
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
    await cache.update_user_avatar_data(uid, raw)

    # URL: /api/users/{id}/avatar endpoint'i üzerinden servis edilir.
    # Sürüm parametresi (?v=ts) immutable cache'i kırar → yeni foto anında görünür.
    picture_url = f"/api/users/{uid}/avatar?v={int(time.time())}"
    await cache.update_user_picture(uid, picture_url)

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
            pass

    # Recent watched (last 4)
    recent_watched = watched[:4]

    # Taste map
    taste_map = None
    try:
        cached_profile = await cache.get_taste_profile(uid)
        if cached_profile and cached_profile.get("profile_data"):
            taste_map = cached_profile["profile_data"]
    except Exception:
        pass

    # Avatar URL — saklı picture'ı (sürümlü /api/.../avatar?v= veya Google URL) doğrudan kullan
    avatar_url = user_info.get("picture") or ""

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
