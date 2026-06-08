import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════════
   SplashScreen — Liquid-cream latte splash animasyonu.
   Storyboard:
     01  Espresso zemin, üç katmanlı krem dalgalar alttan yükselir
     02  Sinemood mark kremden doğar — sıçrama damlaları + altın glow
     03  Logo ortalanır, "SINEMOOD" serif wordmark belirir
     04  Framer Motion exit ile soft fade-out
   ═══════════════════════════════════════════════════════════════════ */

const SPLASH_KEY = 'fc_splash_seen_v5';   // yeni versiyon — herkes yeni splash'ı görsün
const MARK_SRC   = '/sinemod-mark.png';
const CYCLE_MS   = 3800;                  // animasyon süresi
const SHOW_MS    = 4400;                  // toplam görünme süresi (animasyon + tutma)

// ── Dalga yolu üreteci ──────────────────────────────────────────────
function makeWavePath(totalW, periods, amp, baseY, height) {
  const half = totalW / periods / 2;
  let d = `M 0 ${baseY}`;
  let x = 0;
  let up = true;
  for (let i = 0; i < periods * 2; i++) {
    const nx = x + half;
    const cy = baseY + (up ? -amp : amp);
    d += ` C ${(x + half * 0.42).toFixed(1)} ${cy.toFixed(1)} ${(nx - half * 0.42).toFixed(1)} ${cy.toFixed(1)} ${nx.toFixed(1)} ${baseY.toFixed(1)}`;
    x = nx;
    up = !up;
  }
  d += ` L ${totalW} ${height} L 0 ${height} Z`;
  return d;
}

// ── Dalga katman konfigürasyonları ──────────────────────────────────
const W = 1440;
const WAVE_LAYERS = [
  { periods: 3, amp: 46, baseY: 170, h: 600, cls: 'splsh-wave-back',
    grad: [['0%','#6a4326'],['40%','#3c2616'],['100%','#1c1009']] },
  { periods: 4, amp: 38, baseY: 150, h: 600, cls: 'splsh-wave-mid',
    grad: [['0%','#caa06a'],['38%','#9a6c3e'],['100%','#3a2415']] },
  { periods: 5, amp: 30, baseY: 130, h: 600, cls: 'splsh-wave-front',
    grad: [['0%','#f3dcb4'],['30%','#dcb27e'],['64%','#b07c44'],['100%','#5e3c20']] },
];

// ── Sıçrama damlası konfigürasyonları (sabit, render-arası tutarlı) ──
function makeDroplets(count = 16) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    arr.push({
      dx: (18 + Math.sin(i * 2.7) * 50) * side,
      dy: -(60 + Math.cos(i * 1.9) * 130),
      size: 3 + (i * 1.7) % 7,
      delay: (i * 0.04) % 0.5,
    });
  }
  return arr;
}
const DROPLETS = makeDroplets(16);

// ── Toz parçacıkları ────────────────────────────────────────────────
function makeDust(count = 10) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      size: 1 + (i * 0.7) % 2.2,
      left: 38 + (i * 7.3) % 24,
      top: 32 + (i * 5.1) % 20,
      delay: (i * 0.18) % 1.5,
    });
  }
  return arr;
}
const DUST = makeDust(10);

