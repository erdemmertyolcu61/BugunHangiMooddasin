import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMood } from '../context/MoodContext';
import { ChevronLeft, ChevronRight, Star, Bookmark, Book, BookOpen, Sparkles, X, Plus, Check, Brain, Heart, ArrowUpDown, BookmarkPlus, Eye, Share2, Copy, Users, Sofa } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addToWatchlist, removeFromWatchlist, toggleWatched, searchMovies, repositoryMovies, proxyImageUrl, recommendToCommunity, getCommunityRecommendations, getSimilarMovies } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { checkBackendHealth } from '../utils/apiConfig';
import { QUESTIONS, MOOD_NAMES, calculateQuizResult, getResultMessage } from '../utils/moodQuiz';
import UpcomingSlider from '../components/UpcomingSlider';
import { getApiUrl } from '../utils/apiConfig';
import StreamingConsentModal from '../components/StreamingConsentModal';
import SimilarFilmsStrip from '../components/SimilarFilmsStrip';
import FilmDetailModal from '../components/FilmDetailModal';
import MovieCard from '../components/MovieCard';
import { isPlatformLinked, linkPlatform, getPlatformInfo, buildWatchUrl } from '../utils/streamingMemory';

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
  const { user } = useAuth();
  const { selectedMood, selectMood, fetchMoodMovies } = useMood();
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

  // Paylaşım linkinden gelen ?film=<movieId> — filmi direkt aç
  useEffect(() => {
    const filmId = searchParams.get('film');
    if (!filmId) return;
    searchParams.delete('film');
    setSearchParams(searchParams, { replace: true });
    const fetchAndOpen = async () => {
      try {
        const res = await fetch(getApiUrl(`/api/movies/${filmId}/analyze`));
        if (!res.ok) return;
        const data = await res.json();
        const movieObj = { id: parseInt(filmId), ...data };
        setCachedAnalysis(parseInt(filmId), data);
        setSelectedMovie(movieObj);
      } catch {}
    };
    fetchAndOpen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

        // Sayfanın en üstünden başla — "Yakında" slider'ı ve Üstad notu görünsün
        if (currentPage === 1) {
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const handleAnalyze = useCallback(async (movie) => {
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
  }, []);

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

  // Topluluk önerileri (Community Sharing)
  const [recommenders, setRecommenders] = useState([]);
  const [recommending, setRecommending] = useState(false);

  useEffect(() => {
    if (!selectedMovie?.id) { setRecommenders([]); return; }
    let active = true;
    getCommunityRecommendations(selectedMovie.id).then((d) => {
      if (active) setRecommenders(d.recommenders || []);
    });
    return () => { active = false; };
  }, [selectedMovie?.id]);

  // Benzer filmler — "Bunları da sevebilirsin"
  const [similarMovies, setSimilarMovies] = useState([]);
  useEffect(() => {
    if (!selectedMovie?.id) { setSimilarMovies([]); return; }
    let active = true;
    setSimilarMovies([]);
    getSimilarMovies(selectedMovie.id).then((d) => {
      if (active) setSimilarMovies(d.movies || []);
    });
    return () => { active = false; };
  }, [selectedMovie?.id]);

  const openSimilarMovie = async (m) => {
    const cached = getCachedAnalysis(m.id);
    if (cached) {
      setSelectedMovie({ id: m.id, ...cached });
      document.querySelector('.no-scrollbar')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSelectedMovie({
      id: m.id, title: m.title, poster_url: m.poster_url,
      release_date: m.release_date, vote_average: m.vote_average,
      overview: m.overview,
    });
    setIsAnalyzing(true);
    try {
      const res = await fetch(getApiUrl(`/api/movies/${m.id}/analyze`));
      if (res.ok) {
        const data = await res.json();
        setCachedAnalysis(m.id, data);
        setSelectedMovie({ id: m.id, ...data });
      }
    } catch {} finally {
      setIsAnalyzing(false);
    }
  };

  const alreadyRecommended = recommenders.some((r) => user && r.uid === user.id);

  const handleRecommendToCommunity = async () => {
    if (!selectedMovie || recommending) return;
    setRecommending(true);
    try {
      const res = await recommendToCommunity(selectedMovie.id);
      setRecommenders((prev) => {
        const without = prev.filter((r) => r.uid !== res.shared_by.uid);
        return [res.shared_by, ...without];
      });
    } catch (err) {
      console.error('Topluluğa önerilemedi:', err);
    } finally {
      setRecommending(false);
    }
  };

  // Akıllı yayın platformu erişimi (Streaming Memory Engine)
  const [consentTarget, setConsentTarget] = useState(null); // { providerId, info }

  const openWatchUrl = (providerId) => {
    const url = buildWatchUrl(providerId, selectedMovie?.title, selectedMovie?.watch_providers?.link);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleProviderClick = (e, provider) => {
    e.preventDefault();
    const info = getPlatformInfo(provider.provider_id);
    if (!info) {
      // Eşleşmeyen platform — TMDB toplu linkine düş
      const fallback = selectedMovie?.watch_providers?.link;
      if (fallback) window.open(fallback, '_blank', 'noopener,noreferrer');
      return;
    }
    if (isPlatformLinked(provider.provider_id)) {
      // İkinci ve sonraki tıklamalar: soru sorulmadan doğrudan geç
      openWatchUrl(provider.provider_id);
    } else {
      // İlk tıklama: onay modalı
      setConsentTarget({ providerId: provider.provider_id, info });
    }
  };

  const confirmConsent = () => {
    if (!consentTarget) return;
    linkPlatform(consentTarget.providerId);
    openWatchUrl(consentTarget.providerId);
    setConsentTarget(null);
  };

  const [shareCopied, setShareCopied] = useState(false);
  const handleShare = async () => {
    if (!selectedMovie) return;
    const shareUrl = `${window.location.origin}/discover?film=${selectedMovie.id}`;
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
  const handleQuickSave = useCallback(async (movie) => {
    setQuickSavedIds(prev => {
      const isSaved = prev.has(movie.id);
      const next = new Set(prev);
      if (isSaved) {
        next.delete(movie.id);
        setQuickWatchedIds(wprev => {
          const wnext = new Set(wprev);
          wnext.delete(movie.id);
          return wnext;
        });
        removeFromWatchlist(movie.id).catch(() => {});
      } else {
        next.add(movie.id);
        addToWatchlist(movie).catch(() => {});
      }
      return next;
    });
  }, []);

  const handleQuickWatched = useCallback(async (movie) => {
    setQuickWatchedIds(prev => {
      const nowWatched = !prev.has(movie.id);
      const next = new Set(prev);
      if (nowWatched) next.add(movie.id); else next.delete(movie.id);
      return next;
    });
    setQuickSavedIds(prev => {
      if (!prev.has(movie.id)) {
        const next = new Set(prev);
        next.add(movie.id);
        addToWatchlist(movie).catch(() => {});
        return next;
      }
      return prev;
    });
    try { await toggleWatched(movie.id); } catch (err) { console.error('Quick watched hatası:', err); }
  }, []);


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

  // 2b. Mood yok ama selectedMovie var (KafanMıKarisik/Search'ten ?analyze/?film ile gelindi)
  if (!selectedMood && selectedMovie) {
    return (
      <div className="min-h-screen bg-[#120d0b] text-[#f5f2eb] relative">
        <FilmDetailModal
          movieId={selectedMovie.id || selectedMovie.tmdb_id}
          initialMovie={selectedMovie}
          onClose={() => { setSelectedMovie(null); navigate(-1); }}
        />
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
    <div className={`min-h-screen bg-[#120d0b] text-[#f5f2eb] font-sans mood-${selectedMood.id}`}>
      {/* ═══ FIXED ARKAPLAN KATMANLARI (motion.div DIŞINDA — Safari fix) ═══ */}
      {/* Kalıcı blur arkaplan */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-30 -left-30 w-[450px] h-[450px] rounded-full opacity-[0.30]"
          style={{ background: selectedMood.accentHex || '#ffbf00', filter: 'blur(80px)', willChange: 'filter' }}
        />
        <div
          className="absolute -bottom-30 -right-30 w-[350px] h-[350px] rounded-full opacity-[0.20]"
          style={{ background: selectedMood.vignette || '#000', filter: 'blur(60px)', willChange: 'filter' }}
        />
      </div>

      <div className="vignette vignette-active" />

      {/* Sürekli Vignette — mood rengine göre kenarlarda hafif gölge */}
      <div
        className="fixed inset-0 pointer-events-none z-10 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(circle, transparent 20%, ${selectedMood.vignette || '#000'} 150%)`,
          opacity: 0.35,
        }}
      />

      {/* Paper texture */}
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03]"
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      {/* ═══ MOOD GEÇİŞ ANİMASYONLARI ═══ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`wash-${selectedMood.id}`}
          initial={{ opacity: 0.7, scale: 1.2 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}
          className={`fixed inset-0 z-30 pointer-events-none bg-gradient-to-br ${selectedMood.color}`}
        />
      </AnimatePresence>

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

      {/* ═══ İÇERİK (fade-in animasyonlu) ═══ */}
      <motion.div
        key={selectedMood.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative"
      >
        <header className="sticky top-0 z-[60] bg-[#120d0b]/75 backdrop-blur-xl border-b border-white/5 shadow-lg pt-safe">
        <div className="w-full px-4 sm:px-8 lg:px-12 py-3 sm:py-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-8">
          <div className="flex items-center gap-3 sm:gap-6 md:shrink-0">
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

          {/* Mobilde: arama + "Bugünkü Ruh Halim" yan yana.
              Web'de: md:contents ile 3-bölge düzeni korunur. */}
          <div className="flex items-center gap-3 w-full md:contents">
          <div className="relative flex-1 min-w-0 md:flex-1">
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Arşivde ara..."
                className="w-full px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-sm text-[#f5f2eb] placeholder:text-white/20 focus:outline-none focus:border-amber/60 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 md:gap-4 md:shrink-0">
            <button onClick={() => navigate('/kafan-mi-karisik')} className="hidden md:flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 border border-white/10 rounded-full hover:scale-105 transition-all group animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-bg">Kafan mı Karışık?</span>
            </button>
            <button onClick={() => { setQuizOpen(true); setQuizStep(1); setQuizAnswers([]); setQuizResult(null); }}
              title="Bugünkü Ruh Halim"
              className="hidden md:flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-amber/90 hover:bg-amber text-bg rounded-full hover:scale-105 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] shrink-0 tap-target">
              <Brain size={16} className="text-bg/80 shrink-0" />
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Bugünkü Ruh Halim</span>
            </button>
            <button onClick={() => navigate('/couch')} title="Birlikte İzle"
              className="couch-headbar-btn hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full">
              <Sofa size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Birlikte İzle</span>
            </button>
            <button onClick={() => navigate('/listeler')} className="hidden md:flex items-center gap-2 px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 transition-all group">
              <BookOpen size={16} className="text-amber group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Listeler</span>
            </button>
            <button onClick={() => navigate('/defterim')} className="hidden md:flex items-center gap-2 px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 transition-all group">
              <Book size={16} className="text-amber group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Defterim</span>
            </button>
            <button
              onClick={() => navigate('/profil')}
              title={user ? 'Profilim' : 'Giriş Yap'}
              className="hidden md:flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 hover:border-amber/40 transition-all"
            >
              <span className="w-7 h-7 rounded-full overflow-hidden bg-amber/10 flex items-center justify-center shrink-0">
                {user?.picture
                  ? <img src={user.picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  : <Users size={13} className="text-amber/60" />}
              </span>
              <span className="font-sans text-[11px] font-semibold text-ivory/60 max-w-[100px] truncate">
                {user?.name || 'Giriş Yap'}
              </span>
            </button>
          </div>
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
          {/* Frosted glass container — tıpkı Gurme kartı gibi, blur efektini scroll boyunca sürdürür */}
          <div className="p-4 sm:p-6 md:p-8 rounded-[2rem] sm:rounded-[3rem] bg-surface/5 border border-white/5">
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
                      <MovieCard
                        key={movie.id}
                        movie={movie}
                        isSaved={quickSavedIds.has(movie.id)}
                        isWatched={quickWatchedIds.has(movie.id)}
                        onQuickSave={handleQuickSave}
                        onQuickWatched={handleQuickWatched}
                        onAnalyze={handleAnalyze}
                      />
                    ))
              }
            </div>

            {searchResults === null && totalPages > 1 && (
              <div className="flex items-center justify-center gap-10 pt-12 pb-4">
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
          </div>
        </motion.section>
      </main>

      {/* Film Detay Modal — birleşik tasarım (FilmDetailModal) */}
      {selectedMovie && (
        <FilmDetailModal
          movieId={selectedMovie.id || selectedMovie.tmdb_id}
          initialMovie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          headerBadge={recommenders.length > 0 ? (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-amber/20 w-fit">
              <div className="flex -space-x-2">
                {recommenders.slice(0, 3).map((r) => (
                  <span key={r.uid} className="w-7 h-7 rounded-full overflow-hidden border-2 border-[#1a1a1a] bg-amber/15 flex items-center justify-center">
                    {r.avatar
                      ? <img src={r.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : <span className="font-serif text-[11px] font-bold text-amber">{(r.username || '?').slice(0, 1).toUpperCase()}</span>}
                  </span>
                ))}
              </div>
              <p className="font-sans text-[12px] sm:text-sm text-ivory/70">
                <span className="font-bold text-amber">Gurme {recommenders[0].username}</span>
                {recommenders.length > 1 && <span className="text-ivory/40"> ve {recommenders.length - 1} kişi daha</span>} önerdi
              </p>
            </div>
          ) : null}
          extraActions={(
            <>
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap bg-white/5 border border-white/15 text-ivory/70 hover:bg-white/10 hover:text-ivory transition-all active:scale-95"
              >
                {shareCopied ? <><Copy size={14} /> Kopyalandı</> : <><Share2 size={14} /> Paylaş</>}
              </button>
              {user && (
                <button
                  onClick={handleRecommendToCommunity}
                  disabled={recommending || alreadyRecommended}
                  title={alreadyRecommended ? 'Bu filmi zaten topluluğa önerdin' : 'Topluluğa öner'}
                  className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-all active:scale-95 ${
                    alreadyRecommended
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 cursor-default'
                      : 'bg-amber/12 border border-amber/40 text-amber hover:bg-amber/20'
                  }`}
                >
                  {alreadyRecommended ? <><Check size={14} /> Önerdin</> : <><Users size={14} /> Topluluğa Öner</>}
                </button>
              )}
            </>
          )}
        />
      )}

      {/* ═══ AKILLI YAYIN PLATFORMU ONAY MODALI ═══ */}
      <StreamingConsentModal
        open={!!consentTarget}
        platform={consentTarget?.info}
        movieTitle={selectedMovie?.title}
        onConfirm={confirmConsent}
        onClose={() => setConsentTarget(null)}
      />

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
    </div>
  );
}
