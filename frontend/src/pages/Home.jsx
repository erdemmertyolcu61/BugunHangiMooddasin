// Home page - Mevcut App.jsx'in içeriği buraya taşındı
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  BookOpen, 
  Calendar, 
  Star, 
  X, 
  Bookmark, 
  Play, 
  Info, 
  Volume2, 
  VolumeX, 
  History, 
  Music, 
  ArrowRight, 
  Pause,
  ChevronRight,
  Library,
  Coffee,
  Moon,
  Compass,
  CloudRain,
  Zap,
  Timer,
  LayoutGrid
} from 'lucide-react';

import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';

// --- CONFIG ---
const IMG_BASE = 'https://image.tmdb.org/t/p/w1280';

// --- CULT MOVIE DATABASE (Fallback & Üstat Reviews) ---
const CULT_MOVIES = [
  { id: 238, title: "The Godfather", genres: [80, 18], poster_path: "/3bhkrjYp9vUArvS3pW9I6vJJS1O.jpg", year: 1972, review: "Bak evlat, bu sadece bir film değil; sinemanın kutsal kitabıdır. Işık kullanımı, o gölgeler arasındaki sırlar... Sinemanın tozunu yutmuş biri olarak söylüyorum ki, bu kadrajlara kendini bırakmalısın." },
  { id: 157336, title: "Interstellar", genres: [12, 18, 878], poster_path: "/gEU2QniE6E77NI6lCU6Mxlv6vD2.jpg", year: 2014, review: "Zamanın ve sevginin o muazzam dansı... Nolan, Tarkovski'nin ruhunu şad edercesine bir evren kurmuş. Eğer ruhun biraz demlenmek istiyorsa, bu kadrajlara kendini teslim etmelisin." },
  { id: 27205, title: "Inception", genres: [28, 878, 12], poster_path: "/edvWebvCEcST6qSSTNi9pZzGvD.jpg", year: 2010, review: "Rüyalar içinde rüyalar... Zihninin kıvrımlarında kaybolmak istiyorsan doğru yerdesin. Kadraj geçişleri bir İstanbul beyefendisinin zarafetiyle işlenmiş." },
  { id: 603, title: "The Matrix", genres: [28, 878], poster_path: "/f89U3Y9SJuCYFJpS9G3M3SFS9Y1.jpg", year: 1999, review: "Gerçeklik dediğin nedir ki evlat? Bu film, sinema tarihindeki o büyük kırılmadır. Estetiği ve felsefesiyle bir 'başyapıt' tanımının tam karşılığıdır." },
  { id: 155, title: "The Dark Knight", genres: [18, 28, 80], poster_path: "/qJ2tW6WMUDr9p1D3pCfs4mgCqI6.jpg", year: 2008, review: "Kaosun ortasındaki o ince çizgi... Joker'in o sarsıcı performansı ve sinemanın o karanlık ama asil yüzü. Bunu izlemeden 'sinemadan anlıyorum' diyemezsin." },
  { id: 13, title: "Forrest Gump", genres: [35, 18, 10749], poster_path: "/arw2vcBveWOVAnA3STp9q9jnZ0f.jpg", year: 1994, review: "Hayat bir kutu çikolata gibidir evlat... Samimiyeti ve naifliğiyle kalbine dokunacak bir şiirdir bu film. Işık kullanımı huzur verir." },
  { id: 680, title: "Pulp Fiction", genres: [53, 80], poster_path: "/d5iIl9h9btztU0kzUv9vi5tP9fs.jpg", year: 1994, review: "Tarantino'nun o dahi ama bir o kadar da serseri ruhu... Diyalogların o ritmi sinema okullarında ders olarak okutulmalı." },
  { id: 122, title: "Lord of the Rings", genres: [12, 14, 28], poster_path: "/6oom6Qjk1S0rXg9vLjHFTIDxPRO.jpg", year: 2003, review: "Epik bir destan... Orta Dünya'nın o büyülü atmosferi, sinema sanatının teknik olarak zirve yaptığı o anlardan biridir." }
];