// ── Bileşen ─────────────────────────────────────────────────────────
export default function SplashScreen() {
  // sessionStorage kontrolü useState içinde — StrictMode'da bile tek çalışır
  const [show, setShow] = useState(() => {
    if (sessionStorage.getItem(SPLASH_KEY)) return false;
    sessionStorage.setItem(SPLASH_KEY, '1');
    return true;
  });

  // Timer — StrictMode'da effect çift çalışsa bile cleanup+re-run güvenli
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setShow(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [show]);

  // Dalga SVG path'leri hesapla
  const wavePaths = useMemo(() =>
    WAVE_LAYERS.map(l => makeWavePath(W * 2, l.periods, l.amp, l.baseY, l.h)), []
  );

  // Edge highlight yolu (front layer)
  const edgePath = useMemo(() => {
    const l = WAVE_LAYERS[2]; // front
    const totalW = W * 2, half = totalW / l.periods / 2;
    let d = `M 0 ${l.baseY}`, x = 0, up = true;
    for (let i = 0; i < l.periods * 2; i++) {
      const nx = x + half;
      const cy = l.baseY + (up ? -l.amp : l.amp);
      d += ` C ${(x + half * 0.42).toFixed(1)} ${cy.toFixed(1)} ${(nx - half * 0.42).toFixed(1)} ${cy.toFixed(1)} ${nx.toFixed(1)} ${l.baseY.toFixed(1)}`;
      x = nx; up = !up;
    }
    return d;
  }, []);

  const dur = `${CYCLE_MS}ms`;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash-liquid"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.85, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-[9999]"
          style={{ backgroundColor: '#0a0605' }}
        >
          {/* ── Keyframe stili (bileşene yerel, unmount ile gider) ── */}
          <style>{`
            /* Ambient keylight */
            .splsh-keylight {
              position:absolute; left:50%; top:38%;
              width:120vmin; height:120vmin;
              transform:translate(-50%,-50%) scale(0.55);
              background:radial-gradient(circle,rgba(255,180,90,0.22) 0%,rgba(255,150,70,0.06) 35%,transparent 62%);
              opacity:0; mix-blend-mode:screen; pointer-events:none;
              animation:splshKeyBloom ${dur} ease-in-out forwards;
            }
            @keyframes splshKeyBloom {
              0%,12% { opacity:0; transform:translate(-50%,-50%) scale(0.55); }
              35%    { opacity:1; transform:translate(-50%,-50%) scale(1); }
              100%   { opacity:0.85; transform:translate(-50%,-50%) scale(1.04); }
            }

            /* Liquid group rise */
            .splsh-liquid {
              position:absolute; left:0; right:0; bottom:0; height:100%;
              transform:translateY(102%);
              animation:splshLiquidRise ${dur} cubic-bezier(0.16,1,0.3,1) forwards;
              will-change:transform;
            }
            @keyframes splshLiquidRise {
              0%   { transform:translateY(102%); }
              26%  { transform:translateY(52%); }
              40%  { transform:translateY(58%); }
              60%  { transform:translateY(56%); }
              100% { transform:translateY(57%); }
            }

            /* Wave layers */
            .splsh-wave { position:absolute; left:0; bottom:0; width:200%; will-change:transform; transform:translateZ(0); }
            .splsh-wave-back  { height:92vh; opacity:0.85; animation:splshDrift1 22s linear infinite; }
            .splsh-wave-mid   { height:84vh; opacity:0.95; animation:splshDrift2 17s linear infinite; }
            .splsh-wave-front { height:74vh; animation:splshDrift1 13s linear infinite; }
            @keyframes splshDrift1 { from{transform:translateX(0)} to{transform:translateX(-50%)} }
            @keyframes splshDrift2 { from{transform:translateX(-50%)} to{transform:translateX(0)} }

            /* Logo rise */
            .splsh-logo {
              position:absolute; left:50%; top:42%;
              width:min(42vmin,200px);
              transform:translate(-50%,-50%);
              z-index:6;
            }
            @media(min-width:900px){ .splsh-logo{top:45%;width:min(22vmin,220px)} }
            .splsh-rise {
              display:block; transform-origin:50% 70%;
              animation:splshLogoRise ${dur} cubic-bezier(0.16,1,0.3,1) forwards;
              will-change:transform,opacity;
            }
            @keyframes splshLogoRise {
              0%,18% { opacity:0; transform:translateY(55%) scale(0.82); }
              36%    { opacity:1; transform:translateY(-4%) scale(1.05); }
              52%    { opacity:1; transform:translateY(0) scale(1); }
              100%   { opacity:1; transform:translateY(-1%) scale(1.002); }
            }

            .splsh-mark-clip {
              border-radius:50%; overflow:hidden;
            }
            .splsh-mark {
              display:block; width:100%; height:auto;
              filter:drop-shadow(0 0 40px rgba(255,180,90,0.45)) drop-shadow(0 0 80px rgba(255,150,60,0.2));
              user-select:none; -webkit-user-select:none;
              transform:scale(1.15);
            }

            /* Shine overlay */
            .splsh-shine {
              position:absolute; inset:0; overflow:hidden;
              opacity:0; mix-blend-mode:screen; pointer-events:none;
              animation:splshShineOp ${dur} ease-in-out forwards;
            }
            .splsh-shine::before {
              content:''; position:absolute; top:0; left:-100%; width:60%; height:100%;
              background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.35) 50%,transparent 70%);
              animation:splshShineSlide ${dur} ease-in-out forwards;
            }
            @keyframes splshShineOp {
              0%,38% { opacity:0; } 45% { opacity:1; } 60%,100% { opacity:0; }
            }
            @keyframes splshShineSlide {
              0%,38% { left:-100%; } 60% { left:160%; } 100% { left:160%; }
            }

            /* Meniscus glow */
            .splsh-meniscus {
              position:absolute; left:50%; bottom:-6%; width:150%; height:26%;
              transform:translateX(-50%);
              background:radial-gradient(ellipse at center,rgba(255,210,140,0.5) 0%,rgba(255,170,90,0.12) 45%,transparent 70%);
              filter:blur(6px); mix-blend-mode:screen;
              opacity:0; animation:splshMenis ${dur} ease-in-out forwards;
            }
            @keyframes splshMenis {
              0%,22% { opacity:0; } 36% { opacity:1; } 100% { opacity:0.65; }
            }

            /* Droplets */
            .splsh-splash { position:absolute; left:50%; top:50%; width:0; height:0; z-index:5; pointer-events:none; }
            .splsh-drop {
              position:absolute; left:0; top:0;
              width:var(--s); height:var(--s);
              margin-left:calc(var(--s)/-2); margin-top:calc(var(--s)/-2);
              border-radius:50%;
              background:radial-gradient(circle at 35% 30%,#fff4dd 0%,#f0c98e 45%,#c98a4a 100%);
              box-shadow:0 0 calc(var(--s)*0.9) rgba(255,190,110,0.7);
              opacity:0;
              animation:splshDropArc ${dur} cubic-bezier(0.3,0.5,0.4,1) forwards;
              animation-delay:var(--delay);
            }
            @keyframes splshDropArc {
              0%,20% { opacity:0; transform:translate(0,0) scale(0.4); }
              26%    { opacity:1; transform:translate(calc(var(--dx)*0.4),calc(var(--dy)*0.55)) scale(1); }
              38%    { opacity:1; transform:translate(var(--dx),var(--dy)) scale(0.9); }
              52%    { opacity:0; transform:translate(calc(var(--dx)*1.25),18vmin) scale(0.5); }
              100%   { opacity:0; transform:translate(calc(var(--dx)*1.25),18vmin) scale(0.5); }
            }

            /* Dust */
            .splsh-dust {
              position:absolute; border-radius:50%;
              background:rgba(255,210,150,0.8);
              box-shadow:0 0 6px rgba(255,190,120,0.9);
              opacity:0; animation:splshDustFloat ${dur} ease-in-out forwards;
            }
            @keyframes splshDustFloat {
              0%,25% { opacity:0; transform:translateY(0); }
              50%    { opacity:0.85; }
              80%    { opacity:0.4; transform:translateY(-28px); }
              100%   { opacity:0.3; transform:translateY(-38px); }
            }

            /* Wordmark */
            .splsh-wordmark {
              position:absolute; left:0; right:0; text-align:center; z-index:7;
              top:calc(42% + min(24vmin,140px));
              opacity:0; animation:splshWordIn ${dur} ease-out forwards;
            }
            @media(min-width:900px){ .splsh-wordmark{top:calc(45% + min(14vmin,150px))} }
            @keyframes splshWordIn {
              0%,48% { opacity:0; transform:translateY(14px); letter-spacing:0.5em; }
              65%    { opacity:0.85; transform:translateY(2px); letter-spacing:0.36em; }
              80%    { opacity:1; transform:translateY(0); letter-spacing:0.34em; }
              100%   { opacity:1; transform:translateY(0); letter-spacing:0.34em; }
            }
            .splsh-name {
              font-family:'Cormorant Garamond',serif; font-weight:600;
              font-size:clamp(22px,5.2vmin,40px);
              letter-spacing:0.34em; padding-left:0.34em;
              color:transparent;
              background:linear-gradient(180deg,#fbe7c0 0%,#e6b870 55%,#c79248 100%);
              -webkit-background-clip:text; background-clip:text;
              filter:drop-shadow(0 2px 14px rgba(255,180,90,0.28));
            }
            .splsh-tag {
              margin-top:10px;
              font-family:'Cormorant Garamond',serif; font-style:italic;
              font-size:clamp(11px,1.6vmin,14px);
              letter-spacing:0.16em; color:rgba(243,220,180,0.5);
            }

            /* Grain */
            .splsh-grain {
              position:absolute; inset:0; z-index:8; pointer-events:none;
              opacity:0.05; mix-blend-mode:overlay;
              background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.7'/></svg>");
            }

            @media(prefers-reduced-motion:reduce){
              .splsh-liquid{animation:none;transform:translateY(54%)}
              .splsh-wave-back,.splsh-wave-mid,.splsh-wave-front{animation:none}
              .splsh-rise{animation:none;opacity:1;transform:none}
              .splsh-keylight{animation:none;opacity:0.7;transform:translate(-50%,-50%) scale(1)}
              .splsh-wordmark{animation:none;opacity:1;transform:none}
              .splsh-meniscus{animation:none;opacity:0.6}
              .splsh-drop,.splsh-dust{display:none}
              .splsh-shine{display:none}
            }
          `}</style>

          {/* Espresso vignette bg */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(120% 90% at 50% 30%, #1c0f08 0%, #0d0705 55%, #070403 100%)',
            }}
          />

          {/* Keylight */}
          <div className="splsh-keylight" />

          {/* Liquid cream waves */}
          <div className="splsh-liquid">
            {WAVE_LAYERS.map((layer, idx) => (
              <div key={idx} className={`splsh-wave ${layer.cls}`}>
                <svg
                  viewBox={`0 0 ${W * 2} ${layer.h}`}
                  preserveAspectRatio="none"
                  style={{ display: 'block', width: '100%', height: '100%' }}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`splshWG${idx}`} x1="0" y1="0" x2="0" y2="1">
                      {layer.grad.map(([offset, color], si) => (
                        <stop key={si} offset={offset} stopColor={color} />
                      ))}
                    </linearGradient>
                  </defs>
                  <path d={wavePaths[idx]} fill={`url(#splshWG${idx})`} />
                  {idx === 2 && (
                    <path
                      d={edgePath}
                      fill="none"
                      stroke="#ffe9c2"
                      strokeWidth="3"
                      opacity="0.5"
                      style={{ filter: 'blur(2px)', mixBlendMode: 'screen' }}
                    />
                  )}
                </svg>
              </div>
            ))}
          </div>

          {/* Splash droplets */}
          <div className="splsh-splash">
            {DROPLETS.map((d, i) => (
              <div
                key={i}
                className="splsh-drop"
                style={{
                  '--dx': `${d.dx.toFixed(0)}px`,
                  '--dy': `${d.dy.toFixed(0)}px`,
                  '--s': `${d.size.toFixed(1)}px`,
                  '--delay': `${d.delay.toFixed(2)}s`,
                }}
              />
            ))}
          </div>

          {/* Logo mark */}
          <div className="splsh-logo">
            <div className="splsh-meniscus" />
            <div className="splsh-rise">
              <div className="splsh-mark-clip">
                <img
                  className="splsh-mark"
                  src={MARK_SRC}
                  alt="Sinemood"
                  draggable={false}
                />
                <div className="splsh-shine" />
              </div>
            </div>
          </div>

          {/* Wordmark */}
          <div className="splsh-wordmark">
            <div className="splsh-name">SINEMOOD</div>
            <div className="splsh-tag">bugün hangi mooddasın?</div>
          </div>

          {/* Dust particles */}
          {DUST.map((d, i) => (
            <div
              key={i}
              className="splsh-dust"
              style={{
                width: d.size, height: d.size,
                left: `${d.left}%`, top: `${d.top}%`,
                animationDelay: `${d.delay.toFixed(2)}s`,
              }}
            />
          ))}

          {/* Grain */}
          <div className="splsh-grain" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
