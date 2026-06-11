import React, { createContext, useState, useContext, useCallback, useMemo, useRef } from 'react';

import { Coffee, Zap, Moon, Film, Droplets, Smile, Heart, Brain, Flame, Map as MapIcon, VolumeX, Ghost, Gem, Camera, Radio } from 'lucide-react';
import { repositoryMovies, proxyImageUrl } from '../services/api';

const MoodContext = createContext();

export const MOODS = {
  kahkaha: {
    id: 'kahkaha',
    title: 'Kahkaha Molası',
    icon: Smile,
    iconType: 'smile',
    subtitle: 'Upbeat Funk & Swing',
    color: 'from-emerald-900/80 to-teal-950/80',
    auraColors: ['#065f46', '#064e3b', '#022c22', '#0d3b2e'],
    animationType: 'bounce',
    vignette: '#065f46',
    intro: 'Hayat zaten yeterince ciddi. Bugün sadece gülmek, kıkırdamak ve o güzel rahatlamayı hissetmek için buradasın.',
    gurmeNote: 'Üstad diyor ki: "Kahkaha, ruhun nefes almasıdır. İyi bir komedi yazmak trajediden daha zordur, ve bu filmler bunu başarmış."',
    genres: [35, 10402, 10751, 80, 18],
  },
  yolculuk: {
    id: 'yolculuk',
    title: 'Yolculuk Ruhu',
    icon: MapIcon,
    iconType: 'map',
    subtitle: 'Indie Folk & Akustik Gitar',
    color: 'from-sky-900/80 to-indigo-950/80',
    auraColors: ['#0c4a6e', '#1e3a5f', '#172554', '#0f2937'],
    animationType: 'flow',
    vignette: '#1e3a5f',
    intro: 'Bilinmeyen diyarlara, hiç görmediğin sokaklara, rüzgarın götürdüğü yere... Sinema seni bugün bir yolculuğa çıkarıyor.',
    gurmeNote: 'Üstad diyor ki: "Yolculuk sadece fiziksel değildir. Bu filmler ruhunun haritasını çizen, ufkunu genişleten eserler. Yola çıkmaya hazır mısın?"',
    genres: [12, 14, 878, 28, 10752, 18, 37, 99],
  },
  gece: {
    id: 'gece',
    title: 'Gece Kuşu',
    icon: Moon,
    iconType: 'moon',
    subtitle: 'Synthwave & Dark Ambient',
    color: 'from-slate-900/80 to-indigo-950/80',
    auraColors: ['#1e1b4b', '#312e81', '#0f172a', '#4c1d95'],
    animationType: 'sparkle',
    vignette: '#0f172a',
    intro: 'Herkes uyudu ama sen uyumadın. Gece sessizliğinde, karanlıkta parlayan ekranla baş başa kalmak için en doğru filmler.',
    gurmeNote: 'Üstad diyor ki: "Gece, sinemanın doğal evidir. Karanlık salonlarda doğan bu sanat, gece kuşlarına en derin sırlarını fısıldar."',
    genres: [53, 9648, 80, 27, 28, 18],
  },
  battaniye: {
    id: 'battaniye',
    title: 'Battaniye Modu',
    icon: Coffee,
    iconType: 'coffee',
    subtitle: 'Lo-Fi & Coffee Shop Jazz',
    color: 'from-amber-700/80 via-orange-300/40 to-orange-950/80',
    auraColors: ['#b45309', '#fcd34d', '#fef3c7', '#78350f'],
    animationType: 'circular',
    vignette: '#78350f',
    intro: 'Dışarıda yağmur yağıyor, elinde sıcak bir çay var ve pijamalarını giydin. Tam da bu anlar için yapılmış filmler seni bekliyor.',
    gurmeNote: 'Üstad diyor ki: "Battaniye Modu, sinemanın en samimi hali. Bu filmler seni sarıp sarmalayacak, tıpkı kışın ilk karı gibi sessizce ve derinden."',
    genres: [10751, 35, 18, 10749, 16],
  },
  gozyasi: {
    id: 'gozyasi',
    title: 'Gözyaşı Gecesi',
    icon: Droplets,
    iconType: 'droplets',
    subtitle: 'Neoklasik Cello & Piyano',
    color: 'from-slate-800/80 to-slate-950/80',
    auraColors: ['#1e293b', '#334155', '#0f172a', '#475569'],
    animationType: 'tears',
    vignette: '#0f172a',
    intro: 'Bazen ağlamak iyi gelir. İçindeki o düğümü çözecek, ruhunu yıkayıp arındıracak filmler tam burada.',
    gurmeNote: 'Üstad diyor ki: "Gözyaşı, bir filmin sana ulaştığının kanıtıdır. Bu gece kaybetmek, yeniden bulmak ve affetmek üzerine hikayeler var."',
    genres: [18, 10749, 10752, 36, 99],
  },
  adrenalin: {
    id: 'adrenalin',
    title: 'Adrenalin Patlaması',
    icon: Zap,
    iconType: 'zap',
    subtitle: 'Cinematic Orchestral',
    color: 'from-red-900/80 via-black to-red-950/80',
    auraColors: ['#7f1d1d', '#000000', '#ef4444', '#450a0a'],
    animationType: 'flash',
    vignette: '#450a0a',
    intro: 'Kalp atışın hızlansın, koltuğunun kenarını sımsıkı tut. Bugün seni yerinden fırlatacak filmler var.',
    gurmeNote: 'Üstad diyor ki: "Adrenalin, sinemanın en ilkel çağrısıdır. Bu filmler seni koltuğuna çiviler ve bırakmaz. Hazır mısın?"',
    genres: [28, 53, 878, 80, 12, 10752],
  },
  askbahcesi: {
    id: 'askbahcesi',
    title: 'Aşk Bahçesi',
    icon: Heart,
    iconType: 'heart',
    subtitle: 'Fransız Chanson & Soft Pop',
    color: 'from-pink-900/80 to-purple-950/80',
    auraColors: ['#831843', '#581c87', '#2e1065', '#6b1440'],
    animationType: 'flow',
    vignette: '#831843',
    intro: "Kalbinin bir köşesinde hâlâ kelebekler uçuyor mu? O zaman gel, aşkın en güzel hallerini perdede birlikte yaşayalım.",
    gurmeNote: 'Üstad diyor ki: "Aşk, sinemanın en eski ve en güçlü ilham kaynağıdır. Paris sokaklarından Tokyo gece trenlerine, her kare bir kalp atışıdır."',
    genres: [10749, 18, 35, 10402, 10751],
  },
  zamanyolcusu: {
    id: 'zamanyolcusu',
    title: 'Zaman Yolcusu',
    icon: Film,
    iconType: 'film',
    subtitle: 'Vintage Jazz & Gramofon',
    color: 'from-stone-700/80 to-amber-900/80',
    auraColors: ['#78350f', '#d6d3d1', '#44403c', '#5c3a21'],
    animationType: 'grain',
    vignette: '#44403c',
    intro: 'Eski projeksiyon makinelerinin sesi, solmuş biletler, sinema salonunun kadife koltukları... Geçmişe bir yolculuğa çıkalım.',
    gurmeNote: 'Üstad diyor ki: "Sinema tarihi bir hazine sandığıdır. Bu modda, altın çağın ustalıklarını ve zamanın test ettiği şaheserleri keşfedeceksin."',
    genres: [36, 99, 18, 10752, 37],
    sortBy: 'vote_count.desc',
  },
  sessiz: {
    id: 'sessiz',
    title: 'Sessiz Yolculuk',
    icon: VolumeX,
    iconType: 'volumeX',
    subtitle: 'Ambient & Minimalist',
    color: 'from-slate-800/80 to-zinc-900/80',
    auraColors: ['#334155', '#18181b', '#09090b', '#1f2937'],
    animationType: 'slow',
    vignette: '#18181b',
    intro: 'Bazen kelimeler yetersiz kalır. Sadece görüntülerin, seslerin ve sessizliğin konuştuğu filmler için bu yolculuğa çık.',
    gurmeNote: 'Üstad diyor ki: "Gerçek sanat, sessizliğin konuştuğu yerde başlar. Bu filmler sana kelimelerin yetmediği o derinliği verecek."',
    genres: [18, 14, 9648, 99, 36, 10749],
  },
  zihin: {
    id: 'zihin',
    title: 'Zihin Savaşı',
    icon: Brain,
    iconType: 'brain',
    subtitle: 'Cinematic Tension & Puzzle',
    color: 'from-indigo-900/80 to-purple-950/80',
    auraColors: ['#312e81', '#4c1d95', '#2e1065', '#1a1140'],
    animationType: 'pulse',
    vignette: '#312e81',
    intro: 'Beynin yanmaya hazır. Karmaşık planlar, beklenmedik dönüşler ve seni düşünmeye zorlayan hikayeler burada.',
    gurmeNote: 'Üstad diyor ki: "En değerli filmler, bittiğinde bile zihninden çıkmayanlardır. Bu modda kalıcı izler bırakacak eserler var."',
    genres: [9648, 878, 53, 80, 28, 18],
  },
  kalp: {
    id: 'kalp',
    title: 'Kalbimin Sesi',
    icon: Gem,
    iconType: 'gem',
    subtitle: 'Bağımsız & Festival Sineması',
    color: 'from-rose-900/90 via-pink-950/80 to-black',
    auraColors: ['#9f1239', '#831843', '#500724', '#750d33'],
    animationType: 'beat',
    vignette: '#9f1239',
    intro: 'Büyük stüdyoların ötesinde, bağımsız sinemanın en samimi ve cesur hikayeleri. Festival ödüllü, iz bırakan yapımlar seni bekliyor.',
    gurmeNote: 'Üstad diyor ki: "Sinema sanatının kalbi bağımsız yapımlarda atar. Hollywood dışında, saf yaratıcılıkla çekilmiş bu filmler ruhuna dokunacak."',
    genres: [18, 35, 99, 36, 10402],
  },
  karmakar: {
    id: 'karmakar',
    title: 'Karmaşakar',
    icon: Flame,
    iconType: 'flame',
    subtitle: 'Surreal & Experimental',
    color: 'from-purple-900/80 to-violet-950/80',
    auraColors: ['#581c87', '#3b0764', '#1e0338', '#4a0e6b'],
    animationType: 'glitch',
    vignette: '#3b0764',
    intro: 'Gerçeklik sorgulanır, mantık bükülür. Normalin ötesinde, beklenmedik deneyimler için hazır ol.',
    gurmeNote: 'Üstad diyor ki: "Sinemanın sınırlarını zorlayan filmler, en cesur izleyicilere seslenir. Bu modda kendini kaybedeceksin."',
    genres: [14, 878, 53, 9648, 18, 27, 80],
  },
  sipsak: {
    id: 'sipsak',
    title: 'Şipşak',
    icon: Zap,
    iconType: 'zap',
    subtitle: 'Minimal Ambient & Lo-fi',
    color: 'from-yellow-900/80 to-black',
    auraColors: ['#d4af37', '#1a1a2e', '#0f0f1a', '#b8960f'],
    animationType: 'quick',
    vignette: '#d4af37',
    intro: 'Zamanın az, sinema aşkın sonsuz. Saniyelerin bile başyapıta dönüştüğü o kompakt ve vurucu sahneler için perdeyi hemen açıyoruz.',
    gurmeNote: 'Üstad diyor ki: "Şipşak sadece kısa bir film değil, hayatın kısıtlı anlarında yakalanan o yoğun sanattır. Bu yüzden tasarımın her detayı, o sanatı kullanıcıya en temiz şekilde ulaştırmalıdır."',
    genres: [18, 10749, 35, 99, 14],
  },
  "deep-chills": {
    id: 'deep-chills',
    title: 'Derin Ürperti',
    icon: Ghost,
    iconType: 'ghost',
    subtitle: 'Slow-burn Atmospheric Tension',
    color: 'from-slate-900 via-sky-950 to-emerald-950',
    auraColors: ['#1e293b', '#082f49', '#064e3b', '#020617'],
    animationType: 'shake',
    vignette: '#020617',
    intro: 'Karanlık çöktüğünde, perdeler kapandığında... Cesaretini topla, bu gece derin bir ürpertiye hazır ol.',
    gurmeNote: 'Üstad diyor ki: "Bu filmler sadece korkutmaz; zihninin en kuytu köşelerinde tekinsiz bir fısıltı gibi yankılanır."',
    genres: [27, 53, 9648, 14, 18, 878],
  },
  "kadraj-estetigi": {
    id: 'kadraj-estetigi',
    title: 'Kadraj Estetiği',
    icon: Camera,
    iconType: 'camera',
    subtitle: 'Minimalist Piano & Ambient Strings',
    color: 'from-stone-900 via-amber-950 to-zinc-950',
    auraColors: ['#292524', '#78350f', '#1c1917', '#44403c'],
    animationType: 'slow',
    vignette: '#292524',
    intro: 'Her kare bir tablo. Sinematografinin başyapıtları, görsel şölenler ve estetik kompozisyonlar seni bekliyor.',
    gurmeNote: 'Üstad diyor ki: "Sinema önce göze, sonra ruha hitap eder. Bu filmler, her karesiyle bir başyapıt, adeta hareket eden tablolar."',
    genres: [18, 878, 53, 9648, 12, 14],
  },
  "geceyarisi-itirafi": {
    id: 'geceyarisi-itirafi',
    title: 'Geceyarısı İtirafı',
    icon: Radio,
    iconType: 'radio',
    subtitle: 'Cazibal Radyo & Lo-fi Midnight Talk',
    color: 'from-indigo-950 via-slate-900 to-violet-950',
    auraColors: ['#1e1b4b', '#0f172a', '#2e1065', '#110a2e'],
    animationType: 'sparkle',
    vignette: '#1e1b4b',
    intro: 'Gece yarısı, sessiz bir sokak, iki yabancı arasında geçen en derin konuşmalar... Diyalogların büyüsüne kapıl.',
    gurmeNote: 'Üstad diyor ki: "Bazı filmler patlamalarla değil, fısıltılarla büyüler. Bu gece, kelimelerin gücüne teslim ol."',
    genres: [18, 10749, 35, 9648, 99],
  },
};

