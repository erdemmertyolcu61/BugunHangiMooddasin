import React, { Suspense, lazy } from 'react';

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MoodProvider, useMood } from './context/MoodContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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

import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-[2.5rem] bg-white/5 overflow-hidden" />
      <div className="mt-3 sm:mt-5 px-1 sm:px-4 space-y-2">
        <div className="h-4 bg-white/10 rounded w-3/4" />
        <div className="flex items-center justify-between">
          <div className="h-3 bg-white/10 rounded w-1/5" />
          <div className="h-3 bg-white/10 rounded w-1/6" />
        </div>
      </div>
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div className="min-h-screen bg-[#120d0b] px-4 sm:px-8 pt-24 pb-16">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="h-8 bg-white/5 rounded w-1/4 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 sm:gap-x-10 gap-y-8 sm:gap-y-16">
          {[...Array(10)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}

function AppReadyNotifier() {
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.__APP_READY = true;
      window.dispatchEvent(new CustomEvent('app-ready'));
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
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

      <Suspense fallback={<DiscoverSkeleton />}>
        <Routes>
          {/* Main Flow */}
          <Route path="/" element={<MoodSelector />} />
          <Route path="/moodlar" element={<MoodSelector />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/defterim" element={<Defterim />} />
          <Route path="/kafan-mi-karisik" element={<KafanMiKarisik />} />
          <Route path="/surprise" element={<SurpriseFilm />} />
          <Route path="/listeler" element={<Listeler />} />
          <Route path="/listeler/:slug" element={<Listeler />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/carpistir" element={<TasteMapCollision />} />

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
            <AppReadyNotifier />
            <MoodProvider>
              <AppContent />
            </MoodProvider>
          </BetaGate>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
