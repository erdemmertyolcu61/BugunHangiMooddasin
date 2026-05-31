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

# ─── Frontend (kanonik SPA adresi) ───
# Paylaşım/OG sayfaları crawler'a meta verir, insanı buraya yönlendirir.
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://bug-n-hangi-mooddas-n.vercel.app").rstrip("/")

# ─── CORS ───
_default_origins = "http://localhost:3005,http://localhost:5173,http://127.0.0.1:3005,http://127.0.0.1:5173,https://bug-n-hangi-mooddas-n.vercel.app"
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]

# ─── Auth ───
BETA_PASSWORD = os.getenv("BETA_PASSWORD", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
_jwt_secret = os.getenv("JWT_SECRET")
if not _jwt_secret:
    _secret_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jwt_secret.key")
    if os.path.exists(_secret_file):
        with open(_secret_file, "r") as f:
            _jwt_secret = f.read().strip()
    else:
        _jwt_secret = secrets.token_hex(32)
        with open(_secret_file, "w") as f:
            f.write(_jwt_secret)
JWT_SECRET = _jwt_secret
# .strip(): Render/panel'e yapıştırırken araya kaçan boşluk/yeni satır
# audience eşleşmesini bozuyordu — temizle.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()

# ─── Google Gemini (embedding + optional generative) ───
# Used by embedding_service.py for text-embedding-004 (<100ms per call)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

# ─── Web Push (VAPID) ───
# Anahtarlar yoksa push tamamen no-op çalışır (özellik kapalı).
# Üretmek için:  python -c "from py_vapid import Vapid01; v=Vapid01(); v.generate_keys(); print(v.public_key, v.private_key)"
# ya da pratikte:  npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@sinemood.app").strip()

# ─── Rate Limiting ───
RATE_LIMIT_GENERAL = int(os.getenv("RATE_LIMIT_GENERAL", "60"))   # per minute per IP
RATE_LIMIT_AI = int(os.getenv("RATE_LIMIT_AI", "20"))             # per minute per IP
