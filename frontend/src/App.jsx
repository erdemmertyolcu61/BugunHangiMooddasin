import React from 'react';

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MoodProvider, useMood } from './context/MoodContext';
import BetaGate from './components/BetaGate';
import AudioPlayer from './components/AudioPlayer';
import BottomNav from './components/BottomNav';
import AuraBackground from './components/AuraBackground.jsx';
import MoodSelector from './pages/MoodSelector';
import Discover from './pages/Discover';
import Defterim from './pages/Defterim';
import KafanMiKarisik from './pages/KafanMiKarisik';
import SurpriseFilm from './pages/SurpriseFilm';
import DesignPreview from './pages/DesignPreview';
import Home from './pages/Home';
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
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
      <AuraBackground />
      <AudioPlayer />
      <Routes>
        {/* Main Flow */}
        <Route path="/" element={<MoodSelector />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/defterim" element={<Defterim />} />
        <Route path="/kafan-mi-karisik" element={<KafanMiKarisik />} />
        <Route path="/surprise" element={<SurpriseFilm />} />

        {/* Design Preview & Legacy */}
        <Route path="/preview" element={<DesignPreview />} />
        <Route path="/home" element={<Home />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

function App() {
  return (
    <Router>
      <BetaGate>
        <MoodProvider>
          <AppContent />
        </MoodProvider>
      </BetaGate>
    </Router>
  );
}

export default App;
