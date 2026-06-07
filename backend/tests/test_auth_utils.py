"""auth_utils saf JWT yardımcıları için birim testleri (ağ/DB gerektirmez)."""
import pytest
from fastapi import HTTPException

from backend.auth_utils import _create_token, _verify_token


def test_token_roundtrip_preserves_payload():
    token = _create_token({"type": "user", "user_id": 7}, expires_hours=1)
    decoded = _verify_token(token)
    assert decoded["type"] == "user"
    assert decoded["user_id"] == 7
    assert "exp" in decoded


def test_expired_token_raises_401():
    # Negatif süre → anında süresi dolmuş token
    token = _create_token({"type": "user", "user_id": 1}, expires_hours=-1)
    with pytest.raises(HTTPException) as exc:
        _verify_token(token)
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()


def test_garbage_token_raises_401():
    with pytest.raises(HTTPException) as exc:
        _verify_token("not.a.real.jwt")
    assert exc.value.status_code == 401
