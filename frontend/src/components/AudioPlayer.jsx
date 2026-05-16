import React, { useState, useEffect } from 'react';
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
  const [hovered, setHovered] = useState(false);

  // 1. Mod & Route Tabanlı Oynatma (kafan-mi-karisik sayfasında müzik yok)
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

  // 2. Ses Durumu Takibi (daha uzun interval = daha az CPU)
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
      setMoodAudioVolume(volume);
    } else {
      setMuted(true);
      setMoodAudioVolume(0);
    }
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (!muted) {
      setMoodAudioVolume(v);
    }
    if (v === 0) setMuted(true);
    else if (muted) setMuted(false);
  };

  // Kafan mı karışık sayfasında player gizle, sadece mood varsa göster
  if (!selectedMood || location.pathname === '/kafan-mi-karisik') return null;

  return (
    <div 
      className="fixed bottom-6 right-6 z-50 flex items-end gap-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover Panel: Ses Kontrolü (Retro Panel) */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, width: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, width: 'auto', scale: 1, x: 0 }}
            exit={{ opacity: 0, width: 0, scale: 0.9, x: 20 }}
            className="bg-[#12100e]/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl h-14 flex items-center px-6 overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.5)] mb-1"
          >
            <div className="flex flex-col mr-4">
              <span className="text-[8px] font-bold text-amber-500/50 uppercase tracking-[0.2em] mb-1">Volume</span>
              <div className="flex items-center gap-3">
                <VolumeX size={12} className="text-amber-500/40" />
                <input 
                  type="range" 
                  min="0" max="1" step="0.01"
                  value={muted ? 0 : volume}
                  onChange={handleVolume}
                  className="w-32 accent-amber-500 h-1 bg-white/5 rounded-full appearance-none outline-none cursor-pointer" 
                />
                <Volume2 size={12} className="text-amber-500/40" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retro Plak / Vinyl Disc Butonu */}
      <button
        onClick={toggleMute}
        className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-95
          ${isPlaying && !muted ? 'animate-spin-vinyl' : ''}`}
        style={{
          background: 'radial-gradient(circle at center, #d6a84f 0 10%, #1a1a1a 11% 35%, #0a0a0a 36% 100%)',
          border: '2px solid rgba(214, 168, 79, 0.3)',
          boxShadow: isPlaying && !muted
            ? `0 0 20px ${selectedMood?.auraColors?.[0] || 'rgba(214,168,79,0.4)'}60, 0 10px 30px rgba(0,0,0,0.5)`
            : '0 10px 30px rgba(0,0,0,0.4)',
        }}
        title={muted ? "Sesi Aç" : "Sesi Kapat"}
      >
        {/* Plak Kanalları (Dairesel çizgiler) */}
        <div className="absolute inset-0 rounded-full opacity-20 pointer-events-none"
          style={{
            background: 'repeating-radial-gradient(circle at center, transparent 0, transparent 2px, #fff 3px, transparent 4px)',
            maskImage: 'radial-gradient(circle at center, transparent 35%, black 36%)',
            WebkitMaskImage: 'radial-gradient(circle at center, transparent 35%, black 36%)'
          }}
        />

        {/* Merkez Etiketi — mood ikonuyla */}
        <div className="w-5 h-5 rounded-full flex items-center justify-center z-10 transition-colors duration-700"
          style={{ background: selectedMood?.auraColors?.[0] || '#d6a84f' }}>
          {selectedMood?.icon
            ? <selectedMood.icon size={10} strokeWidth={2} className="text-white/90" />
            : <div className="w-1.5 h-1.5 rounded-full bg-[#12100e]" />
          }
        </div>

        {/* Hover Durumunda Icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 rounded-full z-20">
          {muted ? <VolumeX size={18} className="text-amber-500" /> : <Volume2 size={18} className="text-amber-500" />}
        </div>
      </button>
    </div>
  );
}
