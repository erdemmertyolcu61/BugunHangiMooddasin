"""Topluluk katmanı (Söz, trend, moderasyon, engelleme, public liste) entegrasyon testleri.

Geçici local SQLite kullanır; TMDB/ağ çağrıları monkeypatch'lenir.
"""
import asyncio
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.auth_utils import _create_token
from backend.database import cache, _get_connection as _db_conn


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture()
def app_client(tmp_path, monkeypatch):
    """Temiz şemalı geçici DB + community/lists/admin router'larıyla test app'i."""
    db_path = str(tmp_path / "test_community.db")
    monkeypatch.setattr(cache, "db_path", db_path)
    # Turso devre dışı (her zaman local aiosqlite)
    import backend.database as dbmod
    monkeypatch.setattr(dbmod, "_turso_client", None)
    monkeypatch.setattr(dbmod, "_pool_init", False)

    asyncio.get_event_loop_policy().new_event_loop()
    asyncio.run(cache.init_db())

    async def _seed_users():
        async with _db_conn(db_path, user_data=True) as db:
            await db.execute(
                "INSERT INTO users (google_id, email, name, username, picture) VALUES (?,?,?,?,?)",
                ("g1", "a@a.com", "Ali", "ali", ""),
            )
            await db.execute(
                "INSERT INTO users (google_id, email, name, username, picture) VALUES (?,?,?,?,?)",
                ("g2", "b@b.com", "Banu", "banu", ""),
            )
            await db.commit()
    asyncio.run(_seed_users())

    # TMDB ağ çağrılarını kapat
    import backend.routers.community as comm

    async def _fake_meta(movie_ids):
        return {mid: {"title": f"Film {mid}", "poster_url": f"/p/{mid}.jpg",
                      "vote_average": 7.0, "release_date": "2024-01-01"} for mid in movie_ids}
    monkeypatch.setattr(comm, "_movie_meta", _fake_meta)
    # Trend cache'ini sıfırla (testler arası sızıntı olmasın)
    comm._trending_cache["ts"] = 0.0
    comm._trending_cache["data"] = None

    # Admin guard'ı dev moduna çek (IS_PRODUCTION=False + ADMIN_PASSWORD boş → bypass)
    import backend.auth_utils as au
    monkeypatch.setattr(au, "IS_PRODUCTION", False)
    monkeypatch.setattr(au, "ADMIN_PASSWORD", "")

    from backend.routers.community import router as community_router
    from backend.routers.lists_user import router as lists_router
    from backend.routers.admin import router as admin_router

    app = FastAPI()
    app.include_router(community_router)
    app.include_router(lists_router)
    app.include_router(admin_router)
    return TestClient(app)


def _auth(user_id: int) -> dict:
    token = _create_token({"type": "user", "user_id": user_id}, expires_hours=1)
    return {"Authorization": f"Bearer {token}"}


# ─── Söz (reviews) ───────────────────────────────────────────────────────────

def test_review_crud_and_listing(app_client):
    # Yaz
    r = app_client.post("/api/movies/550/reviews",
                        json={"content": "Müthiş bir final."}, headers=_auth(1))
    assert r.status_code == 200

    # Login'siz listele — görünür olmalı
    r = app_client.get("/api/movies/550/reviews")
    assert r.status_code == 200
    reviews = r.json()["reviews"]
    assert len(reviews) == 1
    assert reviews[0]["content"] == "Müthiş bir final."
    assert reviews[0]["username"] == "ali"

    # Upsert: aynı kullanıcı güncellesin (ikinci satır oluşmasın)
    r = app_client.post("/api/movies/550/reviews",
                        json={"content": "Fikrim değişti, başyapıt.", "has_spoiler": True},
                        headers=_auth(1))
    assert r.status_code == 200
    reviews = app_client.get("/api/movies/550/reviews").json()["reviews"]
    assert len(reviews) == 1
    assert reviews[0]["has_spoiler"] is True

    # Sil
    r = app_client.delete("/api/movies/550/reviews", headers=_auth(1))
    assert r.status_code == 200
    assert app_client.get("/api/movies/550/reviews").json()["reviews"] == []


def test_review_length_limit_rejected(app_client):
    r = app_client.post("/api/movies/550/reviews",
                        json={"content": "x" * 281}, headers=_auth(1))
    assert r.status_code == 422  # Pydantic max_length


def test_review_requires_auth(app_client):
    r = app_client.post("/api/movies/550/reviews", json={"content": "deneme yorum"})
    assert r.status_code == 401


# ─── Beğeniler ───────────────────────────────────────────────────────────────

def test_review_likes(app_client):
    app_client.post("/api/movies/600/reviews", json={"content": "Beğenilesi söz."}, headers=_auth(1))
    rid = app_client.get("/api/movies/600/reviews").json()["reviews"][0]["id"]

    assert app_client.post(f"/api/reviews/{rid}/like", headers=_auth(2)).status_code == 200
    listed = app_client.get("/api/movies/600/reviews", headers=_auth(2)).json()["reviews"][0]
    assert listed["like_count"] == 1
    assert listed["liked_by_me"] is True

    assert app_client.delete(f"/api/reviews/{rid}/like", headers=_auth(2)).status_code == 200
    assert app_client.get("/api/movies/600/reviews").json()["reviews"][0]["like_count"] == 0


