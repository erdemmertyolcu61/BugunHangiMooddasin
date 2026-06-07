"""Web Push VAPID bildirim router'ı — main.py'den çıkarıldı."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.auth_utils import verify_user
from backend.config import VAPID_PUBLIC_KEY
from backend.database import cache
from backend.services.push_service import PUSH_ENABLED
from backend.services.rate_limit import rate_limit_strict, rate_limit_general

logger = logging.getLogger("film_elestirimeni")
router = APIRouter(prefix="/api", tags=["push"])


class PushSubscribeBody(BaseModel):
    endpoint: str
    keys: dict
    is_pwa: bool = False


class PushUnsubscribeBody(BaseModel):
    endpoint: str


class NotifyTimeBody(BaseModel):
    hour: int


@router.get("/push/public-key")
async def push_public_key():
    return {"enabled": PUSH_ENABLED, "public_key": VAPID_PUBLIC_KEY if PUSH_ENABLED else ""}


@router.post("/push/subscribe", dependencies=[Depends(rate_limit_strict)])
async def push_subscribe(body: PushSubscribeBody, user=Depends(verify_user)):
    if not PUSH_ENABLED:
        return {"ok": False, "enabled": False}
    keys = body.keys or {}
    ok = await cache.save_push_subscription(
        user["user_id"], body.endpoint, keys.get("p256dh", ""), keys.get("auth", ""), is_pwa=int(body.is_pwa),
    )
    return {"ok": ok, "enabled": True}


@router.post("/push/unsubscribe")
async def push_unsubscribe(body: PushUnsubscribeBody, user=Depends(verify_user)):
    await cache.delete_push_subscription(body.endpoint)
    return {"ok": True}


@router.get("/push/notify-time")
async def get_notify_time(user=Depends(verify_user)):
    hour = await cache.get_notify_hour(user["user_id"])
    return {"hour": hour}


@router.post("/push/notify-time")
async def set_notify_time(body: NotifyTimeBody, user=Depends(verify_user)):
    hour = max(8, min(23, int(body.hour)))
    ok = await cache.set_notify_hour(user["user_id"], hour)
    return {"ok": ok, "hour": hour}