// --- ATMOSPHERIC WORLD DEFINITIONS ---
const ATMOSPHERIC_WORLDS = {
  pijama: {
    id: 'pijama',
    title: 'Pijama & Battaniye',
    icon: '🍿',
    theme: {
      bg: 'bg-[#fffaf0]',
      card: 'rounded-[3rem] border-amber-100 bg-amber-50/50',
      text: 'text-amber-900',
      accent: 'bg-amber-600',
      animation: 'animate-soft-aura'
    },
    audio: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808f3030e.mp3',
    genres: [35, 10751, 16],
    intro: "Bak evlat, bazen sadece durmak ve ruhunu ısıtacak bir hikayeye sığınmak istersin. Bu seçki tam olarak o battaniye hissini veriyor."
  },
  midnight: {
    id: 'midnight',
    title: 'Gece Yarısı Seansı',
    icon: '🌙',
    theme: {
      bg: 'bg-slate-950',
      card: 'rounded-2xl border-indigo-900/50 bg-indigo-950/20',
      text: 'text-indigo-100',
      accent: 'bg-indigo-600',
      animation: 'animate-star-twinkle'
    },
    audio: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3',
    genres: [53, 9648, 80],
    intro: "Karanlık çöktüğünde sinemanın o gizemli ve sarsıcı yüzüyle tanışmaya hazır ol. Işıkları kapat, sadece sen ve perde."
  },
  roadtrip: {
    id: 'roadtrip',
    title: 'Yolculuk Ruhu',
    icon: '🚗',
    theme: {
      bg: 'bg-zinc-900',
      card: 'rounded-none border-zinc-700 bg-zinc-800/80',
      text: 'text-zinc-100',
      accent: 'bg-yellow-400',
      animation: 'animate-road-slide'
    },
    audio: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73430.mp3',
    genres: [12, 28, 37],
    intro: "Bilinmeyene giden yollar, tozlu pencereler ve özgürlük kokan hikayeler... Bu filmler seni koltuğundan alıp kilometrelerce uzağa taşıyacak."
  },
  rainy: {
    id: 'rainy',
    title: 'Yağmurlu Pazar',
    icon: '🌧️',
    theme: {
      bg: 'bg-slate-300',
      card: 'rounded-3xl border-slate-400/30 bg-slate-100/40 backdrop-blur-sm',
      text: 'text-slate-900',
      accent: 'bg-blue-600',
      animation: 'animate-rain-drops'
    },
    audio: 'https://cdn.pixabay.com/audio/2022/10/25/audio_27734a67a0.mp3',
    genres: [18, 10749, 36],
    intro: "Cama vuran damlaların melodisiyle sinemanın o edebi ve melankolik dokusuna dalıyoruz. Üstadın deyişiyle; ruhun biraz demlensin."
  },
  kaos: {
    id: 'kaos',
    title: 'Kaos & Deşarj',
    icon: '🔥',
    theme: {
      bg: 'bg-black',
      card: 'rounded-none border-red-900 bg-red-950/10',
      text: 'text-red-600',
      accent: 'bg-red-600',
      animation: 'animate-glitch'
    },
    audio: 'https://cdn.pixabay.com/audio/2022/03/15/audio_c36195764d.mp3',
    genres: [28, 878, 27],
    intro: "Kuralların yıkıldığı, adrenalinin tavan yaptığı o anlar... Sisteme başkaldıran bir sinematik kaosun içindesin evlat."
  },
  nostalji: {
    id: 'nostalji',
    title: 'Nostalji Treni',
    icon: '📼',
    theme: {
      bg: 'bg-[#c4a484]',
      card: 'rounded-lg border-[#8b4513]/20 bg-[#fdf5e6]/60',
      text: 'text-[#4b2c20]',
      accent: 'bg-[#8b4513]',
      animation: 'animate-film-grain'
    },
    audio: 'https://cdn.pixabay.com/audio/2022/01/18/audio_658428135a.mp3',
    genres: [99, 10402, 10770],
    intro: "Eski plakların o cızıltılı sesi ve daktilo tuşlarının ritmi... Sinemanın o en saf, en edebi haline yolculuk yapıyoruz."
  }
};