# ─── Engelleme ───────────────────────────────────────────────────────────────

def test_block_hides_reviews(app_client):
    app_client.post("/api/movies/700/reviews", json={"content": "Banu'nun sözü."}, headers=_auth(2))
    # Ali, Banu'yu engeller
    assert app_client.post("/api/users/2/block", headers=_auth(1)).status_code == 200
    # Ali artık Banu'nun sözünü görmez
    reviews = app_client.get("/api/movies/700/reviews", headers=_auth(1)).json()["reviews"]
    assert reviews == []
    # Login'siz ziyaretçi görür (engel kişiseldir)
    assert len(app_client.get("/api/movies/700/reviews").json()["reviews"]) == 1
    # Engel listesinde görünür + kaldırınca geri gelir
    blocked = app_client.get("/api/users/blocks", headers=_auth(1)).json()["blocked"]
    assert blocked[0]["username"] == "banu"
    app_client.delete("/api/users/2/block", headers=_auth(1))
    assert len(app_client.get("/api/movies/700/reviews", headers=_auth(1)).json()["reviews"]) == 1


# ─── Şikayet → admin moderasyonu ─────────────────────────────────────────────

def test_report_and_admin_hide_flow(app_client):
    app_client.post("/api/movies/800/reviews", json={"content": "Sorunlu içerik."}, headers=_auth(2))
    rid = app_client.get("/api/movies/800/reviews").json()["reviews"][0]["id"]

    r = app_client.post("/api/reports",
                        json={"content_type": "review", "content_id": str(rid), "reason": "hakaret"},
                        headers=_auth(1))
    assert r.status_code == 200

    reports = app_client.get("/api/admin/reports").json()["reports"]
    assert len(reports) == 1
    assert reports[0]["review_content"] == "Sorunlu içerik."
    report_id = reports[0]["id"]

    r = app_client.post(f"/api/admin/reports/{report_id}/resolve?action=hide")
    assert r.status_code == 200
    # Gizlenen Söz artık listelenmez
    assert app_client.get("/api/movies/800/reviews").json()["reviews"] == []
    # Kuyruk temizlendi
    assert app_client.get("/api/admin/reports").json()["reports"] == []


def test_report_invalid_type_rejected(app_client):
    r = app_client.post("/api/reports",
                        json={"content_type": "banana", "content_id": "1"}, headers=_auth(1))
    assert r.status_code == 400


# ─── Trend ───────────────────────────────────────────────────────────────────

def test_trending_scores_and_public_access(app_client):
    async def _seed():
        async with _db_conn(cache.db_path, user_data=True) as db:
            # Film 111: 2 topluluk önerisi (skor 6) — Film 222: 1 watchlist (skor 1)
            await db.execute(
                "INSERT INTO community_recommendations (tmdb_id, user_id, username) VALUES (111, 1, 'ali')")
            await db.execute(
                "INSERT INTO community_recommendations (tmdb_id, user_id, username) VALUES (111, 2, 'banu')")
            await db.execute(
                "INSERT INTO watchlist (tmdb_id, title, user_id) VALUES (222, 'Film 222', 1)")
            await db.commit()
    asyncio.run(_seed())

    r = app_client.get("/api/community/trending")  # login'siz!
    assert r.status_code == 200
    movies = r.json()["movies"]
    assert movies[0]["id"] == 111
    assert movies[0]["trend_score"] == 6
    assert {m["id"] for m in movies} == {111, 222}
    assert movies[0]["recommenders"][0]["username"] in ("ali", "banu")


# ─── Public listeler ─────────────────────────────────────────────────────────

def test_public_list_publish_and_view(app_client):
    created = app_client.post("/api/custom-lists",
                              json={"name": "Kış Geceleri", "emoji": "❄️"}, headers=_auth(1)).json()
    lid = created["id"]
    app_client.post(f"/api/custom-lists/{lid}/items",
                    json={"tmdb_id": 550, "title": "Fight Club", "poster_url": "/p/550.jpg"},
                    headers=_auth(1))

    # Yayınla → slug üretilir
    r = app_client.patch(f"/api/custom-lists/{lid}/visibility",
                         json={"is_public": True, "description": "Soğuk geceler için."},
                         headers=_auth(1))
    assert r.status_code == 200
    slug = r.json()["slug"]
    assert slug and slug.startswith("kis-geceleri-")

    # Login'siz erişim
    pub = app_client.get(f"/api/lists/public/{slug}")
    assert pub.status_code == 200
    data = pub.json()
    assert data["name"] == "Kış Geceleri"
    assert data["owner"]["username"] == "ali"
    assert data["items"][0]["tmdb_id"] == 550

    # Gizle → 404
    app_client.patch(f"/api/custom-lists/{lid}/visibility",
                     json={"is_public": False}, headers=_auth(1))
    assert app_client.get(f"/api/lists/public/{slug}").status_code == 404
