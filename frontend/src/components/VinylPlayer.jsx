/* ═══════════════════════════════════════════════════════════
   VinylPlayer — Plak şeklinde ambient müzik oynatıcı
   Web Audio API ile her mod için benzersiz ses profili oluşturur.
   Discover sayfasında sağ alt köşede sabit konumda durur.
   ═══════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';

/* ── Her mod için benzersiz ambient ses profili ── */
const AMBIENT_PROFILES = {
  battaniye:    { baseFreq: 180, modRate: 0.3,  filterFreq: 400, type: 'sine',     noiseVol: 0.06 },
  yolculuk:     { baseFreq: 220, modRate: 0.5,  filterFreq: 600, type: 'sine',     noiseVol: 0.08 },
  gece:         { baseFreq: 100, modRate: 0.15, filterFreq: 250, type: 'sine',     noiseVol: 0.10 },
  kahkaha:      { baseFreq: 280, modRate: 0.7,  filterFreq: 800, type: 'triangle', noiseVol: 0.05 },
  gozyasi:      { baseFreq: 150, modRate: 0.2,  filterFreq: 350, type: 'sine',     noiseVol: 0.07 },
  adrenalin:    { baseFreq: 200, modRate: 1.0,  filterFreq: 500, type: 'sawtooth', noiseVol: 0.04 },
  askbahcesi:   { baseFreq: 240, modRate: 0.4,  filterFreq: 550, type: 'sine',     noiseVol: 0.06 },
  zamanyolcusu: { baseFreq: 160, modRate: 0.25, filterFreq: 300, type: 'triangle', noiseVol: 0.12 },
};

function createAmbientAudio(ctx, profile, gainNode) {
  /* Ana osilatör */
  const osc = ctx.createOscillator();
  osc.type = profile.type;
  osc.frequency.value = profile.baseFreq;

  /* LFO — yavaş frekans modülasyonu */
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = profile.modRate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = profile.baseFreq * 0.08;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  /* Lowpass filtre */
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = profile.filterFreq;
  filter.Q.value = 1.5;

  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.15;
  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(gainNode);

  /* İkinci harmonik */
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = profile.baseFreq * 1.498;
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.06;
  osc2.connect(filter);
  filter.connect(osc2Gain);
  osc2Gain.connect(gainNode);

  /* Beyaz gürültü katmanı */
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = profile.filterFreq * 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = profile.noiseVol;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(gainNode);

  osc.start();
  osc2.start();
  lfo.start();
  noise.start();

  return { osc, osc2, lfo, noise };
}

export default function VinylPlayer({ mood, isPlaying, onToggle }) {
  const [volume, setVolume] = useState(0.3);
  const [expanded, setExpanded] = useState(false);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const gainRef = useRef(null);

  const cleanup = useCallback(() => {
    if (nodesRef.current) {
      try { nodesRef.current.osc.stop(); } catch {}
      try { nodesRef.current.osc2.stop(); } catch {}
      try { nodesRef.current.lfo.stop(); } catch {}
      try { nodesRef.current.noise.stop(); } catch {}
      nodesRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      gainRef.current = null;
    }
  }, []);

  /* Mood değiştiğinde yeni audio context oluştur */
  useEffect(() => {
    if (!mood?.id) return;
    cleanup();

    const profile = AMBIENT_PROFILES[mood.id] || AMBIENT_PROFILES.battaniye;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    const nodes = createAmbientAudio(ctx, profile, gain);
    nodesRef.current = nodes;

    if (isPlaying) {
      ctx.resume().then(() => {
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);
      }).catch(() => {});
    } else {
      ctx.suspend().catch(() => {});
    }

    return cleanup;
  }, [mood?.id]);

  /* Play/pause kontrolü */
  useEffect(() => {
    if (!ctxRef.current || !gainRef.current) return;
    if (isPlaying) {
      ctxRef.current.resume().then(() => {
        gainRef.current.gain.linearRampToValueAtTime(volume, ctxRef.current.currentTime + 0.5);
      }).catch(() => {});
    } else {
      gainRef.current.gain.linearRampToValueAtTime(0, ctxRef.current.currentTime + 0.3);
      setTimeout(() => ctxRef.current?.suspend().catch(() => {}), 400);
    }
  }, [isPlaying]);

  /* Volume kontrolü */
  useEffect(() => {
    if (gainRef.current && ctxRef.current && isPlaying) {
      gainRef.current.gain.linearRampToValueAtTime(volume, ctxRef.current.currentTime + 0.1);
    }
  }, [volume]);

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="bg-surface/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 w-52 shadow-2xl"
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-rose/30 mb-3">Şu An Çalıyor</p>
            <p className="text-sm font-serif italic text-ivory/80 mb-4">{mood?.title || 'Müzik'}</p>
            <div className="flex items-center gap-3">
              <VolumeX size={14} className="text-white/30 shrink-0" />
              <input
                type="range"
                min="0" max="0.5" step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="vinyl-slider flex-1"
              />
              <Volume2 size={14} className="text-white/30 shrink-0" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="relative cursor-pointer" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
        {/* Plak diski */}
        <div
          className={`w-[72px] h-[72px] rounded-full vinyl-grooves relative shadow-2xl ${isPlaying ? 'animate-spin-vinyl' : ''}`}
          style={{ boxShadow: `0 0 30px ${mood?.vignette || '#000'}60, 0 4px 20px rgba(0,0,0,0.5)` }}
          onClick={() => setExpanded(!expanded)}
        >
          {/* Merkez etiket */}
          <div className={`absolute inset-0 m-auto w-7 h-7 rounded-full flex items-center justify-center text-base bg-gradient-to-br ${mood?.color || 'from-gray-600 to-gray-800'} shadow-inner`}>
            <span style={{ animation: isPlaying ? 'spinVinyl 3s linear infinite reverse' : 'none' }}>
              {mood?.icon || '🎬'}
            </span>
          </div>
          {/* İğne deliği */}
          <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-bg" />
        </div>

        {/* Play/pause butonu */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber text-bg flex items-center justify-center text-[10px] font-bold shadow-lg hover:scale-110 transition-transform"
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
      </motion.div>
    </div>
  );
}
