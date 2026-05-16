# Entegrasyon Kılavuzu — Warm Paper / Vinyl Shop + Mod Müziği

Bu klasör `frontend/src/` dizinine direkt drop-in olarak yerleştirilecek dosyaları içerir. Hiçbir yeni paket gerekmiyor — yalnızca mevcut React + Tailwind v4 + Vite kurulumunu kullanır.

## Kurulum

1. **Tüm `integration/src/` içeriğini `film eleştirmen/frontend/src/` üzerine kopyala** — aşağıdaki dosyalar değişiyor:

   ```
   src/App.jsx                          ← yeniden yazıldı (sidebar gitti, MusicPanel eklendi)
   src/index.css                        ← warm paper teması (Tailwind v4 @theme)
   src/services/music.js                ← YENİ — Web Audio synth
   src/components/Header.jsx            ← yeniden yazıldı
   src/components/MovieCard.jsx         ← sleeve estetiği (TMDB poster kullanır)
   src/components/MoodBadge.jsx         ← paper paleti
   src/components/MoodSelector.jsx      ← paper chips
   src/components/MovieGrid.jsx         ← Hero + Shelves + filtre grid
   src/components/MovieModal.jsx        ← paper modal
   src/components/Hero.jsx              ← YENİ
   src/components/Shelf.jsx             ← YENİ
   src/components/MusicPanel.jsx        ← YENİ — sol alt ayar paneli
   ```

2. **Sidebar.jsx dosyasını sil** — artık kullanılmıyor:
   ```bash
   rm frontend/src/components/Sidebar.jsx
   ```

3. **`Loader.jsx` mevcut olduğu gibi kalır** — değişiklik yok (yalnızca renkler eski koyu temaya göre olabilir; istersen `text-accent-gold` → `text-accent`, `bg-dark-700` → `bg-line` değiştir).

4. Çalıştır: `cd frontend && npm run dev`

## Neler Değişti

### Görsel
- **Renk teması**: koyu mod + altın → sıcak kağıt (cream) + ochre/red/olive/blue paletinden vurgu
- **Tipografi**: Outfit/Inter → IBM Plex Mono (başlık + etiket) + Inter (gövde). Sayılar, katalog numaraları, küçük büyük harfler hep mono — "curated dükkanı" hissi
- **Layout**: 8/4 grid + sidebar → tam genişlikli Hero + yatay kaydırmalı raflar
- **Posterler**: gerçek TMDB görüntüleri vinyl sleeve gölgesi + hafif eğim ile gösterilir
- **Doku**: SVG noise paper grain overlay (body'ye `grain-on` class'ı eklenince aktif)

### Özellik
- **Hero spotlight**: haftanın seçimi (movies[0]), rubber-stamp etiketi ile
- **Raflar**: Vizyondakiler · Editörün Seçimi · ardından mevcut filmleri içeren her mod için bir raf (boşları gizler)
- **Filtre modu**: mod chip'i tıklanınca grid görünümüne geçer
- **Müzik sistemi** (yeni!):
  - `services/music.js` — `MoodSynth` sınıfı, 6 mod için tek tek akor/dalga/filtre presetleri (Web Audio API)
  - **Otomatik mod**: film modalı açılınca o filmin modunun müziği başlar; mod filtresi seçilince de değişir
  - **Sol alt panel**: vinyl plak butonuyla aç/kapat. İçinde: şu an çalan + EQ animasyonu, play/pause, ses seviyesi, otomatik mod toggle, manuel mod seçimi, durdur
  - Tercihler `localStorage`'da saklanır: ses seviyesi, otomatik mod, panel açık/kapalı

## Önemli Notlar

- **AudioContext kullanıcı etkileşimi gerektirir** — sayfa açılınca müzik kendiliğinden başlamaz. İlk tıklamada (mod chip, film, oynat butonu) context resume olur.
- **Backend API'si değişmedi** — `services/api.js` aynı kalır.
- **Backend `mood` alanı** — mod isimlerinin presetlerle birebir eşleşmesi gerekir: `Eğlenceli`, `Melankolik`, `Gergin`, `Çerezlik`, `Ağır Dram`, `Heyecanlı`. Backend bunları döndürdüğünden müzik otomatik çalışır.
- **`Sidebar` import'unu sildiysen App.jsx zaten import etmiyor** — eski Sidebar.jsx dosyası yetim kalır, silebilirsin.

## Hızlı Renk Eşlemesi (Tailwind class'ları)

| Eski (dark)        | Yeni (paper)        |
|--------------------|---------------------|
| `bg-dark-900`      | `bg-paper-warm`     |
| `bg-dark-800`      | `bg-paper-cream`    |
| `text-dark-100`    | `text-ink`          |
| `text-dark-200`    | `text-ink-soft`     |
| `text-dark-300/400`| `text-ink-mute`     |
| `border-dark-700`  | `border-line`       |
| `text-accent-gold` | `text-accent`       |
| `font-display`     | `font-mono`         |
| `font-body`        | `font-sans`         |

Kalan herhangi bir component'te bu eşlemeyi uygula.
