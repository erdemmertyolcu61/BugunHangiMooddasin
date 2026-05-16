/**
 * MusicPanel — floating settings panel (bottom-left) with auto-play toggle.
 */
import { useState, useEffect } from 'react';
import { moodSynth, MOOD_PRESETS } from '../services/music';

const MOODS = [
  { key: 'Eğlenceli',  color: '#7A8A5C' },
  { key: 'Melankolik', color: '#3B5475' },
  { key: 'Gergin',     color: '#A23E2C' },
  { key: 'Çerezlik',   color: '#C76E2A' },
  { key: 'Ağır Dram',  color: '#2E2820' },
  { key: 'Heyecanlı',  color: '#E8B84A' },
];

function EqBars({ active, color }) {
  return (
    <span className="eq w-[22px]" data-active={active ? 'on' : 'off'}>
      {[0,1,2,3].map(i => (
        <span key={i} className="eq-bar" style={{ background: color, animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}

export default function MusicPanel({ autoPlay, onAutoPlayChange }) {
  const [open, setOpen] = useState(() => localStorage.getItem('music-panel-open') === '1');
  const [state, setState] = useState({ mood: null, playing: false, volume: 0.6 });

  useEffect(() => moodSynth.on(setState), []);
  useEffect(() => { localStorage.setItem('music-panel-open', open ? '1' : '0'); }, [open]);

  const preset = state.mood ? MOOD_PRESETS[state.mood] : null;
  const accent = preset?.color || '#A23E2C';

  const togglePlay = () => {
    if (state.playing) moodSynth.setMuted(true);
    else if (state.mood) moodSynth.setMuted(false);
    else { moodSynth.setMuted(false); moodSynth.play('Melankolik'); }
  };

  const pickMood = (m) => { moodSynth.setMuted(false); moodSynth.play(m); };

  return (
    <>
      {/* Floating toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-5 left-5 z-[60] flex items-center gap-3 rounded-full border border-ink py-2 pl-2 pr-4 font-mono text-[11px] tracking-[1px] shadow-[0_4px_14px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-0.5 ${
          open ? 'bg-ink text-paper-cream' : 'bg-paper-cream text-ink'
        }`}
        style={{ '--accent': accent }}
      >
        <span className={`grid h-[30px] w-[30px] place-items-center rounded-full ${state.playing ? 'vinyl-spin' : ''}`}
              style={{ background: 'radial-gradient(circle at 30% 30%, #3a3530 0%, #1c1814 70%)' }}>
          <span className="block h-[11px] w-[11px] rounded-full shadow-[0_0_0_1.5px_rgba(0,0,0,0.4)]" style={{ background: accent }} />
        </span>
        <span>{state.playing ? `♪ ${state.mood}` : `MÜZİK · ${open ? 'kapat' : 'ayarlar'}`}</span>
      </button>

      {open && (
        <div className="fixed bottom-[72px] left-5 z-[59] w-80 rounded-[10px] border border-ink bg-paper-cream font-mono shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
             style={{ animation: 'musicSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-3">
            <div className="text-[10px] font-semibold tracking-[1.5px] text-accent">SES / MOD-BAZLI</div>
            <button onClick={() => setOpen(false)} className="grid h-6 w-6 place-items-center rounded-full text-[11px] text-ink-mute hover:bg-ink hover:text-paper-cream">✕</button>
          </div>

          <div className="flex items-center gap-3 border-b border-dashed border-line bg-white/35 p-4">
            <EqBars active={state.playing} color={accent} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.8px] text-ink">{state.mood ? state.mood.toUpperCase() : 'SESSİZ'}</div>
              <div className="mt-0.5 text-[10px] text-ink-mute">{preset?.label || 'henüz bir mod seçilmedi'}</div>
            </div>
            <button onClick={togglePlay} className="grid h-9 w-9 place-items-center rounded-full text-[13px] text-paper-cream transition-transform hover:scale-105" style={{ background: accent }}>
              {state.playing ? '❚❚' : '▶'}
            </button>
          </div>

          <div className="border-b border-dashed border-line p-4">
            <div className="mb-2.5 flex items-center justify-between text-[10px] tracking-[1.5px] text-ink-mute">
              <span>SES SEVİYESİ</span>
              <span className="text-[11px] font-semibold text-ink">{Math.round(state.volume * 100)}</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01" value={state.volume}
              onChange={(e) => moodSynth.setVolume(parseFloat(e.target.value))}
              className="music-slider w-full"
              style={{ '--track-color': accent }}
            />
          </div>

          <div className="border-b border-dashed border-line p-4">
            <div className="mb-1 flex items-center justify-between text-[10px] tracking-[1.5px] text-ink-mute">
              <span>OTOMATİK MOD</span>
              <button
                onClick={() => onAutoPlayChange(!autoPlay)}
                className="relative h-[18px] w-8 rounded-full transition-colors"
                style={{ background: autoPlay ? 'var(--color-accent)' : 'var(--color-line)' }}
              >
                <span className="absolute left-0.5 top-0.5 h-[14px] w-[14px] rounded-full bg-paper-cream transition-transform" style={{ transform: autoPlay ? 'translateX(14px)' : 'translateX(0)' }} />
              </button>
            </div>
            <p className="mt-1 font-sans text-[10px] italic text-ink-mute">
              {autoPlay ? 'bir filme tıkladığında modu otomatik çalar.' : 'yalnızca elle seçtiğin modu çalar.'}
            </p>
          </div>

          <div className="p-4">
            <div className="mb-2.5 text-[10px] tracking-[1.5px] text-ink-mute">MODA GÖRE ÇAL</div>
            <div className="grid grid-cols-2 gap-1.5">
              {MOODS.map(m => {
                const active = state.mood === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => pickMood(m.key)}
                    className="flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors"
                    style={{
                      borderColor: active ? m.color : 'var(--color-line)',
                      background: active ? `color-mix(in srgb, ${m.color} 12%, var(--color-paper-cream))` : 'rgba(255,255,255,0.3)',
                      boxShadow: active ? `1px 1px 0 ${m.color}` : 'none',
                    }}
                  >
                    <span className="block h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
                    <span className="text-[10.5px] font-semibold tracking-[0.3px] text-ink">{m.key}</span>
                    <span className="text-[9px] tracking-[0.3px] text-ink-mute">{MOOD_PRESETS[m.key]?.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-dashed border-line px-4 py-2.5 text-[9px] tracking-[1px] text-ink-mute">
            <span>SİNTH · WEB AUDIO · v1.0</span>
            <button onClick={() => moodSynth.stop()} className="font-semibold text-accent hover:underline">DURDUR</button>
          </div>
        </div>
      )}
    </>
  );
}
