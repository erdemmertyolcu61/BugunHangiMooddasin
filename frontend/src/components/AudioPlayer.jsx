import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useMood } from '../context/MoodContext';
import {
  playMoodAudio,
  stopMoodAudio,
  setMoodAudioVolume,
  getCurrentMoodAudio
} from '../utils/moodAudioManager';

const DEFAULT_VOLUME = 0.35;

export default function AudioPlayer() {
  const location = useLocation();
  const { selectedMood } = useMood();

  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Desktop: hover ile panel açılır
  // Mobil: vinyl butona dokunulunca panel açılır
  const [hovered, setHovered] = useState(false);
  const [isTouchOnly] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  );
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [panelOpen, setPanelOpen] = useState(false);
  const showPanel = isTouchOnly ? panelOpen : (hovered || panelOpen);

  const closeTimer = useRef(null);

  // Panel mobilde 2.5 saniye sonra otomatik kapanır (slider dokunulmadan)
  useEffect(() => {
    if (panelOpen) {
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setPanelOpen(false), 2500);
    }
    return () => clearTimeout(closeTimer.current);
  }, [panelOpen]);

  // 1. Mod & Route Tabanlı Oynatma
  useEffect(() => {
    if (location.pathname === '/kafan-mi-karisik') {
      stopMoodAudio();
      return;
    }
    if (selectedMood) {
      playMoodAudio(selectedMood.id);
    } else {
      stopMoodAudio();
    }
  }, [selectedMood, location.pathname]);

  // 2. Ses Durumu Takibi
  useEffect(() => {
    const interval = setInterval(() => {
      const state = getCurrentMoodAudio();
      setIsPlaying(state.isPlaying);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleMute = () => {
    if (muted) {
      setMuted(false);
      setMoodAudioVolume(volume);      // Resume (setMoodAudioVolume içinde play çağrılır)
    } else {
      setMuted(true);
      setMoodAudioVolume(0);           // Gerçekten durdurur (pause)
    }
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMoodAudioVolume(v);            // 0 → pause, >0 → resume otomatik
    if (v === 0) setMuted(true);
    else if (muted) setMuted(false);
    // Panel açıksa kapanma timer'ını uzat
    // Slider bırakılınca 1.5 saniye sonra kapat
    if (panelOpen) {
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setPanelOpen(false), 1500);
    }
  };

  // Vinyl butona tıklanınca:
  // - Mobil (hover desteklemeyen ekran): paneli aç/kapat
  // - Desktop: mute toggle
  const handleVinylClick = () => {
    const isTouchDevice = window.matchMedia('(hover: none)').matches;
    if (isTouchDevice) {
      setPanelOpen(p => !p);
    } else {
      toggleMute();
    }
  };

  if (!selectedMood || location.pathname === '/kafan-mi-karisik') return null;

  return (
    <div
      className="fixed right-4 bottom-[7.5rem] md:bottom-6 md:right-6 z-[95] flex items-end gap-3 mb-safe md:mb-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Ses Kontrol Paneli */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, width: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, width: 'auto', scale: 1, x: 0 }}
            exit={{ opacity: 0, width: 0, scale: 0.9, x: 20 }}
            className="bg-[#12100e]/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl h-14 flex items-center px-5 overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.5)] mb-1 gap-3"
          >
            {/* Mute butonu (mobilde ayrıca görünür) */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="shrink-0 text-amber-500/60 hover:text-amber-400 transition-colors tap-target flex items-center justify-center"
            >
              {muted || volume === 0
                ? <VolumeX size={16} />
                : <Volume2 size={16} />
              }
            </button>

            {/* Slider */}
            <input
              type="range"
              min="0" max="1" step="0.02"
              value={muted ? 0 : volume}
              onChange={handleVolume}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={() => {
                // Parmak/mouse bırakılınca 1.2s sonra kapat
                clearTimeout(closeTimer.current);
                closeTimer.current = setTimeout(() => setPanelOpen(false), 1200);
              }}
              className="w-24 accent-amber-500 h-1 rounded-full appearance-none outline-none cursor-pointer"
            />

            <span className="text-[9px] font-bold text-amber-500/40 uppercase tracking-widest shrink-0 w-6 text-right">
              {muted ? '0' : Math.round(volume * 100)}
            </span>

            {isIOS && (
              <span className="text-[7px] text-amber-500/30 uppercase tracking-wider whitespace-nowrap">
                iOS: hw tuşları
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vinyl Disc Butonu */}
      <button
        onClick={handleVinylClick}
        className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-95
          ${isPlaying && !muted ? 'animate-spin-vinyl' : ''}`}
        style={{
          background: 'radial-gradient(circle at center, #d6a84f 0 10%, #1a1a1a 11% 35%, #0a0a0a 36% 100%)',
          border: '2px solid rgba(214, 168, 79, 0.3)',
          boxShadow: isPlaying && !muted
            ? `0 0 20px ${selectedMood?.auraColors?.[0] || 'rgba(214,168,79,0.4)'}60, 0 10px 30px rgba(0,0,0,0.5)`
            : '0 10px 30px rgba(0,0,0,0.4)',
        }}
        title={muted ? 'Sesi Aç' : 'Ses Ayarı'}
      >
        {/* Plak Kanalları */}
        <div
          className="absolute inset-0 rounded-full opacity-20 pointer-events-none"
          style={{
            background: 'repeating-radial-gradient(circle at center, transparent 0, transparent 2px, #fff 3px, transparent 4px)',
            maskImage: 'radial-gradient(circle at center, transparent 35%, black 36%)',
            WebkitMaskImage: 'radial-gradient(circle at center, transparent 35%, black 36%)',
          }}
        />

        {/* Merkez Etiketi */}
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center z-10 transition-colors duration-700"
          style={{ background: selectedMood?.auraColors?.[0] || '#d6a84f' }}
        >
          {selectedMood?.icon
            ? <selectedMood.icon size={10} strokeWidth={2} className="text-white/90" />
            : <div className="w-1.5 h-1.5 rounded-full bg-[#12100e]" />
          }
        </div>

        {/* Hover İkonu */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 rounded-full z-20">
          {muted
            ? <VolumeX size={18} className="text-amber-500" />
            : <Volume2 size={18} className="text-amber-500" />
          }
        </div>
      </button>
    </div>
  );
}
