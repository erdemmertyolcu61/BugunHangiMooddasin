import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMood } from '../context/MoodContext';
import { Users, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addToWatchlist, removeFromWatchlist, toggleWatched, searchMovies, repositoryMovies, proxyImageUrl, recommendToCommunity, unrecommendFromCommunity, getCommunityRecommendations, getSimilarMovies, getTasteMap } from '../services/api';
import { buildMatcher } from '../utils/personalMatch';
import { useAuth } from '../context/AuthContext';
import { checkBackendHealth } from '../utils/apiConfig';
import UpcomingSlider from '../components/UpcomingSlider';
import QuizModal from '../components/QuizModal';
import { getApiUrl, resolveAvatarUrl } from '../utils/apiConfig';
import StreamingConsentModal from '../components/StreamingConsentModal';
import useDocumentMeta from '../utils/useDocumentMeta';
import SimilarFilmsStrip from '../components/SimilarFilmsStrip';
import FilmDetailModal from '../components/FilmDetailModal';
import MovieCard from '../components/MovieCard';
import { isPlatformLinked, linkPlatform, getPlatformInfo, buildWatchUrl } from '../utils/streamingMemory';
import { useCache } from '../hooks/useCache';
import MoodBackdrop from '../components/discover/MoodBackdrop';
import DiscoverHeader from '../components/discover/DiscoverHeader';
import SortControl from '../components/discover/SortControl';

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';         // Grid posters (küçük, hızlı)
const IMG_BASE_LG = 'https://image.tmdb.org/t/p/original';  // Modal detail poster (tam kalite)

