"""
Configuration module - loads environment variables for all API services.
Secrets stay server-side only. Never expose these to the frontend.
"""
import os
import secrets
from dotenv import load_dotenv

load_dotenv()

# ─── Environment ───
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# ─── TMDB Configuration ───
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"

# ─── OMDb Configuration ───
OMDB_API_KEY = os.getenv("OMDB_API_KEY")
OMDB_BASE_URL = "http://www.omdbapi.com/"

# ─── Anthropic Claude Configuration ───
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
# Hızlı model — yapısal intent çıkarımı gibi düşük yaratıcılık isteyen,
# latency-kritik işlerde kullanılır (Sonnet'ten ~3x hızlı).
CLAUDE_FAST_MODEL = os.getenv("CLAUDE_FAST_MODEL", "claude-3-5-haiku-20241022")

# ─── Database ───
DATABASE_PATH = os.getenv("DATABASE_PATH", "movie_cache.db")

# ─── CORS ───
_default_origins = "http://localhost:3005,http://localhost:5173,http://127.0.0.1:3005,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]

# ─── Auth ───
BETA_PASSWORD = os.getenv("BETA_PASSWORD", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
JWT_SECRET = os.getenv("JWT_SECRET", secrets.token_hex(32))
# .strip(): Render/panel'e yapıştırırken araya kaçan boşluk/yeni satır
# audience eşleşmesini bozuyordu — temizle.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()

# ─── Rate Limiting ───
RATE_LIMIT_GENERAL = int(os.getenv("RATE_LIMIT_GENERAL", "60"))   # per minute per IP
RATE_LIMIT_AI = int(os.getenv("RATE_LIMIT_AI", "20"))             # per minute per IP
