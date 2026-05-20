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

function triggerHaptic(vol) {
  const atBound = vol <= 0.01 || (vol >= 0.49 && vol <= 0.51) || vol >= 0.99;
  if (!atBound) return;
  try { if (navigator.vibrate) navigator.vibrate(8); } catch {}
}

export default function AudioPlayer() {
  const location = useLocation();
  const { selectedMood } = useMood();

  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Mobil algılama
  const [isTouchOnly] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  );
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [hovered, setHovered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const showPanel = isTouchOnly ? panelOpen : (hovered || panelOpen);
  const closeTimer = useRef(null);

  // Panel mobilde otomatik kapanma
  useEffect(() => {
    if (panelOpen) {
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setPanelOpen(false), 2500);
    }
    return () => clearTimeout(closeTimer.current);
  }, [panelOpen]);

  // Mood & route bazlı oynatma
  useEffect(() => {
    if (location.pathname === '/kafan-mi-karisik') {
      stopMoodAudio(); return;
    }
    if (selectedMood) playMoodAudio(selectedMood.id);
    else stopMoodAudio();
  }, [selectedMood, location.pathname]);

  // Ses durumu takibi
  useEffect(() => {
    if (!selectedMood) return;
    const interval = setInterval(() => {
      setIsPlaying(getCurrentMoodAudio().isPlaying);
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedMood]);

  const toggleMute = useCallback(() => {
    if (muted) { setMuted(false); setMoodAudioVolume(volume); }
    else { setMuted(true); setMoodAudioVolume(0); }
  }, [muted, volume]);

  const handleVolume = useCallback((v) => {
    const vol = Math.max(0, Math.min(1, v));
    setVolume(vol);
    setMoodAudioVolume(vol);
    if (vol === 0) setMuted(true);
    else if (muted) setMuted(false);
  }, [muted]);

  if (!selectedMood || location.pathname === '/kafan-mi-karisik') return null;

  // ═══════════════ MOBİL: dikey ses barı ═══════════════
  if (isTouchOnly) {
    return <MobileVolumeBar volume={volume} muted={muted} isPlaying={isPlaying} onChange={handleVolume} onToggleMute={toggleMute} />;
  }

  // ═══════════════ MASAÜSTÜ: plak + panel ═══════════════
  const wasGestureDrag = useRef(false);

  const handleVinylClick = () => { if (wasGestureDrag.current) { wasGestureDrag.current = false; return; } toggleMute(); };

  const [gestureActive, setGestureActive] = useState(false);
  const [gestureVolume, setGestureVolume] = useState(null);
  const gestureStartY = useRef(0);
  const gestureStartVol = useRef(0);
  const lastHapticBucket = useRef(-1);

  const onPointerDownVinyl = useCallback((e) => {
    gestureStartY.current = e.clientY;
    gestureStartVol.current = volume;
    lastHapticBucket.current = -1;
    wasGestureDrag.current = false;
    setGestureActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [volume]);

  const onPointerMoveVinyl = useCallback((e) => {
    if (!gestureActive) return;
    const deltaY = gestureStartY.current - e.clientY;
    if (Math.abs(deltaY) > 6) wasGestureDrag.current = true;
    const rawDelta = deltaY / 180;
    const eased = Math.sign(rawDelta) * Math.pow(Math.abs(rawDelta), 0.7) * 0.8;
    const newVol = Math.max(0, Math.min(1, gestureStartVol.current + eased));
    setVolume(newVol); setMoodAudioVolume(newVol); setGestureVolume(newVol);
    if (newVol === 0) setMuted(true);
    else if (muted) setMuted(false);
    const bucket = newVol <= 0.01 ? 0 : newVol >= 0.99 ? 2 : (newVol >= 0.48 && newVol <= 0.52) ? 1 : -1;
    if (bucket >= 0 && bucket !== lastHapticBucket.current) { lastHapticBucket.current = bucket; triggerHaptic(newVol); }
  }, [gestureActive, muted]);

  const onPointerUpVinyl = useCallback((e) => {
    if (!gestureActive) return;
    setGestureActive(false); setGestureVolume(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }, [gestureActive]);

  const glowIntensity = gestureActive ? (gestureVolume ?? volume) : (isPlaying && !muted ? volume : 0);

  return (
    <div
      className="fixed right-6 bottom-6 z-[95] flex items-end gap-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, width: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, width: 'auto', scale: 1, x: 0 }}
            exit={{ opacity: 0, width: 0, scale: 0.9, x: 20 }}
            className="relative bg-gradient-to-br from-[#1a1410]/95 to-[#12100e]/95 backdrop-blur-xl border border-amber-500/40 rounded-full h-16 flex items-center pl-4 pr-5 overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,191,0,0.12)] mb-1 gap-3.5"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent pointer-events-none" />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-amber-500/10 border border-amber-500/30 text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/20 transition-all active:scale-90"
            >
              {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <div className="flex flex-col justify-center min-w-0 max-w-[120px]">
              <div className="flex items-center gap-1.5">
                <span className="flex items-end gap-[2px] h-3">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-[2px] rounded-full bg-amber-400/70" style={{
                      height: isPlaying && !muted ? '100%' : '30%',
                      animation: isPlaying && !muted ? `eqBar 0.9s ${i * 0.15}s ease-in-out infinite alternate` : 'none',
                    }} />
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
            <div className="flex items-center gap-2.5 shrink-0">
              <input type="range" min="0" max="1" step="0.02"
                value={muted ? 0 : volume}
                onChange={(e) => { const v = parseFloat(e.target.value); handleVolume(v); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="vinyl-slider w-24 cursor-pointer" />
              <span className="text-[10px] font-bold text-amber-500/55 tabular-nums shrink-0 w-7 text-right">
                {muted ? '0' : Math.round(volume * 100)}
              </span>
            </div>
            {isIOS && <span className="text-[7px] text-amber-500/30 uppercase tracking-wider whitespace-nowrap">iOS: hw</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <div className="absolute inset-0 rounded-full pointer-events-none transition-all" style={{
          boxShadow: glowIntensity > 0 ? `0 0 ${12 + glowIntensity * 28}px ${4 + glowIntensity * 12}px rgba(234,179,8,${0.08 + glowIntensity * 0.22})` : 'none',
          transform: `scale(${1 + glowIntensity * 0.12})`,
          transitionDuration: gestureActive ? '50ms' : '500ms',
        }} />
        {gestureActive && (
          <svg className="absolute -inset-1.5 pointer-events-none z-30" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(234,179,8,0.12)" strokeWidth="2" />
            <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(234,179,8,0.75)" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={`${(gestureVolume ?? volume) * 207.3} 207.3`} style={{ transition: 'stroke-dasharray 60ms ease-out' }} />
          </svg>
        )}
        <button
          onClick={handleVinylClick} onPointerDown={onPointerDownVinyl} onPointerMove={onPointerMoveVinyl}
          onPointerUp={onPointerUpVinyl} onPointerCancel={onPointerUpVinyl}
          className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 hover:scale-110 touch-none ${gestureActive ? 'scale-105' : 'active:scale-95'} ${isPlaying && !muted && !gestureActive ? 'animate-spin-vinyl' : ''}`}
          style={{
            background: 'radial-gradient(circle at center, #d6a84f 0 10%, #1a1a1a 11% 35%, #0a0a0a 36% 100%)',
            border: `2px solid rgba(234, 179, 8, ${gestureActive ? 0.6 : 0.3})`,
            boxShadow: isPlaying && !muted ? `0 0 20px ${selectedMood?.auraColors?.[0] || 'rgba(214,168,79,0.4)'}60, 0 10px 30px rgba(0,0,0,0.5)` : '0 10px 30px rgba(0,0,0,0.4)',
          }} title="Yukarı/aşağı sürükle: ses ayarı">
          <div className="absolute inset-0 rounded-full opacity-20 pointer-events-none" style={{
            background: 'repeating-radial-gradient(circle at center, transparent 0, transparent 2px, #fff 3px, transparent 4px)',
            maskImage: 'radial-gradient(circle at center, transparent 35%, black 36%)', WebkitMaskImage: 'radial-gradient(circle at center, transparent 35%, black 36%)',
          }} />
          <div className="w-5 h-5 rounded-full flex items-center justify-center z-10 transition-colors duration-700" style={{ background: selectedMood?.auraColors?.[0] || '#d6a84f' }}>
            {selectedMood?.icon ? <selectedMood.icon size={10} strokeWidth={2} className="text-white/90" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#12100e]" />}
          </div>
          {!gestureActive && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 rounded-full z-20">
              {muted ? <VolumeX size={18} className="text-amber-500" /> : <Volume2 size={18} className="text-amber-500" />}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MOBİL: Dikey Ses Barı — saf, sade, hızlı
   ═══════════════════════════════════════════════════════════════ */
function MobileVolumeBar({ volume, muted, isPlaying, onChange, onToggleMute }) {
  const barRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const getVolFromY = useCallback((clientY) => {
    if (!barRef.current) return volume;
    const rect = barRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    return 1 - Math.max(0, Math.min(1, y / rect.height));
  }, [volume]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    const vol = getVolFromY(e.clientY);
    onChange(vol);
    try { barRef.current?.setPointerCapture(e.pointerId); } catch {}
  }, [getVolFromY, onChange]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const vol = getVolFromY(e.clientY);
    onChange(vol);
  }, [dragging, getVolFromY, onChange]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const fillPercent = muted ? 0 : Math.round(volume * 100);

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[95] flex flex-col items-center justify-end pointer-events-none"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Dikey bar */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-5 flex-1 my-3 rounded-full pointer-events-auto touch-none cursor-pointer select-none"
        style={{
          background: 'rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 0 6px rgba(0,0,0,0.4)',
        }}
        role="slider"
        aria-label="Ses seviyesi"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fillPercent}
      >
        {/* Ses dolgusu — alttan yukarı amber */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-75"
          style={{
            height: `${fillPercent}%`,
            background: 'linear-gradient(to top, #ffbf00cc, #ffd700)',
            boxShadow: '0 0 12px rgba(255,178,80,0.3)',
            borderRadius: dragging ? '8px' : '8px 8px 4px 4px',
          }}
        />

        {/* Ses seviyesi göstergesi (ortada) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none font-bold text-[9px] tabular-nums"
          style={{
            top: '40%',
            color: muted ? 'rgba(255,178,80,0.3)' : 'rgba(255,178,80,0.7)',
            textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}
        >
          {fillPercent}
        </div>
      </div>

      {/* Sessize alma butonu */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
        className="pointer-events-auto w-8 h-8 mb-2 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        style={{
          background: muted ? 'rgba(255,255,255,0.05)' : 'rgba(255,178,80,0.12)',
          border: `1px solid ${muted ? 'rgba(255,255,255,0.1)' : 'rgba(255,178,80,0.25)'}`,
        }}
        aria-label={muted ? 'Sesi aç' : 'Sessize al'}
      >
        {muted || volume === 0
          ? <VolumeX size={13} className="text-white/40" />
          : <Volume2 size={13} className="text-amber-400" />
        }
      </button>
    </div>
  );
}
