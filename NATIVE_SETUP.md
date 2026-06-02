# Sinemood — Native (Capacitor) Kurulum & Checklist

> Aşama 2: PWA → **Capacitor native app** (App Store + Google Play). Bulut CI ile **Android + iOS** derlenecek (geliştirme Windows'ta).
> Karar geçmişi: Capacitor wrapper + **native push (FCM/APNs)** + **RevenueCat abonelik paywall** + **KVKK**. Web hotfix aşaması tamamlandı (bildirim teslimi, 90g token, izin promptu).

---

## 0. Hedef & kısıtlar
- **Tek kod tabanı**: mevcut React/Vite SPA, Capacitor ile native shell içinde.
- **iOS yalnız macOS/Xcode ile derlenir** → Windows'ta lokal iOS build YOK → **bulut CI** (Codemagic *veya* GitHub Actions macOS runner).
- **Android** Windows'ta da derlenebilir (Android Studio + JDK 17) ama tutarlılık için **aynı CI'da** derlemek önerilir.
- Native push web push'tan farklı: **FCM (Android) + APNs (iOS)** token modeli; backend buna uyarlanmalı.

---

## 1. Hesaplar & ön koşullar (önce bunlar — bloklayıcı)
- [ ] **Apple Developer Program** — $99/yıl. (iOS yayını + APNs sertifikası + provisioning için ZORUNLU.)
- [ ] **Google Play Console** — tek seferlik $25, geliştirici hesabı.
- [ ] **Firebase projesi** (FCM) — Android push için `google-services.json`; iOS push'u APNs anahtarıyla Firebase'e bağlamak istersen iOS app de eklenir.
- [ ] **Apple Push (APNs) Auth Key** (.p8) — Apple Developer → Keys → APNs. (Key ID + Team ID + .p8.)
- [ ] **Bulut CI hesabı**: **Codemagic** (Capacitor için en kolay; önerilen) *veya* GitHub Actions (macOS runner — dakika kotası).
- [ ] **Kod imzalama varlıkları**: Android **keystore** (.jks + şifreler), iOS **distribution certificate** + **provisioning profile** (CI bunları yönetebilir — Codemagic "automatic code signing").
- [ ] **App kimlikleri**: `appId = app.sinemood` (örnek; ters-DNS, store'da benzersiz). Hem App Store Connect hem Play Console'da bu ID ile uygulama kaydı.
- [ ] **RevenueCat hesabı** (paywall aşaması — şimdilik beklemede; B-7).

> Not: APNs/FCM anahtarları **CI ortam değişkenlerinde / güvenli dosyalarda** tutulur; repoya commit'lenmez.

---

## 2. Capacitor scaffold (kod — onay verince kurulacak)
`frontend/` içinde:
- [ ] Bağımlılıklar: `@capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`
- [ ] Eklentiler: `@capacitor/app` (back button/deep link), `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/push-notifications`, `@capacitor/preferences` (token), `@capacitor/browser` (OAuth/harici link), `@capacitor/share` (native paylaşım).
- [ ] `capacitor.config.ts`: `appId: 'app.sinemood'`, `appName: 'Sinemood'`, `webDir: 'dist'`, `server.url` **yok** (bundled assets), Android `allowMixedContent: false`.
- [ ] `npx cap add android` + `npx cap add ios` → `android/` ve `ios/` klasörleri (repoya commit edilir).
- [ ] Build akışı: `npm run build` → `npx cap sync` → CI derler.

---

## 3. API / origin / CORS uyarlaması
- [ ] **Mutlak backend URL**: native'de relative `/api` proxy yok. `frontend/src/utils/apiConfig.js` prod'da `VITE_API_BASE_URL`'e düşüyor → CI build'inde **`VITE_API_BASE_URL = https://bug-nhangimooddas-n-production.up.railway.app`** set edilmeli. (apiConfig default'u eski Render URL'sini gösteriyor — env şart.)
- [ ] **CORS**: backend `ALLOWED_ORIGINS` (`backend/config.py:40`, env override) — Railway env'e native origin'leri ekle:
  `capacitor://localhost`, `https://localhost`, `http://localhost` (Android WebView). `*` KULLANMA.
- [ ] **Google OAuth origin**: GSI origin-kısıtlı. `capacitor://localhost` / `https://localhost` Google Cloud Console "Authorized JavaScript origins"e eklenemeyebilir → **`@capacitor/browser` ile sistem tarayıcısında OAuth** akışı gerekebilir (B-5'teki en riskli nokta). Plan: native'de Google login'i sistem tarayıcı + deep-link geri dönüş ile çöz.

---

## 4. Native push (FCM + APNs) — en kritik özellik
Web push (`utils/push.js`, `push-sw.js`) iOS native WKWebView'da çalışmaz. Native'de `@capacitor/push-notifications`:
- [ ] **Frontend abstraction**: yeni `utils/nativePush.js` — Capacitor ortamında (`Capacitor.isNativePlatform()`) native push API'sini, web'de mevcut `utils/push.js`'i kullan. `NotificationsBell` + `PushPrompt` bu abstraction'ı çağırsın.
- [ ] **İzin + token**: native izin diyaloğu → `PushNotifications.register()` → `registration` event'inde **FCM/APNs token** alınır.
- [ ] **Backend token modeli**: mevcut `/api/push/subscribe` Web Push subscription (`endpoint+keys`) bekliyor. Native için **yeni alan/endpoint**: cihaz tipi (`web|fcm|apns`) + token. `backend/database.py` push tablosuna `platform` + `token` kolonları; `/api/push/subscribe` her iki formatı kabul etsin.
- [ ] **Backend gönderim**: `backend/services/push_service.py` şu an yalnız `pywebpush`. Native için:
  - Android (FCM) + iOS (APNs) → **tek yol: Firebase Admin SDK** (FCM hem Android'e hem APNs'e gönderir; iOS app Firebase'e APNs key ile bağlıysa). `send_push_to_user` platforma göre `webpush` *veya* `firebase_admin.messaging` kullansın.
  - Mevcut "yalnız 404/410'da sil" mantığı (C-1) FCM/APNs için de uygulansın (FCM `UNREGISTERED` → sil).
- [ ] **Foreground/background/killed** davranışı + bildirim tıklayınca deep link (B-3).

> Bu, backend'de gerçek bir geliştirme (Firebase Admin entegrasyonu + şema). Ayrı bir alt-görev olarak ele alınmalı.

---

## 5. Native secure storage — re-login'i tamamen çözer
Web hotfix (90g token + `storage.persist`) iOS ITP tahliyesini tam çözmez.
- [ ] `frontend/src/context/AuthContext.jsx`: token okuma/yazmayı bir storage abstraction'ına al — native'de `@capacitor/preferences` (Keychain/Keystore destekli), web'de `localStorage`. `fc_user_token`/`fc_user_info` native'de güvenli ve **kalıcı** saklanır → kapat-aç sonrası re-login biter.

---

## 6. Bulut CI — Codemagic (önerilen) / GitHub Actions
**Codemagic (önerilen — Capacitor şablonu hazır):**
- [ ] Repoyu Codemagic'e bağla; `codemagic.yaml` ekle (web build → `cap sync` → Android `.aab` + iOS `.ipa`).
- [ ] **Android signing**: keystore'u Codemagic'e yükle (env grup).
- [ ] **iOS signing**: App Store Connect API key ile **automatic code signing** (sertifika/profili Codemagic üretir).
- [ ] Build env: `VITE_API_BASE_URL`, varsa diğer `VITE_*`.
- [ ] Artifact: `.aab` (Play) + `.ipa` (App Store) → opsiyonel otomatik yükleme (TestFlight / Play internal).

**Alternatif — GitHub Actions:**
- [ ] `macos-latest` runner (iOS) + `ubuntu` (Android) iş akışları. Signing secret'ları GitHub Secrets'ta. (Daha fazla manuel kurulum; macOS dakika maliyeti.)

---

## 7. Deep link / status bar / back button / splash
- [ ] **Deep link**: `@capacitor/app` `appUrlOpen` + iOS Universal Links / Android App Links → bildirim/paylaşım linkleri doğru ekranı açar (B-5).
- [ ] **Android back button**: modal/sheet açıkken önce onu kapat, kökte çıkışı onayla.
- [ ] **StatusBar**: rengi/overlay; içerik status bar altına kaçmıyor (B-1 — `.mt-safe`/`pt-safe` zaten var).
- [ ] **SplashScreen** + adaptive icon: native ikon/splash setleri (`sinemod-mark.png` 512px var; tüm boyutlar üretilmeli — `@capacitor/assets`).

---

## 8. Store görselleri & metinler
- [ ] App ikonları (tüm boyutlar), feature graphic, ekran görüntüleri (telefon + tablet).
- [ ] **Gizlilik Politikası URL'si** (zorunlu) — mevcut `/gizlilik` sayfası, kanonik URL ile.
- [ ] **App Privacy (Apple) / Data Safety (Google)** formları: TMDB/OMDb, analitik, push token, hesap verisi beyanı.
- [ ] İçerik derecelendirmesi, kategori (Entertainment), yaş sınırı.
- [ ] **KVKK** (B-6): aydınlatma + açık rıza (`ConsentBanner`) native ilk açılışta; veri silme yolu.

---

## 9. Doğrulama (Bölüm B test planıyla eşleşir)
- [ ] CI'dan çıkan **Android `.aab`/`.apk`** gerçek cihazda + **iOS `.ipa`** TestFlight'ta kurulur.
- [ ] B-1…B-5 yürütülür; özellikle **native push (B-3, foreground+background+killed)**, **Google OAuth (B-5)**, **deep link**, **native share**, **secure storage ile kalıcı oturum**.
- [ ] Çıkış kriteri: iki gerçek cihazda öner→bildirim→aç akışı yeşil; kapat-aç'ta re-login yok.

---

## 10. Önerilen sıra (sprint)
1. **Hesaplar (Bölüm 1)** — bloklayıcı; paralel başlat (Apple/Play/Firebase/Codemagic).
2. **Scaffold (Bölüm 2)** + API/CORS (Bölüm 3) → Codemagic'te ilk **Android debug build** (hızlı zafer).
3. **Native push (Bölüm 4)** — frontend abstraction + backend FCM/APNs + şema.
4. **Secure storage (Bölüm 5)** — re-login bitir.
5. **iOS signing + TestFlight** (Bölüm 6) → iOS build.
6. **Deep link/splash/ikon (Bölüm 7)** + store görselleri (Bölüm 8).
7. **B testleri (Bölüm 9)** → store gönderimi.
8. (Sonra) **RevenueCat paywall** — B-7.

---

### Kararlar / açık noktalar
- **Codemagic vs GitHub Actions**: Codemagic önerilir (Capacitor + otomatik iOS signing kolay). Onayınla `codemagic.yaml` hazırlanır.
- **Native push backend'i**: Firebase Admin SDK ile birleşik gönderim (FCM→Android+APNs). Ayrı geliştirme görevi.
- **appId** kesinleşmeli (örn. `app.sinemood`) — store kayıtları buna bağlı.
