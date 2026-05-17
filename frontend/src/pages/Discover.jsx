import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMood } from '../context/MoodContext';
import { ChevronLeft, ChevronRight, Star, Bookmark, Book, Sparkles, X, Plus, Check, Brain, Heart, ArrowUpDown, BookmarkPlus, Eye, Share2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addToWatchlist, removeFromWatchlist, toggleWatched, searchMovies, repositoryMovies, proxyImageUrl } from '../services/api';
import { checkBackendHealth } from '../utils/apiConfig';
import { QUESTIONS, MOOD_NAMES, calculateQuizResult, getResultMessage } from '../utils/moodQuiz';
import UpcomingSlider from '../components/UpcomingSlider';
import { getApiUrl } from '../utils/apiConfig';

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';         // Grid posters (küçük, hızlı)
const IMG_BASE_LG = 'https://image.tmdb.org/t/p/original';  // Modal detail poster (tam kalite)

// Caching logic using localStorage (V3 as per Master Prompt)
const getCachedAnalysis = (id) => {
  const cached = localStorage.getItem(`analysis_v3_${id}`);
  return cached ? JSON.parse(cached) : null;
};
const setCachedAnalysis = (id, data) => {
  localStorage.setItem(`analysis_v3_${id}`, JSON.stringify(data));
};

// TMDB vote_average az oyda şişer (2 oy → 10.0). Güvenilir puanı seç:
// IMDb varsa onu, yoksa yeterli oy sayısı olan TMDB ortalamasını göster.
const reliableRating = (movie) => {
  if (movie.imdb_rating) {
    const n = parseFloat(movie.imdb_rating);
    if (!isNaN(n) && n > 0) return n.toFixed(1);
  }
  const avg = movie.vote_average;
  if (avg == null || avg <= 0) return null;
  const count = movie.vote_count;
  if (count != null) {
    return count >= 50 ? avg.toFixed(1) : null;
  }
  // Oy sayısı bilinmiyorsa: 9.0 üzeri ortalamalar genelde az oydan gelir, güvenme
  return avg <= 9.0 ? avg.toFixed(1) : null;
};

const SkeletonGurme = () => (
  <div className="space-y-6 py-6 w-full animate-pulse">
    <div className="h-4 bg-white/10 rounded-full w-3/4" />
    <div className="h-4 bg-white/10 rounded-full w-full" />
    <div className="h-4 bg-white/10 rounded-full w-5/6" />
    <div className="h-4 bg-white/10 rounded-full w-2/3" />
  </div>
);

const MovieCardSkeleton = () => (
  <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/10 animate-pulse h-[400px]">
    <div className="h-2/3 bg-white/10" />
    <div className="p-4 space-y-3">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-3 bg-white/10 rounded w-1/2" />
      <div className="pt-4 flex justify-between">
        <div className="h-6 w-16 bg-white/10 rounded-full" />
        <div className="h-6 w-16 bg-white/10 rounded-full" />
      </div>
    </div>
  </div>
);

