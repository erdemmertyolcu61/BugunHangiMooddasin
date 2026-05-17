import { useRef } from 'react';
import { Share2, Download } from 'lucide-react';
import { computeDNA, getDNATitle, DNA_AXES } from '../utils/filmDNA';

// SVG Radar Chart — no external dep needed
function RadarChart({ data, size = 220 }) {
  if (!data) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const n = DNA_AXES.length;
  const levels = 4;

  // Polygon points for a given level
  const levelPoints = (fraction) =>
    DNA_AXES.map((_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return [cx + r * fraction * Math.cos(angle), cy + r * fraction * Math.sin(angle)];
    });

  // User data polygon
  const dataPoints = DNA_AXES.map(({ key }, i) => {
    const val = (data[key] || 0) / 100;
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * val * Math.cos(angle), cy + r * val * Math.sin(angle)];
  });

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';

  // Axis label positions (slightly outside)
  const labelPos = DNA_AXES.map((axis, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lr = r * 1.32;
    return { x: cx + lr * Math.cos(angle), y: cy + lr * Math.sin(angle), label: axis.label };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {[...Array(levels)].map((_, l) => (
        <path
          key={l}
          d={toPath(levelPoints((l + 1) / levels))}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}
      {/* Axis lines */}
      {DNA_AXES.map((_, i) => {
        const tip = levelPoints(1)[i];
        return <line key={i} x1={cx} y1={cy} x2={tip[0]} y2={tip[1]} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <path d={toPath(dataPoints)} fill="rgba(251,191,36,0.18)" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" />
      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#fbbf24" />
      ))}
      {/* Labels */}
      {labelPos.map(({ x, y, label }) => (
        <text
          key={label}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fontWeight="bold"
          fill="rgba(255,255,255,0.5)"
          fontFamily="monospace"
          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

export default function FilmDNA({ tasteMap }) {
  const cardRef = useRef(null);

  const dna = computeDNA(tasteMap?.top_moods || []);
  const { title, emoji } = getDNATitle(dna);
  const confidence = tasteMap?.confidence || 'low';
  const totalMovies = tasteMap?.signals?.total_movies || 0;

  const handleShare = async () => {
    const text = `Film DNA'm: ${emoji} ${title}\n${DNA_AXES.map(a => `${a.label}: ${dna?.[a.key] ?? 0}`).join(' · ')}\nFilm Eleştirmeni'nde keşfet!`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Film DNA — ${title}`, text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch (e) { /* AbortError ignore */ }
  };

  if (confidence === 'low' || totalMovies < 3) {
    return (
      <div className="p-6 rounded-2xl border border-white/8 bg-white/3 text-center">
        <p className="text-4xl mb-3">🧬</p>
        <p className="text-ivory/40 font-serif italic text-sm">
          Film DNA'n için en az 3 film gerekli. Şimdiye kadar {totalMovies} film var.
        </p>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="p-6 sm:p-8 rounded-3xl border border-amber/20 bg-gradient-to-br from-amber-950/20 to-black/40">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber/50 mb-1">Film DNA'n</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <h3 className="text-xl sm:text-2xl font-serif font-bold">{title}</h3>
          </div>
        </div>
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 hover:bg-white/8 transition-all text-[10px] font-bold uppercase tracking-wider"
        >
          <Share2 size={12} /> Paylaş
        </button>
      </div>

      {/* Radar chart */}
      <div className="flex justify-center mb-6">
        <RadarChart data={dna} size={200} />
      </div>

      {/* Değerler */}
      <div className="grid grid-cols-5 gap-2">
        {DNA_AXES.map(({ key, label }) => (
          <div key={key} className="text-center">
            <div className="text-sm sm:text-base font-bold text-amber">{dna?.[key] ?? 0}</div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-ivory/30">{label}</div>
          </div>
        ))}
      </div>

      {/* Top moods */}
      {tasteMap?.top_moods?.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/8 flex flex-wrap gap-2">
          {tasteMap.top_moods.slice(0, 3).map(m => (
            <span key={m.mood_id} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber/10 border border-amber/20 text-amber/70">
              {m.title || m.mood_id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
