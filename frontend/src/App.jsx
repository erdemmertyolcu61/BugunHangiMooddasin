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
// Ana sayfa (landing) eager — ilk boya hızlı olsun. Diğerleri lazy → çok daha hızlı ilk yükleme.
import MoodSelector from './pages/MoodSelector';
const Discover = lazy(() => import('./pages/Discover'));
const Defterim = lazy(() => import('./pages/Defterim'));
const KafanMiKarisik = lazy(() => import('./pages/KafanMiKarisik'));
const SurpriseFilm = lazy(() => import('./pages/SurpriseFilm'));
const Listeler = lazy(() => import('./pages/Listeler'));
const Profil = lazy(() => import('./pages/Profil'));
const SearchPage = lazy(() => import('./pages/Search'));
const DesignPreview = lazy(() => import('./pages/DesignPreview'));
const Home = lazy(() => import('./pages/Home'));
const TasteMapCollision = lazy(() => import('./pages/TasteMapCollision'));
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
      <SplashScreen />
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
      <ThemeProvider>
        <AuthProvider>
          <BetaGate>
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
