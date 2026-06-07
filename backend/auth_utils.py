"""
Shared authentication & authorization utilities for the Sinemood API.

Extracted from backend/main.py to enable modular router files.
"""
import logging
import time
from datetime import datetime, timedelta

import jwt as pyjwt
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from backend.config import (
    JWT_SECRET, IS_PRODUCTION, ADMIN_PASSWORD, BETA_PASSWORD,
    FRONTEND_BASE_URL, ENVIRONMENT,
)

logger = logging.getLogger("film_elestirimeni")

USER_TOKEN_HOURS = 24 * 90  # 90-day user sessions
_error_counter = 0


def _create_token(payload: dict, expires_hours: int = 24) -> str:
    payload["exp"] = datetime.utcnow() + timedelta(hours=expires_hours)
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _verify_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _auth_response(data: dict, token: str):
    """JSON response with persistent cookies (iOS PWA localStorage fallback)."""
    import json as _json
    resp = JSONResponse(data)
    resp.set_cookie(
        key="fc_user_token",
        value=token,
        max_age=7776000,
        path="/",
        secure=IS_PRODUCTION,
        httponly=False,
        samesite="lax",
    )
    user_data = data.get("user")
    if user_data:
        resp.set_cookie(
            key="fc_user_info",
            value=_json.dumps(user_data),
            max_age=7776000,
            path="/",
            secure=IS_PRODUCTION,
            httponly=False,
            samesite="lax",
        )
    return resp


def verify_beta(request: Request):
    if not IS_PRODUCTION or not BETA_PASSWORD:
        return
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Beta access required")
    token = auth.replace("Bearer ", "")
    payload = _verify_token(token)
    if payload.get("type") not in ("beta", "admin"):
        raise HTTPException(status_code=401, detail="Invalid access type")


def verify_admin(request: Request):
    if not IS_PRODUCTION and not ADMIN_PASSWORD:
        return
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "")
        payload = _verify_token(token)
        if payload.get("type") == "admin":
            return
    admin_pw = request.headers.get("X-Admin-Password", "")
    import hmac
    if admin_pw and ADMIN_PASSWORD and hmac.compare_digest(admin_pw, ADMIN_PASSWORD):
        return
    raise HTTPException(status_code=403, detail="Admin access required")


def verify_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = _verify_token(auth.replace("Bearer ", ""))
    else:
        token = request.cookies.get("fc_user_token", "")
        if not token:
            raise HTTPException(status_code=401, detail="Giriş gerekli")
        payload = _verify_token(token)
    if payload.get("type") != "user":
        raise HTTPException(status_code=403, detail="Bu işlem için hesabınla giriş yapmalısın")
    return payload


def optional_user_id(request: Request) -> int:
    auth = request.headers.get("Authorization", "")
    token = ""
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "")
    else:
        token = request.cookies.get("fc_user_token", "")
    if not token:
        return 0
    try:
        payload = _verify_token(token)
        if payload.get("type") == "user":
            return int(payload.get("user_id") or 0)
    except Exception:
        pass
    return 0


def _safe_http_500(e: Exception, context: str = "") -> HTTPException:
    global _error_counter
    _error_counter += 1
    err_id = f"E{_error_counter:04d}"
    logger.error(f"[{err_id}] {context or 'handler'} error: {type(e).__name__}: {e}", exc_info=True)
    if IS_PRODUCTION:
        return HTTPException(status_code=500, detail=f"Sunucu hatası ({err_id})")
    return HTTPException(status_code=500, detail=str(e))