export default function Discover() {
  const navigate = useNavigate();
  const { selectedMood, selectMood, fetchMoodMovies } = useMood();
  console.log("[Discover] Render, selectedMood:", selectedMood?.id);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('recommended');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Quiz state
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizResult, setQuizResult] = useState(null);
  const lastRequestId = useRef(0);
  const searchTimeout = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoAnalyzeTriggered = useRef(false);
  const filmSectionRef = useRef(null);

  // Quick-action state (card overlay buttons — no modal needed)
  const [quickSavedIds, setQuickSavedIds] = useState(new Set());
  const [quickWatchedIds, setQuickWatchedIds] = useState(new Set());

  // KafanMıKarisik'tan gelen ?analyze=<movieId> parametresini oku
  useEffect(() => {
    const analyzeId = searchParams.get('analyze');
    if (!analyzeId || autoAnalyzeTriggered.current) return;
    autoAnalyzeTriggered.current = true;

    // URL'den parametreyi temizle
    searchParams.delete('analyze');
    setSearchParams(searchParams, { replace: true });

    // Film bilgisini API'den çek ve modal aç
    const fetchAndAnalyze = async () => {
      try {
        const res = await fetch(getApiUrl(`/api/movies/${analyzeId}/analyze`));
        if (!res.ok) throw new Error('Film bulunamadı');
        const data = await res.json();
        const movieObj = {
          id: parseInt(analyzeId),
          title: data.title || 'Film',
          poster_url: data.poster_url,
          poster_path: data.poster_path,
          release_date: data.release_date,
          vote_average: data.vote_average,
          overview: data.overview,
          ...data,
        };
        setCachedAnalysis(parseInt(analyzeId), data);
        setSelectedMovie(movieObj);
      } catch (err) {
        console.error('[Discover] Auto-analyze hatası:', err);
      }
    };
    fetchAndAnalyze();
  }, [searchParams, setSearchParams]);

  // Mood Match percentage calculation
  // Quiz handlers
  const handleQuizAnswer = (ansIdx) => {
    const newAnswers = [...quizAnswers];
    newAnswers[quizStep - 1] = ansIdx;
    setQuizAnswers(newAnswers);
    if (quizStep < QUESTIONS.length) {
      setQuizStep(quizStep + 1);
    } else {
      setQuizResult(calculateQuizResult(newAnswers));
      setQuizStep(QUESTIONS.length + 1);
    }
  };

  const closeQuiz = () => {
    setQuizOpen(false);
    setQuizStep(0);
    setQuizAnswers([]);
    setQuizResult(null);
  };

  const navigateFromQuiz = (moodId) => {
    closeQuiz();
    selectMood(moodId);
    // Sayfa zaten /discover, mood değişince useEffect yeniden fetch yapar
  };

  // Sort dropdown click-outside handler
  useEffect(() => {
    const handleClick = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') setSortOpen(false); };
    if (sortOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEsc);
    }
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleEsc); };
  }, [sortOpen]);

  const SORT_OPTIONS = [
    { value: 'recommended', label: 'Önerilen' },
    { value: 'rating_desc', label: 'Puan: Yüksekten Düşüğe' },
    { value: 'rating_asc', label: 'Puan: Düşükten Yükseğe' },
    { value: 'mood_desc', label: "Mood'a Uyum: Yüksekten Düşüğe" },
    { value: 'mood_asc', label: "Mood'a Uyum: Düşükten Yükseğe" },
    { value: 'newest', label: 'En Yeni' },
    { value: 'oldest', label: 'En Eski' },
  ];

  const handleSortSelect = (value) => {
    setSortBy(value);
    setCurrentPage(1);
    setSortOpen(false);
  };

  const getMoodMatch = (movieId, moodId) => {
    // A stable pseudo-random percentage based on movie and mood IDs
    const seed = (movieId * 13 + (moodId?.length || 7) * 7) % 100;
    return Math.max(75, seed); // Gurme always recommends 75% or higher match
  };

  useEffect(() => {
    setCurrentPage(1);
    setSearchResults(null);
    setSearchQuery('');
  }, [selectedMood?.id, sortBy]);

  useEffect(() => {
    if (!selectedMood) return;

    const fetchData = async () => {
      const requestId = ++lastRequestId.current;
      setLoading(true);
      setError(null);

      try {
        const moviesData = await fetchMoodMovies(selectedMood.id, currentPage, sortBy);
        
        // Skip if this is a stale request
        if (requestId !== lastRequestId.current) return;

        // Check if backend is still seeding
        if (moviesData.seeding) {
          setError("Film arşivi hazırlanıyor... Lütfen 10 saniye bekleyip tekrar deneyin.");
          setMovies([]);
          setTimeout(() => {
            setCurrentPage(1);
          }, 10000);
          return;
        }

        // Enrich movies with match percentage
        const enriched = (moviesData.movies || []).map(m => ({
            ...m,
            match: getMoodMatch(m.id, selectedMood?.id)
        }));
        
        setMovies(enriched);
        setTotalPages(moviesData.total_pages || 1);

        // Perdede başlığına scroll — filmleri üstten görmeye başlar
        if (currentPage === 1) {
          requestAnimationFrame(() => {
            filmSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      } catch (err) {
        if (requestId !== lastRequestId.current) return;
        console.error("[MoodSelection] Error loading movies:", err);
        const msg = err.message || String(err);
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ERR_CONNECTION_REFUSED")) {
          setError("Sinema arşivine ulaşılamıyor. Backend (8002) çalışmıyor. Proje kökünde 'python start.py' komutunu çalıştırın.");
        } else if (msg.includes("502") || msg.includes("500") || msg.includes("Bad Gateway")) {
          setError("Sunucu yanıt vermedi. 5 saniye bekleyip tekrar deneyin veya terminalden 'python start.py' komutunu çalıştırın.");
          setTimeout(() => setCurrentPage(1), 5000);
        } else if (msg.includes("500") || msg.includes("Internal Server")) {
          setError("Sunucu hatası. Terminaldeki hata mesajlarını kontrol edin.");
        } else {
          setError(`Filmler yüklenemedi: ${msg.substring(0, 120)}`);
        }
      } finally {
        if (requestId === lastRequestId.current) {
          // Smooth loading transition
          setTimeout(() => setLoading(false), 300);
        }
      }
    };
    fetchData();
  }, [currentPage, selectedMood?.id, sortBy, refreshKey, fetchMoodMovies]);

  const handleAnalyze = async (movie) => {
    setSelectedMovie(movie);
    const cached = getCachedAnalysis(movie.id);
    if (cached) {
      setSelectedMovie({ ...movie, ...cached });
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const res = await fetch(getApiUrl(`/api/movies/${movie.id}/analyze`));
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      const enrichedData = { ...movie, ...data };
      setCachedAnalysis(movie.id, data);
      setSelectedMovie(enrichedData);
      if (data.in_watchlist) {
        setSavedIds(prev => new Set([...prev, movie.id]));
      }
    } catch (err) {
      console.error('Analiz hatası:', err);
      setError("Film analizi yapılamadı. API bağlantısını kontrol edin.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults(null); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await searchMovies(query);
        const enriched = (data.movies || []).map(m => ({
            ...m,
            match: getMoodMatch(m.id, selectedMood?.id)
        }));
        setSearchResults(enriched);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 400);
  };

  const handleSaveToJournal = async () => {
    if (!selectedMovie) return;
    try {
        await addToWatchlist(selectedMovie);
        setSavedIds(prev => new Set([...prev, selectedMovie.id]));
    } catch (err) {
        console.error('Deftere eklenemedi:', err);
    }
  };

  const [shareCopied, setShareCopied] = useState(false);
  const handleShare = async () => {
    if (!selectedMovie) return;
    const BACKEND = getApiUrl('').replace('/api', '');
    const shareUrl = `${BACKEND}/share/${selectedMovie.id}`;
    const analysis = selectedMovie.ai_analysis?.replace('Üstadın Notu:', '').trim() || '';
    const shareData = {
      title: `${selectedMovie.title} — Film Eleştirmeni`,
      text: analysis ? `"${analysis.slice(0, 120)}..."` : 'Film Eleştirmeni\'nde izle.',
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    }
  };

  // Quick actions — card overlay, no modal
  const handleQuickSave = async (e, movie) => {
    e.stopPropagation();
    const isSaved = quickSavedIds.has(movie.id);
    if (isSaved) {
      // Tekrar basınca defterden çıkar (toggle)
      setQuickSavedIds(prev => {
        const next = new Set(prev);
        next.delete(movie.id);
        return next;
      });
      setQuickWatchedIds(prev => {
        const next = new Set(prev);
        next.delete(movie.id);
        return next;
      });
      try { await removeFromWatchlist(movie.id); } catch (err) { console.error('Quick remove hatası:', err); }
      return;
    }
    setQuickSavedIds(prev => new Set([...prev, movie.id]));
    try { await addToWatchlist(movie); } catch (err) { console.error('Quick save hatası:', err); }
  };

  const handleQuickWatched = async (e, movie) => {
    e.stopPropagation();
    const nowWatched = !quickWatchedIds.has(movie.id);
    setQuickWatchedIds(prev => {
      const next = new Set(prev);
      if (nowWatched) next.add(movie.id); else next.delete(movie.id);
      return next;
    });
    // Also ensure it's in watchlist
    if (!quickSavedIds.has(movie.id)) {
      setQuickSavedIds(prev => new Set([...prev, movie.id]));
      try { await addToWatchlist(movie); } catch {}
    }
    try { await toggleWatched(movie.id); } catch (err) { console.error('Quick watched hatası:', err); }
  };


  const displayMovies = searchResults !== null ? searchResults : movies;

  // 1. Loading State (Initial)
  if (loading && movies.length === 0 && !error && selectedMood) {
    return (
      <div className="min-h-screen bg-[#120d0b] p-8 pt-24">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="h-8 bg-white/10 rounded w-1/4 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-8">
            {[...Array(10)].map((_, i) => <MovieCardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  // 2. Missing Mood State — ama ?analyze parametresi varsa film yükleniyor demektir, bekle
  if (!selectedMood && !selectedMovie) {
    const pendingAnalyze = searchParams.get('analyze') || autoAnalyzeTriggered.current;
    if (pendingAnalyze) {
      // Film yükleniyor — loading göster
      return (
        <div className="min-h-screen bg-[#120d0b] flex flex-col items-center justify-center gap-8">
          <div className="w-16 h-16 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
          <p className="text-amber/60 text-lg font-serif italic animate-pulse">Film yükleniyor...</p>
        </div>
      );
    }
    console.warn("[Discover] No mood selected.");
    return (
      <div className="min-h-screen bg-[#120d0b] flex flex-col items-center justify-center gap-8">
        <p className="text-amber text-2xl font-serif italic">Atmosfer kaybolmuş gibi görünüyor...</p>
        <button
          onClick={() => navigate('/')}
          className="px-8 py-4 bg-amber text-bg rounded-full font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(255,191,0,0.2)]"
        >
          Anasayfaya Dön ve Tekrar Seç
        </button>
      </div>
    );
  }

  // 2b. Mood yok ama selectedMovie var (KafanMıKarisik'tan ?analyze ile gelindi)
  if (!selectedMood && selectedMovie) {
    return (
      <div className="min-h-screen bg-[#120d0b] text-[#f5f2eb] relative">
        {/* Film Detay Modal — mood'suz */}
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 md:p-12">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setSelectedMovie(null); navigate('/'); }} />
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-6xl h-full sm:h-fit max-h-screen sm:max-h-[90vh] bg-[#1a1a1a]/95 sm:bg-[#1a1a1a]/90 backdrop-blur-md border border-white/10 rounded-none sm:rounded-[3rem] p-5 sm:p-12 md:p-16 pt-safe pb-nav sm:pb-12 shadow-2xl overflow-y-auto no-scrollbar"
            >
              <button onClick={() => { setSelectedMovie(null); navigate(-1); }} className="absolute top-4 right-4 sm:top-10 sm:right-10 z-[110] w-11 h-11 flex items-center justify-center rounded-full bg-black/50 sm:bg-transparent text-ivory/50 sm:text-ivory/20 hover:text-amber transition-colors">
                <X size={26} />
              </button>
              <div className="flex flex-col md:flex-row gap-6 sm:gap-16 relative z-10">
                <div className="w-[60%] sm:w-full md:w-[35%] shrink-0 aspect-[2/3] max-h-none mx-auto relative rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-2xl">
                  <img
                    src={proxyImageUrl(selectedMovie.poster_url || (selectedMovie.poster_path ? `${IMG_BASE_LG}${selectedMovie.poster_path}` : null)) || 'https://via.placeholder.com/500x750'}
                    className="w-full h-full object-cover"
                    alt={selectedMovie.title}
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-6 sm:space-y-12">
                  <header className="space-y-4 sm:space-y-6">
                    <p className="text-[10px] sm:text-[12px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.5em] text-amber/40">FİLM ÖZETİ</p>
                    <h2 className="text-[28px] sm:text-5xl lg:text-7xl font-serif font-bold tracking-tight leading-[1.1] sm:leading-[1.05] break-words">{selectedMovie.title}</h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-6 pt-2 sm:pt-4">
                      <span className="text-sm sm:text-xl font-serif italic text-ivory/30">{selectedMovie.release_date?.split('-')[0]}</span>
                      <div className="h-1 w-1 bg-white/20 rounded-full" />
                      <span className="text-sm sm:text-xl font-serif italic text-ivory/30">{selectedMovie.runtime || '90+'} Dakika</span>
                      <div className="h-1 w-1 bg-white/20 rounded-full" />
                      <span className="text-sm sm:text-xl font-serif italic text-ivory/30">{selectedMovie.genres?.join(', ') || 'Sinema'}</span>
                    </div>
                  </header>
                  <div className="space-y-8">
                    <p className="text-base sm:text-2xl font-serif leading-relaxed text-ivory/80 italic">
                      {selectedMovie.overview || "Bu yapıt hakkında henüz bir özet bulunmuyor..."}
                    </p>
                  </div>
                  <div className="p-6 sm:p-16 rounded-[1.5rem] sm:rounded-[4rem] bg-black/40 border border-white/5 relative shadow-inner">
                    {isAnalyzing
                      ? <div className="flex flex-col items-center gap-6 sm:gap-8 py-8 sm:py-10">
                          <SkeletonGurme />
                          <p className="text-lg sm:text-2xl font-serif italic text-ivory/40 animate-pulse">Üstad notlarını hazırlıyor...</p>
                        </div>
                      : <>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/40 mb-4 sm:mb-6">Üstadın Notu</p>
                          <p className="text-lg sm:text-4xl font-serif italic leading-relaxed sm:leading-[1.2] text-ivory tracking-tight first-letter:text-4xl sm:first-letter:text-7xl first-letter:float-left first-letter:mr-3 sm:first-letter:mr-4 first-letter:font-bold first-letter:text-amber">
                            {selectedMovie.ai_analysis || "Üstad bu başyapıt için notlarını hazırlıyor... Birazdan burada olacak."}
                          </p>
                        </>
                    }
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-12 border-t border-white/5 pt-8 sm:pt-16">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Üstat</p>
                      <p className="text-lg sm:text-2xl font-serif text-ivory/80">{selectedMovie.director || 'Bilinmiyor'}</p>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Zamanın Ruhu</p>
                      <p className="text-lg sm:text-2xl font-serif text-ivory/80">{selectedMovie.genres?.slice(0, 2).join(', ')}</p>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Küresel yankı</p>
                      <p className="text-2xl sm:text-3xl font-serif font-bold text-amber">★ {reliableRating(selectedMovie) ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 pt-4">
                    <button
                      onClick={handleSaveToJournal}
                      disabled={savedIds.has(selectedMovie.id)}
                      className={`flex-1 py-6 rounded-full text-[10px] font-bold uppercase tracking-[0.4em] transition-all duration-700 flex items-center justify-center gap-4 ${
                        savedIds.has(selectedMovie.id)
                          ? 'bg-amber/10 text-amber border border-amber/30 cursor-default'
                          : 'bg-amber text-bg hover:scale-[1.02] shadow-[0_20px_50px_-10px_rgba(255,191,0,0.3)]'
                      }`}
                    >
                      {savedIds.has(selectedMovie.id) ? <><Check size={16} /> DEFTERE EKLENDİ</> : <><Plus size={16} /> DEFTERİME KAYDET</>}
                    </button>
                    <button
                      onClick={() => { setSelectedMovie(null); navigate(-1); }}
                      className="px-8 sm:px-12 py-4 sm:py-6 rounded-full text-[10px] font-bold uppercase tracking-[0.25em] sm:tracking-[0.4em] border border-white/10 hover:bg-white/5 transition-all"
                    >
                      Geri Dön
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // 3. Error State (API Failed)
  if (error && movies.length === 0) {
    return (
      <div className="min-h-screen bg-[#120d0b] flex flex-col items-center justify-center gap-8 px-6 text-center">
        <p className="text-rose-500 text-2xl font-serif italic">{error}</p>
        <div className="space-y-4">
          <p className="text-ivory/40 text-sm max-w-md">
            Üstad bu aralar biraz yorgun. Backend bağlantısını (8002) kontrol edip tekrar denemek ister misiniz?
          </p>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={async () => {
                setError(null);
                setLoading(true);
                setMovies([]);
                const ok = await checkBackendHealth();
                if (ok) { setCurrentPage(1); setRefreshKey(k => k + 1); }
                else { setError('Backend (8002) çalışmıyor. Proje kökünde terminalden "python start.py" çalıştırın.'); setLoading(false); }
              }}
              className="px-8 py-4 bg-amber text-bg rounded-full font-bold uppercase text-[10px] tracking-widest hover:scale-105 transition-all"
            >
              Tekrar Dene
            </button>
            <button 
              onClick={() => navigate('/')} 
              className="px-8 py-4 border border-white/10 text-ivory/60 rounded-full font-bold uppercase text-[10px] tracking-widest hover:border-amber/30 hover:text-amber transition-all"
            >
              Ana Sayfa
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      key={selectedMood.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={`min-h-screen bg-[#120d0b] text-[#f5f2eb] relative font-sans mood-${selectedMood.id}`}
    >
      <div className="vignette vignette-active" />

      {/* ═══ MOOD GEÇİŞ ANİMASYONLARI ═══ */}
      {/* Gradient Yıkama Efekti — mood değiştiğinde tam ekran gradient parlayıp söner */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`wash-${selectedMood.id}`}
          initial={{ opacity: 0.7, scale: 1.2 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}
          className={`fixed inset-0 z-30 pointer-events-none bg-gradient-to-br ${selectedMood.color}`}
        />
      </AnimatePresence>

      {/* Mood İkon Giriş — büyük ikon ortada belirip küçülerek kaybolur */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`icon-${selectedMood.id}`}
          initial={{ opacity: 0.9, scale: 2.5 }}
          animate={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center"
        >
          {selectedMood.icon && (
            <selectedMood.icon
              size={160}
              strokeWidth={0.8}
              className="text-amber/40 drop-shadow-[0_0_60px_rgba(255,191,0,0.3)]"
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Sürekli Vignette — mood rengine göre kenarlarda hafif gölge */}
      <div
        className="fixed inset-0 pointer-events-none z-10 transition-all duration-1000"
        style={{
          background: `radial-gradient(circle, transparent 20%, ${selectedMood.vignette || '#000'} 150%)`,
          opacity: 0.25,
        }}
      />

      {/* Paper texture */}
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      <header className="sticky top-0 z-[60] bg-[#120d0b]/98 border-b border-white/5 shadow-lg pt-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => navigate('/')} className="p-3 -ml-1 hover:bg-white/5 rounded-full transition-all tap-target flex items-center justify-center">
              <ChevronLeft size={24} />
            </button>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-[#e8d3d3]/30 mb-0.5 sm:mb-1">ŞU ANKİ MODUN</p>
              <h1 className="font-serif text-lg sm:text-xl font-bold flex items-center gap-2 sm:gap-3 truncate">
                <span className="text-amber-500 shrink-0">{selectedMood.icon && <selectedMood.icon size={24} strokeWidth={1.5} />}</span>
                <span className="truncate">{selectedMood.title}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative flex-1 md:flex-none">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Arşivde ara..."
                    className="w-full md:w-64 px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-sm text-[#f5f2eb] placeholder:text-white/20 focus:outline-none focus:border-amber/60 transition-all md:focus:w-80"
                />
            </div>
            <button onClick={() => navigate('/kafan-mi-karisik')} className="hidden md:flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 border border-white/10 rounded-full hover:scale-105 transition-all group animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-bg">Kafan mı Karışık?</span>
            </button>
            <button onClick={() => { setQuizOpen(true); setQuizStep(1); setQuizAnswers([]); setQuizResult(null); }}
              className="flex items-center gap-2 px-4 md:px-5 py-3 bg-amber/90 hover:bg-amber text-bg rounded-full hover:scale-105 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] shrink-0 tap-target">
              <Brain size={16} className="text-bg/80 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Bugünkü Ruh Halim</span>
            </button>
            <button onClick={() => navigate('/defterim')} className="hidden md:flex items-center gap-2 px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 transition-all group">
              <Book size={16} className="text-amber group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Defterim</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-14 sm:space-y-24 pb-nav md:pb-32">
        {/* Gelecek Program Slider */}
        {searchResults === null && currentPage === 1 && (
            <motion.section 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1 }}
            >
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-sm font-bold uppercase tracking-[0.6em] text-ivory/20">Yakında</h2>
                </div>
                <UpcomingSlider />
            </motion.section>
        )}

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="p-7 sm:p-12 md:p-16 rounded-[2rem] sm:rounded-[4rem] bg-surface/40 backdrop-blur-md border border-white/10 relative overflow-hidden group gurme-border shadow-2xl">
            <div className={`absolute inset-0 bg-gradient-to-r ${selectedMood.color} opacity-20 transition-opacity duration-1000 group-hover:opacity-30`} />
            <div className="relative z-10 max-w-4xl">
              <p className="text-xl sm:text-3xl md:text-4xl font-serif italic leading-relaxed tracking-tight text-ivory/90 mb-6 sm:mb-8">"{selectedMood.intro}"</p>
              
              {/* Gurme Notu - Yukarıdan süzülerek gelir */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.8 }}
                className="border-l-2 border-amber-500/50 pl-4 sm:pl-6"
              >
                <p className="text-base sm:text-xl md:text-2xl font-serif text-amber-500/90 italic tracking-wide">
                  {selectedMood.gurmeNote}
                </p>
              </motion.div>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="space-y-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div ref={filmSectionRef} className="flex items-center justify-between flex-wrap gap-3 sm:gap-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold tracking-tighter">
              {searchResults !== null
                ? (searchLoading ? 'Üstad arşivde bakınıyor...' : `"${searchQuery}" Seçkisi`)
                : 'Perdede'}
            </h2>
            {/* Sort controls - custom dropdown */}
            {searchResults === null && (
              <div className="relative" ref={sortRef}>
                <button
                  onClick={() => setSortOpen(!sortOpen)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-amber-400/45 bg-black/45 backdrop-blur-sm text-amber-100/80 hover:text-amber-50 hover:border-amber-300/60 hover:bg-amber-950/20 transition-all text-[10px] font-bold uppercase tracking-[0.14em] focus:outline-none focus:ring-2 focus:ring-amber-400/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                >
                  <ArrowUpDown size={13} className="text-amber-400/60" />
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Önerilen'}
                  <ChevronRight size={12} className={`text-amber-400/50 transition-transform duration-200 ${sortOpen ? 'rotate-90' : ''}`} />
                </button>

                {sortOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-amber-400/30 bg-[#120d0a]/98 backdrop-blur-md shadow-2xl shadow-black/50">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleSortSelect(opt.value)}
                        className={`w-full px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] transition-all ${
                          sortBy === opt.value
                            ? 'bg-amber-500/18 text-amber-200 font-semibold'
                            : 'text-stone-400 hover:bg-amber-500/10 hover:text-amber-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 sm:gap-x-10 gap-y-8 sm:gap-y-16">
            {loading && searchResults === null
              ? [...Array(10)].map((_, i) => <div key={i} className="aspect-[2/3] bg-white/5 rounded-[2.5rem] animate-pulse" />)
              : displayMovies.length === 0
                ? <div className="col-span-5 py-40 text-center">
                    {error ? (
                      <div className="space-y-4">
                        <p className="text-amber text-3xl font-serif italic">{error}</p>
                        <p className="text-ivory/40 text-sm">
                          İpucu: Backend'i başlatmak için <code>python start.py</code> komutunu kullanın. 
                          Eğer port 8002 çakışması varsa terminaldeki talimatları izleyin.
                        </p>
                      </div>
                    ) : (
                      <p className="text-ivory/20 font-serif italic text-3xl">Üstad bu arama için uygun bir başyapıt bulamadı...</p>
                    )}
                  </div>
                : displayMovies.map((movie) => (
                  <div key={movie.id} className="group cursor-pointer relative" onClick={() => handleAnalyze(movie)}>
                    <div className="ticket-card aspect-[2/3] group-hover:scale-[1.03] group-hover:-translate-y-4">
                      {movie.poster_url || movie.poster_path
                        ? <img
                            src={proxyImageUrl(movie.poster_url || `${IMG_BASE}${movie.poster_path}`)}
                            className="w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
                            loading="lazy"
                            decoding="async"
                          />
                        : <div className={`artistic-fallback w-full h-full p-12`}>
                            <h3 className="text-2xl font-serif font-bold italic text-amber">{movie.title}</h3>
                          </div>}
                          
                        {/* Mood Uyum Overlay */}
                        <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-10 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-500 sm:transform sm:-translate-x-4 sm:group-hover:translate-x-0">
                            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-amber flex items-center gap-1.5 sm:gap-2">
                                <Sparkles size={10} /> %{movie.mood_score || movie.match}
                            </p>
                        </div>

                        {/* Hızlı Eylem Butonları — mobilde her zaman görünür */}
                        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-2 p-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:translate-y-2 sm:group-hover:translate-y-0">
                          <button
                            onClick={(e) => handleQuickSave(e, movie)}
                            title="Deftere Ekle"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all duration-200 active:scale-95
                              ${quickSavedIds.has(movie.id)
                                ? 'bg-amber/90 border-amber/60 text-black'
                                : 'bg-black/70 border-white/20 text-white/80 hover:bg-amber/80 hover:text-black hover:border-amber/50'
                              }`}
                          >
                            {quickSavedIds.has(movie.id)
                              ? <><Check size={10} /> Eklendi</>
                              : <><BookmarkPlus size={10} /> Deftere</>
                            }
                          </button>
                          <button
                            onClick={(e) => handleQuickWatched(e, movie)}
                            title="İzledim"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all duration-200 active:scale-95
                              ${quickWatchedIds.has(movie.id)
                                ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                                : 'bg-black/70 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
                              }`}
                          >
                            {quickWatchedIds.has(movie.id)
                              ? <><Check size={10} /> İzledim</>
                              : <><Eye size={10} /> İzledim</>
                            }
                          </button>
                        </div>
                    </div>
                    <div className="mt-3 sm:mt-5 px-1 sm:px-4">
                      <h3 className="text-[15px] sm:text-lg font-sans font-semibold text-ivory leading-tight line-clamp-2 mb-1.5">
                        {movie.title}
                      </h3>
                      <div className="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-ivory/50">{movie.release_date?.split('-')[0]}</span>
                        {reliableRating(movie) != null && (
                          <div className="flex items-center gap-1.5">
                              <Star size={10} className="fill-amber text-amber" />
                              <span className="text-xs font-bold text-ivory/70">{reliableRating(movie)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>

          {searchResults === null && totalPages > 1 && (
            <div className="flex items-center justify-center gap-10 pt-20">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/10 rounded-full disabled:opacity-10 hover:bg-amber hover:text-bg transition-all duration-500"
              >
                ←
              </button>
              <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-ivory/20 mb-2">Sayfa</span>
                  <span className="text-lg font-serif italic text-amber">{currentPage} / {totalPages}</span>
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/10 rounded-full disabled:opacity-10 hover:bg-amber hover:text-bg transition-all duration-500"
              >
                →
              </button>
            </div>
          )}
        </motion.section>
      </main>

      {/* Film Detay Modal - Master Overlay Edition */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 md:p-12">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedMovie(null)} />
            <motion.div
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative w-full max-w-6xl h-full sm:h-fit max-h-screen sm:max-h-[90vh] bg-[#1a1a1a]/95 sm:bg-[#1a1a1a]/90 backdrop-blur-md border border-white/10 rounded-none sm:rounded-[3rem] p-5 sm:p-12 md:p-16 pt-safe pb-nav sm:pb-12 shadow-2xl overflow-y-auto no-scrollbar"
            >
              {selectedMood && <div className={`absolute top-0 right-0 w-80 h-80 bg-gradient-to-br ${selectedMood.color} opacity-10 blur-[100px] pointer-events-none`} />}

              <button onClick={() => setSelectedMovie(null)} className="absolute top-4 right-4 sm:top-10 sm:right-10 z-[110] w-11 h-11 flex items-center justify-center rounded-full bg-black/50 sm:bg-transparent text-ivory/50 sm:text-ivory/20 hover:text-amber transition-colors">
                <X size={26} />
              </button>

              <div className="flex flex-col md:flex-row gap-6 sm:gap-16 relative z-10">
                <div className="w-[60%] sm:w-full md:w-[35%] shrink-0 aspect-[2/3] max-h-none mx-auto relative rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-2xl">
                  <img
                    src={proxyImageUrl(selectedMovie.poster_url || (selectedMovie.poster_path ? `${IMG_BASE_LG}${selectedMovie.poster_path}` : null)) || 'https://via.placeholder.com/500x750'}
                    className="w-full h-full object-cover"
                    alt={selectedMovie.title}
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-6 sm:space-y-12">
                <div className="noise-overlay" />

                <header className="space-y-4 sm:space-y-6 relative">
                  <p className="text-[10px] sm:text-[12px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.5em] text-amber/40">FİLM ÖZETİ</p>
                  <h2 className="text-[28px] sm:text-5xl lg:text-7xl font-serif font-bold tracking-tight leading-[1.1] sm:leading-[1.05] break-words">{selectedMovie.title}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-6 pt-2 sm:pt-4">
                      <span className="text-sm sm:text-xl font-serif italic text-ivory/30">{selectedMovie.release_date?.split('-')[0]}</span>
                      <div className="h-1 w-1 bg-white/20 rounded-full" />
                      <span className="text-sm sm:text-xl font-serif italic text-ivory/30">{selectedMovie.runtime || '90+'} Dakika</span>
                      <div className="h-1 w-1 bg-white/20 rounded-full" />
                      <span className="text-sm sm:text-xl font-serif italic text-ivory/30">{selectedMovie.genres?.join(', ') || 'Sinema'}</span>
                  </div>
                </header>

                <div className="space-y-8">
                    <p className="text-base sm:text-2xl font-serif leading-relaxed text-ivory/80 italic">
                        {selectedMovie.overview || "Bu yapıt hakkında henüz bir özet bulunmuyor..."}
                    </p>
                </div>

                <div className="p-6 sm:p-16 rounded-[1.5rem] sm:rounded-[4rem] bg-black/40 border border-white/5 relative shadow-inner group">
                  {isAnalyzing
                    ? <div className="flex flex-col items-center gap-6 sm:gap-8 py-8 sm:py-10">
                        <SkeletonGurme />
                        <p className="text-lg sm:text-2xl font-serif italic text-ivory/40 animate-pulse">Üstad notlarını hazırlıyor...</p>
                      </div>
                    : <>
                                                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/40 mb-4 sm:mb-6">Üstadın Notu</p>
                        <p className="text-lg sm:text-4xl font-serif italic leading-relaxed sm:leading-[1.2] text-ivory tracking-tight first-letter:text-4xl sm:first-letter:text-7xl first-letter:float-left first-letter:mr-3 sm:first-letter:mr-4 first-letter:font-bold first-letter:text-amber">
                            {selectedMovie.ai_analysis || "Üstad bu başyapıt için notlarını hazırlıyor... Birazdan burada olacak."}
                        </p>
                      </>
                  }
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-12 border-t border-white/5 pt-8 sm:pt-16">
                  <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Üstat</p>
                      <p className="text-lg sm:text-2xl font-serif text-ivory/80">{selectedMovie.director || 'Bilinmiyor'}</p>
                  </div>
                  <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Zamanın Ruhu</p>
                      <p className="text-lg sm:text-2xl font-serif text-ivory/80">{selectedMovie.genres?.slice(0, 2).join(', ')}</p>
                  </div>
                  <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Küresel yankı</p>
                      <p className="text-2xl sm:text-3xl font-serif font-bold text-amber">★ {reliableRating(selectedMovie) ?? '—'}</p>
                  </div>
                </div>

                {/* Watch Providers */}
                {selectedMovie.watch_providers && (
                  <div className="border-t border-white/5 pt-12 space-y-6">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Nerede İzlenir?</p>
                    <div className="flex flex-wrap gap-3">
                      {(() => {
                        const wp = selectedMovie.watch_providers;
                        const allProviders = [
                          ...(wp.flatrate || []).map(p => ({ ...p, tag: 'Abonelik' })),
                          ...(wp.rent || []).map(p => ({ ...p, tag: 'Kiralık' })),
                          ...(wp.buy || []).map(p => ({ ...p, tag: 'Satın Al' })),
                          ...(wp.free || []).map(p => ({ ...p, tag: 'Ücretsiz' })),
                          ...(wp.ads || []).map(p => ({ ...p, tag: 'Reklamlı' })),
                        ];
                        if (allProviders.length === 0) {
                          if (wp.link) {
                            return (
                              <a href={wp.link} target="_blank" rel="noopener noreferrer"
                                 className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-amber hover:bg-white/10 transition-all">
                                İzleme Seçenekleri
                              </a>
                            );
                          }
                          return <p className="text-ivory/30 text-sm font-serif italic">Türkiye için resmi platform bilgisi bulunamadı.</p>;
                        }
                        const seen = new Set();
                        const unique = allProviders.filter(p => {
                          if (seen.has(p.provider_id)) return false;
                          seen.add(p.provider_id);
                          return true;
                        });
                        const providerUrls = {
                          8: 'https://www.netflix.com/',          // Netflix
                          337: 'https://www.disneyplus.com/',     // Disney+
                          119: 'https://www.primevideo.com/',     // Amazon Prime Video
                          350: 'https://tv.apple.com/',           // Apple TV+
                          2: 'https://tv.apple.com/',             // Apple TV
                          3: 'https://play.google.com/store/movies', // Google Play Movies
                          10: 'https://www.amazon.com/gp/video',  // Amazon Video
                          188: 'https://www.youtube.com/movies',  // YouTube Premium
                          192: 'https://www.youtube.com/movies',  // YouTube
                          341: 'https://www.blutv.com/',          // BluTV
                          1899: 'https://www.mubi.com/',          // MUBI
                          531: 'https://www.paramountplus.com/',  // Paramount+
                          1796: 'https://puhutv.com/',            // puhuTV
                          1898: 'https://www.gain.tv/',           // Gain
                        };
                        return unique.slice(0, 6).map((p) => (
                          <a key={p.provider_id}
                             href={providerUrls[p.provider_id] || wp.link || '#'}
                             target="_blank" rel="noopener noreferrer"
                             title={`${p.provider_name} (${p.tag})`}
                             className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all group">
                            {p.logo_url ? (
                              <img src={p.logo_url} alt={p.provider_name}
                                   className="w-6 h-6 rounded object-contain" />
                            ) : null}
                            <span className="text-[10px] font-bold uppercase tracking-wider text-ivory/60 group-hover:text-amber transition-colors">
                              {p.provider_name}
                            </span>
                            <span className="text-[8px] uppercase tracking-widest text-ivory/20">{p.tag}</span>
                          </a>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 pt-4">
                  <button
                    onClick={handleSaveToJournal}
                    disabled={savedIds.has(selectedMovie.id)}
                    className={`flex-1 py-4 sm:py-6 rounded-full text-[10px] font-bold uppercase tracking-[0.25em] sm:tracking-[0.4em] transition-all duration-700 flex items-center justify-center gap-3 sm:gap-4 ${
                      savedIds.has(selectedMovie.id)
                        ? 'bg-amber/10 text-amber border border-amber/30 cursor-default'
                        : 'bg-amber text-bg hover:scale-[1.02] shadow-[0_20px_50px_-10px_rgba(255,191,0,0.3)]'
                    }`}
                  >
                    {savedIds.has(selectedMovie.id) ? <><Check size={16} /> DEFTERE EKLENDİ</> : <><Plus size={16} /> DEFTERİME KAYDET</>}
                  </button>
                  <button
                    onClick={handleShare}
                    className="px-6 sm:px-10 py-4 sm:py-6 rounded-full text-[10px] font-bold uppercase tracking-[0.25em] sm:tracking-[0.4em] border border-white/10 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                  >
                    {shareCopied ? <><Copy size={14} /> Kopyalandı</> : <><Share2 size={14} /> Paylaş</>}
                  </button>
                  <button
                    onClick={() => setSelectedMovie(null)}
                    className="px-8 sm:px-12 py-4 sm:py-6 rounded-full text-[10px] font-bold uppercase tracking-[0.25em] sm:tracking-[0.4em] border border-white/10 hover:bg-white/5 transition-all"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ QUIZ MODAL ═══ */}
      <AnimatePresence>
        {quizOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeQuiz} />
            <motion.div initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#1a1816]/95 backdrop-blur-md border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
              <button onClick={closeQuiz} className="absolute top-6 right-6 text-ivory/20 hover:text-amber transition-colors z-10"><X size={22} /></button>

              {quizStep === 0 ? null : quizStep <= QUESTIONS.length ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50">{quizStep} / {QUESTIONS.length}</span>
                    <div className="flex gap-1.5">
                      {QUESTIONS.map((_, i) => <div key={i} className={`w-6 h-1 rounded-full transition-colors ${i < quizStep ? 'bg-amber/60' : 'bg-white/10'}`} />)}
                    </div>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-serif font-semibold tracking-tight text-ivory/90 leading-snug">
                    {QUESTIONS[quizStep - 1]?.text}
                  </h3>
                  <div className="space-y-3">
                    {QUESTIONS[quizStep - 1]?.answers.map((ans, i) => (
                      <button key={i} onClick={() => handleQuizAnswer(i)}
                        className="w-full text-left p-4 md:p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber/30 transition-all duration-300 group">
                        <span className="text-sm md:text-base font-serif text-ivory/70 group-hover:text-ivory transition-colors leading-relaxed">{ans.text}</span>
                      </button>
                    ))}
                  </div>
                  {quizStep > 1 && (
                    <button onClick={() => setQuizStep(quizStep - 1)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/30 hover:text-amber/70 transition-colors">
                      <ChevronLeft size={14} /> Geri
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                    <Heart size={24} className="text-bg" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50 mb-3">Bu Geceki Ruh Halin</p>
                    <h3 className="text-2xl md:text-3xl font-serif font-bold tracking-tight text-ivory">
                      {quizResult && (MOOD_NAMES[quizResult[0]?.moodId] || "")}
                      {quizResult && quizResult[0]?.percentage < 50 ? " ağırlıklı" : ""}
                    </h3>
                  </div>
                  {quizResult && (
                    <div className="space-y-3 max-w-xs mx-auto">
                      {quizResult.map((r) => (
                        <div key={r.moodId} className="flex items-center gap-4">
                          <span className="text-sm font-serif text-ivory/70 w-32 text-right">{MOOD_NAMES[r.moodId] || r.moodId}</span>
                          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${r.percentage}%` }}
                              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500" />
                          </div>
                          <span className="text-xs font-bold text-amber/70 w-8">{r.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {quizResult && (
                    <p className="text-sm md:text-base font-serif italic text-ivory/60 leading-relaxed max-w-sm mx-auto">
                      &ldquo;{getResultMessage(quizResult)}&rdquo;
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <button onClick={() => quizResult && navigateFromQuiz(quizResult[0].moodId)}
                      className="px-8 py-4 bg-amber text-bg rounded-full text-[10px] font-bold uppercase tracking-[0.25em] hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                      Bu Mood'a Git
                    </button>
                    <button onClick={() => { setQuizStep(1); setQuizAnswers([]); setQuizResult(null); }}
                      className="px-8 py-4 border border-white/10 text-ivory/60 rounded-full text-[10px] font-bold uppercase tracking-[0.25em] hover:border-amber/30 hover:text-amber transition-all">
                      Tekrar Çöz
                    </button>
                    <button onClick={closeQuiz}
                      className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.25em] text-ivory/30 hover:text-ivory/70 transition-all">
                      Kapat
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
