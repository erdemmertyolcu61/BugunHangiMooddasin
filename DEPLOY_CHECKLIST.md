# Sinemood — Lansman (Go-Live) Kontrol Listesi

Bu liste, sistemi canlıya alırken Render (veya benzeri) ortamında yapılması gereken
**ayar/ops** adımlarını içerir. Kod tarafı hazırdır; aşağıdakiler senin elinle yapılır.

## 1. Backend env (film-connoisseur-api — FastAPI servisi)
- [ ] **`JWT_SECRET`** — güçlü, sabit bir değer ata (örn. `openssl rand -hex 32`).
      ⚠️ Verilmezse koda dosyaya üretilir; Render redeploy/restart'ta değişir ve
      tüm kullanıcı oturumları (token) geçersiz olur. **Mutlaka sabit ata.**
- [ ] **`BETA_PASSWORD`** — **boş bırak / tanımlama** → beta kapısı kapanır, site herkese açılır.
      (Dolu olursa tüm organik ziyaretçiler şifre ekranına takılır.)
- [ ] **`ALLOWED_ORIGINS`** — güncel frontend domain'ini içermeli. ŞU AN canlı domain
      `https://bug-n-hangi-mooddas-n.vercel.app` (Vercel) ve `backend/config.py` default'unda
      zaten var. Yalnızca özel alan adına (ör. `sinemood.app`) geçince güncelle.
- [ ] **`FRONTEND_BASE_URL`** = `https://bug-n-hangi-mooddas-n.vercel.app` (veya bağladığın
      özel alan adı). OG/paylaşım kartları ve referral linkleri bunu kullanır.
- [ ] **API anahtarları** tanımlı mı: `TMDB_API_KEY`, `OMDB_API_KEY`, `ANTHROPIC_API_KEY`,
      `GEMINI_API_KEY`.
- [ ] **`ADMIN_PASSWORD`** — günlük push / yönetim uçları için güçlü bir değer ata.
- [ ] (Kalıcı veri istiyorsan) **Turso** env'leri (libsql URL + token) — yoksa lokal SQLite kullanılır.
- [ ] (Web push istiyorsan) **`VAPID_PUBLIC_KEY`**, **`VAPID_PRIVATE_KEY`**, `VAPID_SUBJECT`
      → `npx web-push generate-vapid-keys` ile üret. Yoksa push tamamen no-op (sorun değil).

## 2. Frontend env (film-connoisseur — STATIC site)
- [ ] **`VITE_GOOGLE_CLIENT_ID`** — Google girişi için (boşsa giriş butonu çıkmaz).
- [ ] **`VITE_API_BASE_URL`** — backend API adresi.
- [ ] **`VITE_SITEMAP_HOST`** — (opsiyonel) sitemap/canonical host'u; varsayılan `https://sinemood.onrender.com`.
- [ ] **Analytics (opsiyonel, gizlilik-dostu):** `VITE_ANALYTICS_PROVIDER` (`umami`|`plausible`),
      `VITE_ANALYTICS_SRC`, `VITE_ANALYTICS_SITE_ID` (umami) / `VITE_ANALYTICS_DOMAIN` (plausible).
      Analytics yalnız kullanıcı **onay** verdiğinde (ConsentBanner) çalışır.

## 3. SEO
- [x] `public/robots.txt` + build'de üretilen `public/sitemap.xml` (prebuild script).
- [x] Sayfa-başı `<title>` / `description` / `canonical` (useDocumentMeta).
- [ ] Google Search Console'a domaini ekle, `sitemap.xml`'i gönder.
- [ ] (P1) Mood/landing sayfaları için prerender/SSR ile gerçek içerik indeksleme.

## 4. Retention / İçerik
- [ ] **Günlük push cron'u:** harici bir cron (örn. cron-job.org) ile günde 1 kez
      `POST https://<api-host>/api/admin/daily-push`, header: `X-Admin-Password: <ADMIN_PASSWORD>`.
- [ ] (Opsiyonel) Web push'u aktifleştirmek için VAPID anahtarlarını gir (madde 1).

## 5. Güvenilirlik
- [ ] **Cold-start:** Render free tier ~30sn uyanma yaşatır. Keep-alive cron
      (her ~10 dk `GET /api/health`) ekle veya ücretli tier'a geç.
- [ ] **Hata izleme (önerilir, P1):** Sentry (FE + BE) DSN ekle — prod hataları görünür olsun.

## 6. Yayın öncesi duman testi (smoke)
- [ ] Ana sayfa → mood seç → Discover akışı çalışıyor.
- [ ] Sürpriz Film, Kafan Mı Karışık, Listeler, Arama açılıyor.
- [ ] Google ile giriş + profil + watchlist senkron.
- [ ] Paylaşım linkleri (`/share/u/<kullanıcı>`, `/share/<film_id>`) crawler'a doğru OG kartı veriyor
      (`curl -A "facebookexternalhit" ...`).
- [ ] `robots.txt` ve `sitemap.xml` canlıda erişilebilir; sitemap doğru host'u gösteriyor.
- [ ] Gizlilik sayfası (`/gizlilik`) açılıyor; ConsentBanner ilk ziyarette çıkıyor.
- [ ] Hem Espresso hem Latte temasında görsel/okunabilirlik kontrolü.
