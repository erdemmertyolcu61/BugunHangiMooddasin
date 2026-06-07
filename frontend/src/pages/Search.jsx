/**
 * Global Arama Sayfası — /search?q=...
 * Ana sayfadan erişilir. Sonuçlar TMDB araması; bir filme tıklayınca
 * mevcut Discover modal akışı için /discover?film={id}'ye yönlendirir.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Search as SearchIcon, X } from 'lucide-react';
import { searchMovies, proxyImageUrl } from '../services/api';
import LottieAnimation from '../components/LottieAnimation';
import useDocumentMeta from '../utils/useDocumentMeta';

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

export default function SearchPage() {
  const navigate = useNavigate();
  useDocumentMeta({
    title: 'Film Ara | Sinemood',
    description: 'Binlerce film arasında ara, Üstad’ın notlarıyla keşfet.',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const runSearch = useCallback((q) => {
    clearTimeout(debounce.current);
    // Bayatlamış aramayı iptal et (her yeni sorgu öncekini durdurur)
    if (abortRef.current) abortRef.current.abort();
    if (!q.trim()) { setResults(null); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const data = await searchMovies(q, { signal: ctrl.signal });
        setResults(data.movies || []);
      } catch (e) {
        // İptal edilen istek bir hata değildir — sonuçları silme
        if (e?.name !== 'AbortError') setResults([]);
      } finally {
        // Yalnızca hâlâ güncel istek isek loading'i kapat
        if (abortRef.current === ctrl) setLoading(false);
      }
    }, 400);
  }, []);

  // İlk yüklemede URL'deki q ile ara
  useEffect(() => {
    if (initialQ) runSearch(initialQ);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    setSearchParams(v.trim() ? { q: v } : {}, { replace: true });
    runSearch(v);
  };

  const clear = () => {
    setQuery('');
    setResults(null);
    setSearchParams({}, { replace: true });
    inputRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen bg-[#120d0b] text-ivory font-sans relative">
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      <header className="sticky top-0 z-50 bg-[#120d0b]/98 border-b border-white/5 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center gap-3 sm:gap-5">
          <button onClick={() => navigate(-1)}
            className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
            <ChevronLeft size={22} />
          </button>
          <div className="relative flex-1">
            <SearchIcon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ivory/25" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={onChange}
              placeholder="Film ara — isim, konu, yönetmen..."
              aria-label="Film ara"
              className="w-full pl-11 pr-11 py-3.5 bg-white/5 border border-white/10 rounded-full text-[15px] text-ivory placeholder:text-ivory/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus:border-amber/50 focus:bg-white/[0.07] transition-all"
            />
            {query && (
              <button onClick={clear}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ivory/25 hover:text-ivory/60 transition-colors">
                <X size={17} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-nav">
        {/* Boş durum */}
        {results === null && !loading && (
          <div className="flex flex-col items-center justify-center text-center py-24 sm:py-32 gap-5">
            <LottieAnimation
              path="/lottie/search-empty.json"
              className="w-28 h-28"
              speed={0.7}
            />
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-ivory mb-2">Ne aramıştın evlat?</h2>
              <p className="font-sans text-sm text-ivory/40 max-w-xs leading-relaxed">
                Aklındaki filmi yaz — Üstad'ın arşivinde bulalım.
              </p>
            </div>
          </div>
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        )}

        {/* Sonuç yok */}
        {!loading && results !== null && results.length === 0 && (
          <div className="flex flex-col items-center text-center py-24 sm:py-32 gap-4">
            <LottieAnimation
              path="/lottie/empty-state.json"
              className="w-24 h-24 opacity-60"
              speed={0.6}
            />
            <p className="font-serif text-xl sm:text-2xl italic text-ivory/40">
              &ldquo;{query}&rdquo; için bir şey bulamadım evlat.
            </p>
            <p className="font-sans text-sm text-ivory/25 mt-1">Başka bir isimle dene.</p>
          </div>
        )}

        {/* Sonuçlar */}
        {!loading && results !== null && results.length > 0 && (
          <>
            <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-ivory/30 mb-6">
              {results.length} sonuç
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
              {results.map((m, i) => (
                <motion.button
                  key={m.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.4) }}
                  onClick={() => navigate(`/discover?film=${m.id}`)}
                  className="group text-left"
                  title={m.title}
                >
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-amber/40 transition-all duration-500 shadow-lg">
                    <img
                      src={proxyImageUrl(m.poster_url || (m.poster_path ? `${IMG_BASE}${m.poster_path}` : null)) || 'https://via.placeholder.com/300x450'}
                      alt={m.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                  <p className="mt-2.5 text-[13px] font-sans font-semibold text-ivory/70 group-hover:text-amber transition-colors line-clamp-2 leading-tight">
                    {m.title}
                  </p>
                  {m.release_date && (
                    <p className="text-[11px] text-ivory/25 font-sans mt-0.5">{m.release_date.split('-')[0]}</p>
                  )}
                </motion.button>
              ))}
            </div>
          </>
        )}
      </main>
    </motion.div>
  );
}
