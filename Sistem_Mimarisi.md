# Film Eleştirmeni - Sistem Mimarisi

Bu proje, yapay zeka destekli bir sinema eleştiri ve kişisel izleme listesi platformudur. "Warm Paper" ve "Vinyl Shop" estetiği ile tasarlanmış, entelektüel sinema tutkunları için özel bir deneyim sunar.

## 🚀 Teknolojik Yığın

- **Frontend:** React + Tailwind CSS (v4)
- **Backend:** FastAPI (Python 3.12+)
- **Yapay Zeka:** Claude AI (Film analizi ve mood kategorizasyonu)
- **Veri Kaynakları:** TMDB (The Movie Database) & OMDb API

## 🧠 Akıllı Özellikler

### 1. Mood & Kategori Motoru
Sistem, filmlerin meta verilerini (tür, özet, anahtar kelimeler) analiz ederek otomatik olarak beş temel moddan birine atar:
- **Melankolik (🍷)**
- **Heyecanlı (🔥)**
- **Düşünceli (🧠)**
- **Neşeli (☀️)**
- **Gergin (🌑)**

### 2. "Defterim" (Kişisel Günlük)
Sinemaseverlerin kendi "sinema kütüphanelerini" oluşturmalarını sağlar:
- **İzlenecekler & İzlendi:** Filmleri durumlarına göre işaretleme.
- **Kişisel Notlar:** Her film için zengin metin alanına sahip kişisel izlenimler.
- **Kalıcı Veri:** `localStorage` ve backend entegrasyonu ile notların korunması.

### 3. Gurme (Connoisseur) Eleştiri Mantığı
Filmler için sadece özet sunmak yerine, yapay zeka tarafından üretilen "entelektüel eleştirmen" tonunda analizler sağlar. Eğer Claude analizi henüz yapılmamışsa, sistem yüksek kaliteli bir şablon ve içsel bilgi birikimiyle sofistike bir özet üretir.

## 📁 Dosya Yapısı

- `backend/`: FastAPI sunucusu, API servisleri ve veritabanı önbelleği.
- `frontend/src/App.jsx`: Ana uygulama mantığı, "Defterim" özelliği ve UI bileşenleri.
- `frontend/src/services/music.js`: Web Audio API tabanlı mood müzik sentezleyici.
- `frontend/src/index.css`: Tasarım sistemi ve özel CSS animasyonları.

## 🛠️ Kurulum ve Çalıştırma

1. Gerekli bağımlılıkları yükleyin:
   ```bash
   pip install -r requirements.txt
   cd frontend && npm install
   ```
2. `.env` dosyasını oluşturun ve API anahtarlarınızı ekleyin.
3. Sistemi başlatın:
   ```bash
   python start.py
   ```

---
*v3.0 - "Master Edition" - Film Eleştirmeni*