// ── Her mood'a canlı bir VURGU RENGİ (accentHex) ──────────────────────────
// Ana sayfa kartının hover glow/border'ı ve Discover backdrop blur katmanı
// bu rengi kullanır. Tanımlı olmadığında HEPSİ amber'a (#ffbf00) düşüyordu →
// her mood aynı renkte açılıyor, kimliği kayboluyordu. Aşağıdaki eşleme her
// mood'a koyu zeminde belirgin, kendine özgü bir renk verir.
const MOOD_ACCENTS = {
  battaniye: '#f59e0b',
  yolculuk: '#38bdf8',
  gece: '#818cf8',
  kahkaha: '#34d399',
  gozyasi: '#94a3b8',
  adrenalin: '#ef4444',
  askbahcesi: '#f472b6',
  zamanyolcusu: '#d6a85a',
  sessiz: '#a8a29e',
  zihin: '#a78bfa',
  kalp: '#fb7185',
  karmakar: '#c084fc',
  sipsak: '#facc15',
  'deep-chills': '#2dd4bf',
  'kadraj-estetigi': '#d4a373',
  'geceyarisi-itirafi': '#8b9eff',
};
for (const _id in MOODS) {
  if (!MOODS[_id].accentHex) MOODS[_id].accentHex = MOOD_ACCENTS[_id] || '#ffbf00';
}


