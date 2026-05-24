"""
Sosyal Ağ Router — "Arkadaşıma Öner" (Direct Film Sharing) + Kullanıcı Yönetimi.

Bu modül main.py'ye `app.include_router(social_router)` ile bağlanır.
Circular import yoktur: yalnızca backend.config (JWT_SECRET) ve backend.database (cache)
import edilir; bunlar router'ı import etmez.

Tüm rotalar JWT tabanlı `get_current_user` bağımlılığından geçer (type == "user").
Beta/admin token'ları bu rotaları kullanamaz — sosyal özellik Google girişi gerektirir.
"""
import logging
import re
from typing import Optional

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.config import JWT_SECRET
from backend.database import cache

logger = logging.getLogger("social")

router = APIRouter(prefix="/api", tags=["social"])

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,15}$")


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
    username: str = Field(..., min_length=3, max_length=15)


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
    """Kullanıcı adını doğrulayıp güncelle. Regex: ^[a-z0-9_]{3,15}$."""
    un = body.username.strip().lower()
    if not USERNAME_RE.match(un):
        raise HTTPException(
            status_code=400,
            detail="Kullanıcı adı 3-15 karakter, sadece küçük harf, rakam ve alt çizgi içerebilir.",
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


@router.get("/notifications/count")
async def unread_count(user: dict = Depends(get_current_user)):
    """Zil rozetini beslemek için okunmamış paylaşım sayısı."""
    return {"unread_count": await cache.count_unread_shares(user["user_id"])}


@router.post("/notifications/shares/read")
async def mark_shares_read(user: dict = Depends(get_current_user)):
    """Tüm paylaşımları okundu olarak işaretle (rozeti sıfırlar)."""
    await cache.mark_shares_read(user["user_id"])
    return {"ok": True}
