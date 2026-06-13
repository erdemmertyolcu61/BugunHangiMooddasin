import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Send, Check } from 'lucide-react';
import { getWeeklyChallenge, respondToChallenge, searchMovies, isLoggedIn } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return 'az önce';
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
}

export default function WeeklyChallenge() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const loggedIn = isLoggedIn();

  useEffect(() => {
    getWeeklyChallenge().then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      searchMovies(query).then((d) => setResults(d?.results?.slice(0, 5) || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const submit = useCallback(async () => {
    if (!selected || sending) return;
    setSending(true);
    try {
      await respondToChallenge(selected.id || selected.tmdb_id, comment);
      setData((d) => d ? { ...d, my_response: { tmdb_id: selected.id || selected.tmdb_id, comment, movie_title: selected.title, poster_url: selected.poster_path ? `https://image.tmdb.org/t/p/w92${selected.poster_path}` : '' } } : d);
      setShowForm(false);
      setQuery('');
      setSelected(null);
      setComment('');
    } catch { /* */ }
    setSending(false);
  }, [selected, comment, sending]);

  if (!data) return null;

  return (
    <section className="rounded-2xl bg-gradient-to-br from-amber-900/15 to-transparent border border-amber/15 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-amber" />
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber/60">Haftanın Sorusu</p>
      </div>

      <p className="font-serif text-[15px] sm:text-base text-ivory/90 leading-relaxed mb-4">
        {data.question}
      </p>

      {data.my_response ? (
        <div className="flex items-center gap-2.5 mb-3 p-2.5 rounded-xl bg-green-500/8 border border-green-500/15">
          <Check size={14} className="text-green-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] text-green-400/80 font-semibold truncate">
              Cevabın: {data.my_response.movie_title}
            </p>
            {data.my_response.comment && (
              <p className="text-[11px] text-white/40 truncate">{data.my_response.comment}</p>
            )}
          </div>
        </div>
      ) : loggedIn && !showForm ? (
        <button onClick={() => setShowForm(true)}
          className="mb-3 px-4 py-2 rounded-full bg-amber/15 border border-amber/25 text-amber text-[11px] font-bold uppercase tracking-wider hover:bg-amber/25 transition-all">
          Cevapla
        </button>
      ) : null}

      {showForm && (
        <div className="mb-4 space-y-2.5">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Film ara..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[13px] max-sm:text-[16px] text-ivory/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber/40"
          />
          {results.length > 0 && !selected && (
            <div className="rounded-xl bg-[#1a1310] border border-white/10 overflow-hidden">
              {results.map((m) => (
                <button key={m.id} onClick={() => { setSelected(m); setQuery(m.title); setResults([]); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-all text-left">
                  {m.poster_path && (
                    <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt=""
                      className="w-7 h-10 rounded object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] text-ivory/80 truncate">{m.title}</p>
                    <p className="text-[10px] text-white/30">{m.release_date?.slice(0, 4)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Neden bu film? (opsiyonel)"
                maxLength={200}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[12px] max-sm:text-[16px] text-ivory/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber/40"
              />
              <button onClick={submit} disabled={sending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber/20 text-amber text-[11px] font-bold hover:bg-amber/30 disabled:opacity-40 transition-all">
                <Send size={12} /> Gönder
              </button>
            </>
          )}
        </div>
      )}

      {data.responses?.length > 0 && (
        <div className="space-y-2 mt-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-1.5">
            Topluluk Cevapları · {data.response_count}
          </p>
          {data.responses.slice(0, 6).map((r) => (
            <div key={r.id} className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full overflow-hidden bg-white/10 shrink-0 ring-1 ring-amber/10">
                {r.avatar
                  ? <img src={resolveAvatarUrl(r.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  : <span className="w-full h-full flex items-center justify-center text-[9px] font-bold text-amber/60">{(r.username || '?')[0].toUpperCase()}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-amber/60">@{r.username}</span>
                <span className="text-[11px] text-ivory/70 ml-1.5">{r.movie_title}</span>
                {r.comment && <p className="text-[10px] text-white/35 truncate">{r.comment}</p>}
              </div>
              <span className="text-[9px] text-white/15 shrink-0">{timeAgo(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