// Global cache for movies to avoid redundant API calls
// Each entry: { data, cachedAt: number, ttl: number }
const MOVIES_CACHE = new Map();
const MOOD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes default
const MOOD_CACHE_TTL_STALE = 10 * 60 * 1000; // serve stale up to 10 min

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const IMG_PREFETCH_COUNT = 10; // preload first N posters

function _imgUrl(movie) {
  const raw = movie.poster_url || (movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : null);
  if (!raw) return null;
  return proxyImageUrl(raw);
}

function _prefetchImages(data) {
  if (!data?.movies?.length) return;
  const limit = Math.min(data.movies.length, IMG_PREFETCH_COUNT);
  for (let i = 0; i < limit; i++) {
    const url = _imgUrl(data.movies[i]);
    if (url) {
      const img = new Image();
      img.fetchPriority = 'high';
      img.src = url;
    }
  }
}

export function MoodProvider({ children }) {
  const [selectedMood, setSelectedMood] = useState(() => {
    const saved = localStorage.getItem('selectedMood');
    return saved && MOODS[saved] ? MOODS[saved] : null;
  });

  // Track active fetch requests to abort them if needed
  const activeRequests = useRef(new Map());

  const selectMood = useCallback((moodId) => {
    if (!moodId) {
      setSelectedMood(null);
      localStorage.removeItem('selectedMood');
      return;
    }
    const mood = MOODS[moodId];
    if (mood) {
      setSelectedMood(mood);
      localStorage.setItem('selectedMood', moodId);
    }
  }, []);

  /**
   * Fetches movies for a mood with TTL caching and request cancellation.
   * Returns fresh cache within TTL, stale cache with background refresh,
   * or fetches new if cache is missing/expired.
   */
  const fetchMoodMovies = useCallback(async (moodId, page = 1, sortBy = "recommended", minMoodScore = 0, forceRefresh = false) => {
    const cacheKey = `${moodId}_p${page}_s${sortBy}_m${minMoodScore}`;
    
    const entry = MOVIES_CACHE.get(cacheKey);
    if (entry && !forceRefresh) {
      const age = Date.now() - entry.cachedAt;
      if (age < MOOD_CACHE_TTL) return entry.data;
      if (age < MOOD_CACHE_TTL_STALE) {
        fetchMoodMovies(moodId, page, sortBy, minMoodScore, true).catch(() => {});
        return entry.data;
      }
    }

    if (activeRequests.current.has(cacheKey)) {
      activeRequests.current.get(cacheKey).abort();
    }

    const controller = new AbortController();
    activeRequests.current.set(cacheKey, controller);

    try {
      const data = await repositoryMovies(moodId, page, 5.0, sortBy, minMoodScore);
      MOVIES_CACHE.set(cacheKey, { data, cachedAt: Date.now() });
      _prefetchImages(data);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        // silently handled
      } else {
        console.error(`[MoodCache] Error for ${cacheKey}:`, err);
        throw err;
      }
    } finally {
      if (activeRequests.current.get(cacheKey) === controller) {
        activeRequests.current.delete(cacheKey);
      }
    }
  }, []);

  /**
   * Low priority prefetch for a mood
   */
  const prefetchMood = useCallback((moodId) => {
    const cacheKey = `${moodId}_p1`;
    if (MOVIES_CACHE.has(cacheKey)) return;
    
    // Use requestIdleCallback if available, otherwise setTimeout
    const runner = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
    runner(() => {
      fetchMoodMovies(moodId, 1).catch(() => {}); // Silent fail for prefetch
    });
  }, [fetchMoodMovies]);

  const value = useMemo(() => ({ 
    selectedMood, 
    selectMood, 
    fetchMoodMovies, 
    prefetchMood,
    MOODS 
  }), [selectedMood, selectMood, fetchMoodMovies, prefetchMood]);

  return (
    <MoodContext.Provider value={value}>
      {children}
    </MoodContext.Provider>
  );
}

export function useMood() {
  const context = useContext(MoodContext);
  if (!context) throw new Error('useMood must be used within MoodProvider');
  return context;
}
