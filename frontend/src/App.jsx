import React, { Suspense, lazy } from 'react';

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MoodProvider, useMood } from './context/MoodContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import BetaGate from './components/BetaGate';
import SplashScreen from './components/SplashScreen';
import AudioPlayer from './components/AudioPlayer';
import BottomNav from './components/BottomNav';
import ScrollChrome from './components/ScrollChrome';
import ThemeToggle from './components/ThemeToggle';
import AuraBackground from './components/AuraBackground.jsx';

// ─── Lazy import with auto-reload on chunk miss ───────────────────
// Vercel yeni deploy'dan sonra eski chunk hash'leri 404 döner.
// Bu wrapper: hata olursa SW cache'i temizler ve sayfayı bir kez yeniler.
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      // Sonsuz reload döngüsünü engelle
      const key = 'chunk_reload';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (last && now - Number(last) < 10000) {
        // 10sn içinde zaten denendi — döngüye girme, hatayı fırlat
        throw err;
      }
      sessionStorage.setItem(key, String(now));

      // SW cache'ini temizle ve sayfayı yenile
      if ('caches' in window) {
        caches.keys().then((names) =>
          Promise.all(names.map((n) => caches.delete(n)))
        );
      }
      window.location.reload();
      // reload sırasında React'in hata fırlatmaması için beklet
      return new Promise(() => {});
    })
  );
}

// Ana sayfa (landing) eager — ilk boya hızlı olsun. Diğerleri lazy → çok daha hızlı ilk yükleme.
import MoodSelector from './pages/MoodSelector';
const Discover = lazyRetry(() => import('./pages/Discover'));
const Defterim = lazyRetry(() => import('./pages/Defterim'));
const KafanMiKarisik = lazyRetry(() => import('./pages/KafanMiKarisik'));
const SurpriseFilm = lazyRetry(() => import('./pages/SurpriseFilm'));
const Listeler = lazyRetry(() => import('./pages/Listeler'));
const Profil = lazyRetry(() => import('./pages/Profil'));
const SearchPage = lazyRetry(() => import('./pages/Search'));
const DesignPreview = lazyRetry(() => import('./pages/DesignPreview'));
const Home = lazyRetry(() => import('./pages/Home'));
const TasteMapCollision = lazyRetry(() => import('./pages/TasteMapCollision'));
const CouchMode = lazyRetry(() => import('./pages/CouchMode'));
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[#120d0b] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Tarayıcının kendi scroll restore'unu kapat — aksi halde scrollTo'yu eziyor
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    // rAF: tarayıcı restore'u sonrasına at ki kazansın
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }, [pathname]);
  return null;
}

function AppContent() {
  const { selectMood } = useMood();
  const location = useLocation();

  // Ana sayfaya dönünce modu temizle (böylece müzik fade-out ile durur)
  useEffect(() => {
    if (location.pathname === '/') {
      selectMood(null);
    }
  }, [location.pathname, selectMood]);

  return (
    <>
      <ScrollToTop />
      <ScrollChrome />
      <AuraBackground />
      <ThemeToggle />
      <AudioPlayer />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Main Flow */}
          <Route path="/" element={<MoodSelector />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/defterim" element={<Defterim />} />
          <Route path="/kafan-mi-karisik" element={<KafanMiKarisik />} />
          <Route path="/surprise" element={<SurpriseFilm />} />
          <Route path="/listeler" element={<Listeler />} />
          <Route path="/listeler/:slug" element={<Listeler />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/carpistir" element={<TasteMapCollision />} />
          <Route path="/couch" element={<CouchMode />} />

          {/* Design Preview & Legacy */}
          <Route path="/preview" element={<DesignPreview />} />
          <Route path="/home" element={<Home />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </>
  );
}

function App() {
  return (
    <Router>
      <SplashScreen />
      <ThemeProvider>
        <AuthProvider>
          <BetaGate>
            <MoodProvider>
              <SocketProvider>
                <AppContent />
              </SocketProvider>
            </MoodProvider>
          </BetaGate>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
