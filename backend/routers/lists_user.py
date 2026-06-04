"""
Kullanıcı İçeriği Router — Film puanı (1-10 + beğeni) ve Özel Listeler.

main.py'ye `app.include_router(user_content_router)` ile bağlanır.
Tüm rotalar `get_current_user` (JWT, type=='user') gerektirir — giriş zorunlu.
Editöryel `/api/lists` (Oscar/Cannes) DOKUNULMAZ; bunlar ayrı `/api/custom-lists`.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from backend.database import cache
from backend.routers.social import get_current_user
from backend.services.rate_limit import rate_limit_general

logger = logging.getLogger("user_content")

router = APIRouter(prefix="/api", tags=["user-content"], dependencies=[Depends(rate_limit_general)])


# ─── Request modelleri ───────────────────────────────────────────────────────
class RatingBody(BaseModel):
    reaction: Optional[str] = Field(default=None)  # 'like' | 'dislike' | None


class ListCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    emoji: Optional[str] = Field(default=None, max_length=8)


class ListItemBody(BaseModel):
    tmdb_id: int = Field(..., ge=1)
    title: Optional[str] = Field(default=None, max_length=300)
    poster_url: Optional[str] = Field(default=None, max_length=500)


def _clean_reaction(reaction: Optional[str]) -> Optional[str]:
    return reaction if reaction in ("like", "dislike") else None


# ─── Film beğeni (like/dislike) ─────────────────────────────────────────────
@router.get("/movies/{movie_id}/rating")
async def get_movie_rating(movie_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    return await cache.get_rating(movie_id, user["user_id"])


@router.post("/movies/{movie_id}/rating")
async def save_movie_rating(body: RatingBody, movie_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    await cache.save_rating(movie_id, None, _clean_reaction(body.reaction), uid)
    try:
        await cache.invalidate_taste_profile(uid)
    except Exception:
        pass
    return {"status": "success", "reaction": _clean_reaction(body.reaction)}


# ─── Özel listeler ───────────────────────────────────────────────────────────
@router.get("/custom-lists")
async def list_custom_lists(user: dict = Depends(get_current_user)):
    return {"lists": await cache.get_lists(user["user_id"])}


@router.post("/custom-lists")
async def create_custom_list(body: ListCreateBody, user: dict = Depends(get_current_user)):
    list_id = await cache.create_list(user["user_id"], body.name.strip(), body.emoji)
    if not list_id:
        raise HTTPException(status_code=500, detail="Liste oluşturulamadı")
    return {"id": list_id, "name": body.name.strip(), "emoji": body.emoji, "count": 0, "covers": []}


@router.patch("/custom-lists/{list_id}")
async def rename_custom_list(body: ListCreateBody, list_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    ok = await cache.rename_list(list_id, user["user_id"], body.name.strip(), body.emoji)
    if not ok:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    return {"status": "success"}


@router.delete("/custom-lists/{list_id}")
async def delete_custom_list(list_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    ok = await cache.delete_list(list_id, user["user_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    return {"status": "success"}


@router.get("/custom-lists/{list_id}")
async def get_custom_list(list_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    data = await cache.get_list_items(list_id, user["user_id"])
    if data is None:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    return data


@router.post("/custom-lists/{list_id}/items")
async def add_item_to_list(body: ListItemBody, list_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    ok = await cache.add_to_list(list_id, user["user_id"], body.tmdb_id, body.title or "", body.poster_url)
    if not ok:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    return {"status": "success"}


@router.delete("/custom-lists/{list_id}/items/{tmdb_id}")
async def remove_item_from_list(list_id: int = Path(..., ge=1), tmdb_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    ok = await cache.remove_from_list(list_id, user["user_id"], tmdb_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    return {"status": "success"}
