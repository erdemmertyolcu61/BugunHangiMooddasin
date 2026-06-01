"""
Web Push (VAPID) gönderim servisi.

VAPID anahtarları yapılandırılmamışsa tüm fonksiyonlar sessizce no-op çalışır;
böylece özellik kapalıyken hiçbir akış bozulmaz. Hem HTTP uçları (main.py) hem de
sosyal tetikleyiciler (routers/social.py) buradan gönderim yapar — döngüsel import yok.
"""
import json
import asyncio
import logging

from backend.config import VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
from backend.database import cache

logger = logging.getLogger(__name__)

PUSH_ENABLED = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def _send_web_push(sub: dict, payload: dict) -> str:
    """Tek bir aboneliğe push gönderir.
    Döner:
      "ok"   → gönderildi
      "gone" → abonelik kalıcı geçersiz (404/410) → çağıran SİLMELİ
      "fail" → geçici/diğer hata (timeout, 429, 5xx, ağ) → abonelik KORUNMALI
    """
    if not PUSH_ENABLED:
        return "fail"
    try:
        from pywebpush import webpush, WebPushException
    except Exception:
        logger.warning("[Push] pywebpush kurulu değil — bildirim atlanıyor")
        return "fail"
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT},
            ttl=86400,
        )
        return "ok"
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            return "gone"  # abonelik gerçekten geçersiz → çağıran temizler
        # Diğer durumlar (401/403/429/5xx vb.) geçici olabilir → aboneliği SİLME
        logger.warning("[Push] gönderim hatası (abonelik korunuyor): status=%s %s", status, e)
        return "fail"
    except Exception as e:
        logger.warning("[Push] beklenmeyen hata (abonelik korunuyor): %s", e)
        return "fail"


async def send_push_to_user(user_id: int, title: str, body: str,
                            url: str = "/", tag: str = "sinemood") -> int:
    """Bir kullanıcının tüm cihazlarına push gönderir. Ölü abonelikleri temizler.
    Döner: başarıyla gönderilen cihaz sayısı."""
    if not PUSH_ENABLED or not user_id:
        return 0
    try:
        subs = await cache.get_push_subscriptions(user_id)
    except Exception:
        return 0
    payload = {"title": title, "body": body, "url": url, "tag": tag}
    sent = 0
    for sub in subs:
        result = await asyncio.to_thread(_send_web_push, sub, payload)
        if result == "ok":
            sent += 1
        elif result == "gone":
            try:
                await cache.delete_push_subscription(sub["endpoint"])
            except Exception:
                pass
        # "fail": geçici hata → aboneliği KORU (silme)
    return sent


async def send_push_broadcast(title: str, body: str, url: str = "/", tag: str = "sinemood") -> int:
    """Tüm abonelere push gönderir (günlük içerik). Ölü abonelikleri temizler.
    Döner: başarıyla gönderilen cihaz sayısı."""
    if not PUSH_ENABLED:
        return 0
    try:
        subs = await cache.get_all_push_subscriptions()
    except Exception:
        return 0
    payload = {"title": title, "body": body, "url": url, "tag": tag}
    sent = 0
    for sub in subs:
        result = await asyncio.to_thread(_send_web_push, sub, payload)
        if result == "ok":
            sent += 1
        elif result == "gone":
            try:
                await cache.delete_push_subscription(sub["endpoint"])
            except Exception:
                pass
        # "fail": geçici hata → aboneliği KORU (silme)
    return sent