const Home = () => {
  // --- STATE ---
  const [activeWorld, setActiveWorld] = useState(ATMOSPHERIC_WORLDS.pijama);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.4);
  
  // Audio Refs (Cross-fade logic)
  const audioRef = useRef(null);
  const prevAudioRef = useRef(null);

  // --- AUDIO ENGINE (Cross-fade 3s) ---
  useEffect(() => {
    const playNewWorldAudio = () => {
      const url = activeWorld.audio;
      if (!url) return;

      // 1. Existing audio starts fading out
      if (audioRef.current) {
        const oldAudio = audioRef.current;
        let vol = oldAudio.volume;
        const fadeOut = setInterval(() => {
          vol = Math.max(0, vol - 0.02);
          oldAudio.volume = vol;
          if (vol <= 0) {
            oldAudio.pause();
            clearInterval(fadeOut);
          }
        }, 100);
      }

      // 2. New audio starts fading in
      const newAudio = new Audio(url);
      newAudio.loop = true;
      newAudio.volume = 0;
      audioRef.current = newAudio;

      if (!isMuted) {
        newAudio.play().catch(e => console.log("Audio play blocked"));
        let vol = 0;
        const fadeIn = setInterval(() => {
          vol = Math.min(volume, vol + 0.02);
          newAudio.volume = vol;
          if (vol >= volume) clearInterval(fadeIn);
        }, 100);
      }
    };

    playNewWorldAudio();
    return () => { if (audioRef.current) audioRef.current.pause(); };
  }, [activeWorld.id]);

  useEffect(() => {
    if (audioRef.current) {
      if (isMuted) audioRef.current.pause();
      else audioRef.current.play().catch(e => {});
    }
  }, [isMuted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // --- DATA FETCHING (TMDB + Fallback) ---
  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      try {
        const genres = activeWorld.genres.join(',');
        const res = await fetch(getApiUrl(`/api/movies/discover?genres=${genres}&page=1&sort_by=popularity.desc`));
        const data = await res.json();
        const results = data.movies || [];
        
        // Merge with our cult reviews if IDs match, otherwise generate one
        const enriched = results.map(m => {
            const cultMatch = CULT_MOVIES.find(c => c.id === m.id);
            return {
                ...m,
                year: m.release_date?.split('-')[0],
                ustatReview: cultMatch ? cultMatch.review : `Bak evlat, bu filmdeki kadraj kullanımı Tarkovski'nin ruhunu şad eder cinsten. Eğer bu akşam ruhun biraz demlenmek istiyorsa, bu hikayeye kendini bırakmalısın.`
            };
        });
        
        setMovies(enriched.slice(0, 10));
      } catch (err) {
        // Fallback to static data filtered by genre
        const fallback = CULT_MOVIES.filter(c => c.genres.some(g => activeWorld.genres.includes(g))).map(m => ({ ...m, ustatReview: m.review }));
        setMovies(fallback.length > 0 ? fallback : CULT_MOVIES.slice(0, 10));
      } finally {
        setTimeout(() => setLoading(false), 800);
      }
    };
    fetchMovies();
  }, [activeWorld.id]);

  // --- UI COMPONENTS ---
  const WorldCard = ({ world }) => (
    <div 
        onClick={() => setActiveWorld(world)}
        className={`flex flex-col items-center justify-center p-8 cursor-pointer transition-all duration-500 hover:scale-105 ${activeWorld.id === world.id ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
    >
        <span className="text-5xl mb-4">{world.icon}</span>
        <h3 className={`text-[10px] font-bold uppercase tracking-[0.4em] text-center ${activeWorld.theme.text}`}>{world.title}</h3>
    </div>
  );

  return (
    <div className={`flex min-h-screen transition-colors duration-[2000ms] ${activeWorld.theme.bg} overflow-hidden relative`}>
      
      {/* Background World Effects (CSS Animations) */}
      <div className={`fixed inset-0 pointer-events-none z-0 ${activeWorld.theme.animation}`}></div>

      {/* Sidebar - Minimalist Shelf */}
      <aside className={`w-64 border-r border-black/5 h-screen fixed flex flex-col p-12 z-20 bg-white/5 backdrop-blur-3xl`}>
        <div className="mb-20">
          <h1 className={`text-2xl font-bold tracking-tighter leading-none ${activeWorld.theme.text}`}>ÜSTADIN<br/>ARŞİVİ</h1>
          <p className={`text-[8px] font-bold uppercase tracking-[0.5em] mt-4 opacity-40 ${activeWorld.theme.text}`}>25 Yıllık Tecrübe</p>
        </div>

        <div className="flex flex-col gap-8 -ml-8">
            {Object.values(ATMOSPHERIC_WORLDS).map(w => (
                <button 
                    key={w.id}
                    onClick={() => setActiveWorld(w)}
                    className={`flex items-center gap-4 px-8 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${activeWorld.id === w.id ? activeWorld.theme.text : 'opacity-20 hover:opacity-100'}`}
                >
                    {w.icon} {w.title}
                </button>
            ))}
        </div>

        <div className="mt-auto flex items-center gap-4 py-8 border-t border-black/5">
             <button onClick={() => setIsMuted(!isMuted)} className={activeWorld.theme.text}>
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="animate-pulse" />}
             </button>
             <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full h-1 bg-black/5 appearance-none cursor-pointer" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 flex-1 p-20 min-h-screen relative z-10">
        
        {/* World Header */}
        <header className="mb-24 mt-10">
            <div className="flex items-center gap-6 mb-8">
                <span className="text-7xl animate-bounce">{activeWorld.icon}</span>
                <div className="h-px w-32 bg-current opacity-20"></div>
            </div>
            <h2 className={`text-9xl font-bold tracking-tighter leading-none mb-8 ${activeWorld.theme.text}`}>{activeWorld.title}.</h2>
            <p className={`text-3xl font-serif italic max-w-4xl opacity-70 leading-relaxed ${activeWorld.theme.text}`}>
                "{activeWorld.intro}"
            </p>
        </header>

        {/* Movie Discovery Shelf */}
        {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16">
                {[...Array(4)].map((_, i) => <div key={i} className="aspect-[2/3] bg-black/5 rounded-[3rem] animate-pulse"></div>)}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16">
                {movies.map((movie, idx) => (
                    <div 
                        key={movie.id} 
                        className={`group relative cursor-pointer transition-all duration-1000 transform hover:-translate-y-6`}
                        onClick={() => setSelectedMovie(movie)}
                    >
                        <div className={`aspect-[2/3] overflow-hidden shadow-2xl transition-all duration-700 ${activeWorld.theme.card}`}>
                            <img src={movie.poster_path ? proxyImageUrl(`${IMG_BASE}${movie.poster_path}`) : 'https://via.placeholder.com/500x750'} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-1000" />
                        </div>
                        <div className="mt-8 px-2">
                            <h3 className={`text-2xl font-bold tracking-tight mb-2 ${activeWorld.theme.text}`}>{movie.title}</h3>
                            <div className="flex items-center justify-between opacity-40">
                                <span className={`text-xs font-bold ${activeWorld.theme.text}`}>{movie.year}</span>
                                <Star size={14} className={activeWorld.theme.text} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </main>

      {/* Ustat Detail Overlay */}
      {selectedMovie && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end p-0">
            <div className="absolute inset-0 bg-white/40 backdrop-blur-3xl" onClick={() => setSelectedMovie(null)}></div>
            
            <div className={`relative w-full max-w-5xl h-screen bg-white shadow-2xl flex flex-col md:flex-row animate-slide-in-right overflow-y-auto no-scrollbar`}>
                <button onClick={() => setSelectedMovie(null)} className="absolute top-12 right-12 z-10 p-4 hover:rotate-90 transition-all"><X size={32} /></button>
                
                <div className="w-full md:w-[45%] bg-black relative">
                    <img src={proxyImageUrl(`${IMG_BASE}${selectedMovie.poster_path}`)} className="w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                </div>

                <div className="flex-1 p-20 lg:p-24 space-y-20 bg-white">
                    <header className="space-y-6">
                        <p className="text-[11px] font-bold uppercase tracking-[0.8em] text-slate-300">ÜSTADIN NOTU</p>
                        <h2 className="text-8xl font-bold tracking-tighter leading-[0.85] text-slate-900">{selectedMovie.title}</h2>
                    </header>

                    <section className="space-y-12">
                        <div className="bg-slate-50 p-12 rounded-[3.5rem] border-l-8 border-slate-900 shadow-2xl">
                            <p className="text-3xl font-serif italic leading-relaxed text-slate-800 tracking-tight">
                                "{selectedMovie.ustatReview}"
                            </p>
                        </div>
                        <div className="h-px bg-black/5 w-full"></div>
                        <p className="text-2xl text-slate-400 font-light leading-relaxed">
                            {selectedMovie.overview || "Bu yapıtın hikaye detayları üstadın arşivlerinde demleniyor."}
                        </p>
                    </section>

                    <button 
                        onClick={() => setSelectedMovie(null)}
                        className="w-full py-8 border-2 border-slate-900 rounded-[2.5rem] text-xs font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all"
                    >
                        Arşive Dön
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Global CSS for Atmospheric Effects */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes softAura {
            0% { background: radial-gradient(circle at 30% 30%, #ffedd5 0%, transparent 70%); }
            50% { background: radial-gradient(circle at 70% 70%, #ffedd5 0%, transparent 70%); }
            100% { background: radial-gradient(circle at 30% 30%, #ffedd5 0%, transparent 70%); }
        }
        @keyframes starTwinkle {
            0% { background: radial-gradient(circle at 20% 20%, #312e81 0%, transparent 50%), radial-gradient(circle at 80% 80%, #312e81 0%, transparent 50%); }
            50% { background: radial-gradient(circle at 50% 50%, #312e81 0%, transparent 50%); }
            100% { background: radial-gradient(circle at 20% 20%, #312e81 0%, transparent 50%), radial-gradient(circle at 80% 80%, #312e81 0%, transparent 50%); }
        }
        @keyframes rainDrops {
            from { background-position: 0 0; }
            to { background-position: 0 100%; }
        }
        @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        
        .animate-soft-aura { animation: softAura 10s ease infinite; opacity: 0.5; }
        .animate-star-twinkle { animation: starTwinkle 8s ease infinite; opacity: 0.4; }
        .animate-rain-drops { 
            background-image: url('https://www.transparenttextures.com/patterns/black-linen.png');
            animation: rainDrops 20s linear infinite;
            opacity: 0.1;
        }
        .animate-glitch { background: repeating-linear-gradient(0deg, rgba(255,0,0,0.05), rgba(255,0,0,0.05) 1px, transparent 1px, transparent 2px); }
        .animate-film-grain { 
            background-image: url('https://www.transparenttextures.com/patterns/denim.png');
            opacity: 0.05;
        }
        .animate-slide-in-right { animation: slideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
};

export default Home;
