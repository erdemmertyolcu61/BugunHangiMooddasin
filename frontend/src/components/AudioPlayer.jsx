import React, { useState, useEffect, useRef, useCallback } from 'react';
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

/* ── Haptic feedback — milestones at 0%, 50%, 100% ── */
function triggerHaptic(vol) {
  // Only fire at boundary values (within tolerance)
  const atBound = vol <= 0.01 || (vol >= 0.49 && vol <= 0.51) || vol >= 0.99;
  if (!atBound) return;
  try {
    if (navigator.vibrate) {
      navigator.vibrate(8); // Android — 8ms micro-pulse
    }
  } catch {}
}

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

  // 2. Ses Durumu Takibi — yalnızca mood varsa polling yap
  useEffect(() => {
    if (!selectedMood) return;
    const interval = setInterval(() => {
      const state = getCurrentMoodAudio();
      setIsPlaying(state.isPlaying);
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedMood]);

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

  // Track if pointer moved significantly (gesture) vs simple tap
  const wasGestureDrag = useRef(false);

  // Vinyl butona tıklanınca:
  // - If it was a drag gesture, ignore the click (volume was already adjusted)
  // - Mobil (hover desteklemeyen ekran): paneli aç/kapat
  // - Desktop: mute toggle
  const handleVinylClick = () => {
    if (wasGestureDrag.current) {
      wasGestureDrag.current = false;
      return; // Ignore — this was a gesture, not a tap
    }
    const isTouchDevice = window.matchMedia('(hover: none)').matches;
    if (isTouchDevice) {
      setPanelOpen(p => !p);
    } else {
      toggleMute();
    }
  };

  /* ── Vertical Pan Gesture on Vinyl — volume control ── */
  const [gestureActive, setGestureActive] = useState(false);
  const [gestureVolume, setGestureVolume] = useState(null); // visual feedback only while dragging
  const gestureStartY = useRef(0);
  const gestureStartVol = useRef(0);
  const lastHapticBucket = useRef(-1); // avoid repeat haptics

  const onPointerDownVinyl = useCallback((e) => {
    gestureStartY.current = e.clientY;
    gestureStartVol.current = volume;
    lastHapticBucket.current = -1;
    wasGestureDrag.current = false;
    setGestureActive(true);

    // Capture pointer for smooth tracking even if finger moves outside element
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [volume]);

  const onPointerMoveVinyl = useCallback((e) => {
    if (!gestureActive) return;
    const deltaY = gestureStartY.current - e.clientY; // up = positive

    // Mark as drag if moved more than 6px (distinguishes tap from gesture)
    if (Math.abs(deltaY) > 6) wasGestureDrag.current = true;

    // 180px drag = full 0→1 range, eased with cubic for premium feel
    const rawDelta = deltaY / 180;
    const eased = Math.sign(rawDelta) * Math.pow(Math.abs(rawDelta), 0.7) * 0.8;
    const newVol = Math.max(0, Math.min(1, gestureStartVol.current + eased));

    setVolume(newVol);
    setMoodAudioVolume(newVol);
    setGestureVolume(newVol);

    if (newVol === 0) setMuted(true);
    else if (muted) setMuted(false);

    // Haptic at 0%, 50%, 100% — fire once per crossing
    const bucket = newVol <= 0.01 ? 0 : newVol >= 0.99 ? 2 : (newVol >= 0.48 && newVol <= 0.52) ? 1 : -1;
    if (bucket >= 0 && bucket !== lastHapticBucket.current) {
      lastHapticBucket.current = bucket;
      triggerHaptic(newVol);
    }
  }, [gestureActive, muted]);

  const onPointerUpVinyl = useCallback((e) => {
    if (!gestureActive) return;
    setGestureActive(false);
    setGestureVolume(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }, [gestureActive]);

  // Aura glow intensity driven by current volume (for gesture visual feedback)
  const glowIntensity = gestureActive ? (gestureVolume ?? volume) : (isPlaying && !muted ? volume : 0);

  if (!selectedMood || location.pathname === '/kafan-mi-karisik') return null;

  return (
    <div
      className="fixed right-3 md:right-6 bottom-[7.5rem] md:bottom-6 z-[95] flex md:items-end gap-3 mb-safe md:mb-0 flex-col-reverse md:flex-row items-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Ses Kontrol Paneli */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10, x: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10, x: 0 }}
            className="relative bg-gradient-to-br from-[#1a1410]/95 to-[#12100e]/95 backdrop-blur-xl border border-amber-500/40 rounded-2xl md:rounded-full md:h-16 flex flex-col md:flex-row items-stretch md:items-center px-3 md:pl-4 md:pr-5 py-3 md:py-0 overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,191,0,0.12)] mb-1 gap-3 md:gap-3.5 min-w-0"
          >
            {/* Plak kenarı parıltısı — üstte ince altın çizgi */}
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent pointer-events-none hidden md:block" />

            {/* Mute / hoparlör */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-amber-500/10 border border-amber-500/30 text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/20 transition-all active:scale-90"
            >
              {muted || volume === 0
                ? <VolumeX size={15} />
                : <Volume2 size={15} />
              }
            </button>

            {/* Şimdi çalıyor */}
            <div className="flex flex-col justify-center min-w-0 max-w-[120px]">
              <div className="flex items-center gap-1.5">
                <span className="flex items-end gap-[2px] h-3">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-[2px] rounded-full bg-amber-400/70"
                      style={{
                        height: isPlaying && !muted ? '100%' : '30%',
                        animation: isPlaying && !muted
                          ? `eqBar 0.9s ${i * 0.15}s ease-in-out infinite alternate`
                          : 'none',
                      }}
                    />
                  ))}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-[0.25em] text-amber-500/45">
                  {isPlaying && !muted ? 'Çalıyor' : 'Duraklatıldı'}
                </span>
              </div>
              <span className="text-[11px] font-serif italic text-amber-100/85 truncate leading-tight mt-0.5">
                {selectedMood?.title || 'Sinema Atmosferi'}
              </span>
            </div>

            {/* Vinyl-groove slider */}
            <div className="flex items-center gap-2.5 shrink-0">
              <input
                type="range"
                min="0" max="1" step="0.02"
                value={muted ? 0 : volume}
                onChange={handleVolume}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={() => {
                  clearTimeout(closeTimer.current);
                  closeTimer.current = setTimeout(() => setPanelOpen(false), 1200);
                }}
                className="vinyl-slider w-16 md:w-24 cursor-pointer"
              />
              <span className="text-[10px] font-bold text-amber-500/55 tabular-nums shrink-0 w-7 text-right">
                {muted ? '0' : Math.round(volume * 100)}
              </span>
            </div>

            {isIOS && (
              <span className="text-[7px] text-amber-500/30 uppercase tracking-wider whitespace-nowrap hidden md:block">
                iOS: hw
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vinyl Disc Butonu — gesture-based volume control */}
      <div className="relative">
        {/* Golden aura glow — expands/shrinks with volume during gesture */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-all"
          style={{
            boxShadow: glowIntensity > 0
              ? `0 0 ${12 + glowIntensity * 28}px ${4 + glowIntensity * 12}px rgba(234,179,8,${0.08 + glowIntensity * 0.22})`
              : 'none',
            transform: `scale(${1 + glowIntensity * 0.12})`,
            transitionDuration: gestureActive ? '50ms' : '500ms',
          }}
        />

        {/* Volume indicator ring — visible during gesture */}
        {gestureActive && (
          <svg
            className="absolute -inset-1.5 pointer-events-none z-30"
            viewBox="0 0 72 72"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(234,179,8,0.12)" strokeWidth="2" />
            <circle
              cx="36" cy="36" r="33" fill="none"
              stroke="rgba(234,179,8,0.75)" strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${(gestureVolume ?? volume) * 207.3} 207.3`}
              style={{ transition: 'stroke-dasharray 60ms ease-out' }}
            />
          </svg>
        )}

        <button
          onClick={handleVinylClick}
          onPointerDown={onPointerDownVinyl}
          onPointerMove={onPointerMoveVinyl}
          onPointerUp={onPointerUpVinyl}
          onPointerCancel={onPointerUpVinyl}
          className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 hover:scale-110 touch-none
            ${gestureActive ? 'scale-105' : 'active:scale-95'}
            ${isPlaying && !muted && !gestureActive ? 'animate-spin-vinyl' : ''}`}
          style={{
            background: 'radial-gradient(circle at center, #d6a84f 0 10%, #1a1a1a 11% 35%, #0a0a0a 36% 100%)',
            border: `2px solid rgba(234, 179, 8, ${gestureActive ? 0.6 : 0.3})`,
            boxShadow: isPlaying && !muted
              ? `0 0 20px ${selectedMood?.auraColors?.[0] || 'rgba(214,168,79,0.4)'}60, 0 10px 30px rgba(0,0,0,0.5)`
              : '0 10px 30px rgba(0,0,0,0.4)',
          }}
          title="Yukarı/aşağı sürükle: ses ayarı"
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

          {/* Hover İkonu — hide during gesture */}
          {!gestureActive && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 rounded-full z-20">
              {muted
                ? <VolumeX size={18} className="text-amber-500" />
                : <Volume2 size={18} className="text-amber-500" />
              }
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