// Caching logic using localStorage (V3) — 7 gün TTL
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
const getCachedAnalysis = (id) => {
  const raw = localStorage.getItem(`analysis_v3_${id}`);
  if (!raw) return null;
  try {
    const { data, ts } = JSON.parse(raw);
    if (ts && Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(`analysis_v3_${id}`);
      return null;
    }
    return data || JSON.parse(raw); // eski format uyumluluğu
  } catch { return null; }
};
const setCachedAnalysis = (id, data) => {
  localStorage.setItem(`analysis_v3_${id}`, JSON.stringify({ data, ts: Date.now() }));
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

  useDocumentMeta({
    title: 'Keşfet — Ruh Haline Göre Filmler | Sinemood',
    description: 'Ruh haline ve zevkine göre film keşfet. Üstad’ın seçkileri, mood eşleşmeleri ve binlerce filmlik arşivle ne izleyeceğini bul.',
  });
  const [movies, setMovies] = useState([]);
  const [matcher, setMatcher] = useState(null); // kişisel uyum% (taste map'ten); yoksa null
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [quizOpen, setQuizOpen] = useState(false);

  const searchTimeout = useRef(null);
  const lastRequestId = useRef(0);
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
  const handleQuizComplete = (moodId) => {
    setQuizOpen(false);
    if (selectedMood?.id !== moodId) {
      try { playMoodAudio(moodId); } catch(e) {}
      selectMood(moodId);
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(searchTimeout.current);
  }, []);

  const handleSortSelect = (value) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  // Kişisel "uyum %" için kullanıcının zevk haritasını bir kez çek (giriş yaptıysa).
  // Yetersiz veri/yeni kullanıcı → matcher null kalır → sahte yüzde GÖSTERİLMEZ
  // (MovieCard backend mood_score'a düşer).
  useEffect(() => {
    if (!user) { setMatcher(null); return; }
    let alive = true;
    getTasteMap()
      .then((tm) => { if (alive) setMatcher(() => buildMatcher(tm)); })
      .catch(() => { if (alive) setMatcher(null); });
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    setCurrentPage(1);
    setSearchResults(null);
    setSearchQuery('');
  }, [selectedMood?.id, sortBy]);

  // SWR: önce önbellek, sonra arkaplan güncelleme
  const cacheKey = selectedMood ? `discover_${selectedMood.id}_p${currentPage}_s${sortBy}_r${refreshKey}` : null;
  const { data: swrData, isLoading: swrLoading, error: swrError, revalidate } = useCache(
    cacheKey,
    async () => {
      const moviesData = await fetchMoodMovies(selectedMood.id, currentPage, sortBy);
      if (moviesData?.seeding) {
        setTimeout(() => setCurrentPage(1), 10000);
        return { movies: [], total_pages: 1, seeding: true };
      }
      // Kişisel uyum% render anında uygulanır (displayMovies) — matcher async
      // gelse bile filmler doğru güncellenir. Burada ham veriyi koru.
      return { movies: moviesData.movies || [], total_pages: moviesData.total_pages || 1 };
    },
    { revalidateOnMount: true }
  );

  useEffect(() => {
    if (!cacheKey) return;
    if (swrData) {
      if (swrData.seeding) {
        setError("Film arşivi hazırlanıyor... Lütfen 10 saniye bekleyip tekrar deneyin.");
        setMovies([]);
      } else {
        setMovies(swrData.movies);
        setTotalPages(swrData.total_pages);
        setError(null);
      }
    } else if (swrError) {
      console.error("[MoodSelection] Error loading movies:", swrError);
      const msg = swrError.message || String(swrError);
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ERR_CONNECTION_REFUSED")) {
        setError("Sinema arşivine ulaşılamıyor. Backend (8002) çalışmıyor. Proje kökünde 'python start.py' komutunu çalıştırın.");
      } else if (msg.includes("502") || msg.includes("Bad Gateway")) {
        setError("Sunucu yanıt vermedi. 5 saniye bekleyip tekrar deneyin veya terminalden 'python start.py' komutunu çalıştırın.");
        setTimeout(() => setCurrentPage(1), 5000);
      } else if (msg.includes("500") || msg.includes("Internal Server")) {
        setError("Sunucu hatası. Terminaldeki hata mesajlarını kontrol edin.");
      } else {
        setError(`Filmler yüklenemedi: ${msg.substring(0, 120)}`);
      }
      setMovies([]);
    }
  }, [cacheKey, swrData, swrError]);

  // Smooth loading transition for initial fetch
  useEffect(() => {
    if (swrLoading) {
      const t = setTimeout(() => setLoading(true), 80);
      return () => clearTimeout(t);
    }
    setLoading(false);
  }, [swrLoading]);

  // Scroll to top on page/mood change
  useEffect(() => {
    if (currentPage !== 1 || !movies.length) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [currentPage, selectedMood?.id]);

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

  // [CRITICAL FIX] Persistent debounce ref + instant visual flush
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    clearTimeout(searchTimeout.current);

    if (!query.trim()) {
      // User cleared the input — restore mood movies
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    // [CRITICAL FIX 2] Instant visual flush the EXACT millisecond text changes:
    // Clear stale results immediately so mood/random movies never leak through.
    setSearchResults([]);
    setSearchLoading(true);

    const requestId = ++lastRequestId.current;

    // [CRITICAL FIX 1] Debounce: API fires 400ms after LAST keystroke only.
    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await searchMovies(query);
        if (requestId !== lastRequestId.current) return;
        setSearchResults(data.movies || []);
      } catch {
        if (requestId === lastRequestId.current) setSearchResults([]);
      }
      finally {
        if (requestId === lastRequestId.current) setSearchLoading(false);
      }
    }, 400);
  }, [selectedMood?.id]);

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
    setRecommenders([]); // film değişince önceki filmin "Önerdin" durumu anında sıfırlansın
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
      if (alreadyRecommended) {
        // Geri al — kendi önerini topluluktan kaldır
        await unrecommendFromCommunity(selectedMovie.id);
        setRecommenders((prev) => prev.filter((r) => !(user && r.uid === user.id)));
      } else {
        const res = await recommendToCommunity(selectedMovie.id);
        setRecommenders((prev) => {
          const without = prev.filter((r) => r.uid !== res.shared_by.uid);
          return [res.shared_by, ...without];
        });
      }
    } catch (err) {
      console.error('Topluluk önerisi güncellenemedi:', err);
    } finally {
      setRecommending(false);
    }
  };

  // Akıllı yayın platformu erişimi (Streaming Memory Engine)
  const [consentTarget, setConsentTarget] = useState(null); // { providerId, info }

  const openWatchUrl = (providerId) => {
    const url = buildWatchUrl(providerId, selectedMovie?.title, selectedMovie?.watch_providers?.link);
    window.location.href = url;
  };

  const handleProviderClick = (e, provider) => {
    e.preventDefault();
    const info = getPlatformInfo(provider.provider_id);
    if (!info) {
      const fallback = selectedMovie?.watch_providers?.link;
      if (fallback) window.location.href = fallback;
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


  // [CRITICAL FIX 3] Fortress gate: if user has typed ANYTHING or search is loading,
  // mood/random movies are completely suppressed from the virtual DOM.
  const displayMoviesRaw = searchQuery.trim() !== ''
    ? (searchResults || [])   // During typing/loading: empty array (skeletons shown via searchLoading)
    : movies;                 // Only show mood movies when search input is truly empty

  // Kişisel uyum%: matcher varsa her filme kullanıcıya özel `match` ekle. Yoksa
  // ham bırak → MovieCard backend mood_score'a düşer (sahte yüzde yok).
  const displayMovies = useMemo(() => {
    if (!matcher) return displayMoviesRaw;
    return displayMoviesRaw.map((m) => ({ ...m, match: matcher(m, selectedMood?.id) }));
  }, [displayMoviesRaw, matcher, selectedMood?.id]);

  // Mobil 2-sütun grid: page 1'de 20 normal + 5 "Üstad'ın Seçkisi" = 25 (tek sayı) →
  // son satırda yalnız bir kart + boş hücre kalıyordu. Tek ise son kartı düşürüp
  // grid'i tam doldur (2 ve 4 sütunda da tam dolar).
  const gridMovies = (searchQuery.trim() === '' && currentPage === 1 && displayMovies.length % 2 === 1)
    ? displayMovies.slice(0, -1)
    : displayMovies;

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
          onActiveChange={(m) => setSelectedMovie(m)}
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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`min-h-screen bg-[#120d0b] text-[#f5f2eb] font-sans mood-${selectedMood.id}`}>
      <MoodBackdrop selectedMood={selectedMood} />

      {/* ═══ İÇERİK (fade-in/out animasyonlu) ═══ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedMood.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
        <DiscoverHeader
          selectedMood={selectedMood}
          user={user}
          searchQuery={searchQuery}
          onSearch={handleSearch}
          onOpenQuiz={() => setQuizOpen(true)}
        />

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
          <div ref={filmSectionRef} className="flex items-start sm:items-end justify-start flex-wrap gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold tracking-tighter">
                {searchResults !== null
                  ? (searchLoading ? 'Üstad arşivde bakınıyor...' : `"${searchQuery}" Seçkisi`)
                  : 'Perdede'}
              </h2>
              {currentPage === 1 && displayMovies.some(m => m.mood_match_label === "Üstad'ın Seçkisi") && (
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-amber-400/70 mt-2">
                  Üstad'ın Kişisel Seçkisi ile başlıyor
                </p>
              )}
            </div>
            {/* Sort controls - custom dropdown */}
            {searchResults === null && (
              <SortControl sortBy={sortBy} onSelect={handleSortSelect} />
            )}
          </div>
          {/* Frosted glass container — tıpkı Gurme kartı gibi, blur efektini scroll boyunca sürdürür */}
          <div className="p-4 sm:p-6 md:p-8 rounded-[2rem] sm:rounded-[3rem] bg-surface/5 border border-white/5">
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 sm:gap-x-10 gap-y-8 sm:gap-y-16">
              {(loading && searchQuery.trim() === '') || searchLoading
                ? [...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-[2.5rem] animate-pulse overflow-hidden" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.08)' }}>
                      <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(0,0,0,0.3) 50%, rgba(212,175,55,0.06) 100%)', backgroundSize: '200% 200%', animation: 'shimmer 1.8s ease-in-out infinite' }} />
                    </div>
                  ))
                : displayMovies.length === 0
                  ? <div className="col-span-2 lg:col-span-5 py-28 sm:py-40 text-center">
                      {error ? (
                        <div className="space-y-4">
                          <p className="text-amber text-2xl sm:text-3xl font-serif italic px-6">Üstad bu aralar biraz yorgun.</p>
                          <p className="text-ivory/40 text-sm px-6">Birkaç saniye sonra tekrar dene.</p>
                          <button
                            onClick={() => setCurrentPage(1)}
                            className="mt-2 px-6 py-3 rounded-full bg-amber/15 border border-amber/30 text-amber text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-amber/25 transition-all"
                          >
                            Tekrar Dene
                          </button>
                        </div>
                      ) : (
                        <p className="text-ivory/20 font-serif italic text-2xl sm:text-3xl px-6">Üstad bu arama için uygun bir başyapıt bulamadı...</p>
                      )}
                    </div>
                  : gridMovies.map((movie) => (
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
              <div className="flex items-center justify-center gap-6 sm:gap-10 pt-12 pb-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Önceki sayfa"
                  className="w-11 h-11 sm:w-16 sm:h-16 flex items-center justify-center bg-white/5 border border-white/10 rounded-full disabled:opacity-10 hover:bg-amber hover:text-bg transition-all duration-500"
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
                  aria-label="Sonraki sayfa"
                  className="w-11 h-11 sm:w-16 sm:h-16 flex items-center justify-center bg-white/5 border border-white/10 rounded-full disabled:opacity-10 hover:bg-amber hover:text-bg transition-all duration-500"
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
          onActiveChange={(m) => setSelectedMovie(m)}
          onClose={() => setSelectedMovie(null)}
          headerBadge={recommenders.length > 0 ? (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-amber/20 w-fit">
              <div className="flex -space-x-2">
                {recommenders.slice(0, 3).map((r) => (
                  <span key={r.uid} className="w-7 h-7 rounded-full overflow-hidden border-2 border-[#1a1a1a] bg-amber/15 flex items-center justify-center">
                    {r.avatar
                      ? <img src={resolveAvatarUrl(r.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
              {user && (
                <button
                  onClick={handleRecommendToCommunity}
                  disabled={recommending}
                  title={alreadyRecommended ? 'Öneriyi geri al' : 'Topluluğa öner'}
                  className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-all active:scale-95 ${
                    alreadyRecommended
                      ? 'bg-rose-500/15 border border-rose-400/30 text-rose-300 hover:bg-rose-500/25'
                      : 'bg-amber/12 border border-amber/40 text-amber hover:bg-amber/20'
                  }`}
                >
                  {alreadyRecommended ? <><RotateCcw size={14} /> Öneriyi Geri Al</> : <><Users size={14} /> Topluluğa Öner</>}
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

      <QuizModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} onComplete={handleQuizComplete} />

        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
