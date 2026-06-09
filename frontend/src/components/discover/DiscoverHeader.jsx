import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Book, BookOpen, X, Brain, Users, Search, Share2 } from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/apiConfig';

/**
 * Discover sayfasının yapışkan başlığı: mood başlığı, arama girişi (mobil
 * aç/kapa dahil) ve gezinme aksiyonları. Mobil arama aç/kapa state'i burada
 * yönetilir; parent yalnız arama metnini ve callback'leri verir.
 * (Discover.jsx'ten ayrıştırıldı — davranış birebir korunur.)
 */
export default function DiscoverHeader({ selectedMood, user, searchQuery, onSearch, onOpenQuiz, onShareMood }) {
  const navigate = useNavigate();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);

  useEffect(() => {
    if (mobileSearchOpen && mobileSearchRef.current) {
      mobileSearchRef.current.focus();
    }
  }, [mobileSearchOpen]);

  return (
    <header className="sticky top-0 z-[60] bg-[#120d0b]/75 backdrop-blur-xl border-b border-white/5 shadow-lg pt-safe">
      <div className="w-full px-4 sm:px-8 lg:px-12 py-3 sm:py-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-8">
        <div className="flex items-center gap-3 sm:gap-6 md:shrink-0">
          <button onClick={() => navigate('/')} className="p-3 -ml-1 hover:bg-white/5 rounded-full transition-all tap-target flex items-center justify-center">
            <ChevronLeft size={24} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-[#e8d3d3]/30 mb-0.5 sm:mb-1">ŞU ANKİ MODUN</p>
            <h1 className="font-serif text-lg sm:text-xl font-bold flex items-center gap-2 sm:gap-3 truncate">
              <span className="text-amber-500 shrink-0">{selectedMood.icon && <selectedMood.icon size={24} strokeWidth={1.5} />}</span>
              <span className="truncate">{selectedMood.title}</span>
            </h1>
          </div>
          {/* Mobile: search toggle + profile */}
          <div className="flex md:hidden items-center gap-1 ml-auto">
            <button
              onClick={() => {
                if (mobileSearchOpen) onSearch('');
                setMobileSearchOpen(prev => !prev);
              }}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all shrink-0"
              aria-label={mobileSearchOpen ? 'Aramayı kapat' : 'Ara'}
            >
              {mobileSearchOpen ? <X size={18} className="text-[#e8d3d3]/60" /> : <Search size={18} className="text-[#e8d3d3]/60" />}
            </button>
            <button
              onClick={() => navigate('/profil')}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center overflow-hidden transition-all shrink-0"
              aria-label="Profil"
            >
              {user?.picture
                ? <img src={resolveAvatarUrl(user.picture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : <Users size={18} className="text-[#e8d3d3]/60" />}
            </button>
          </div>
        </div>

        <div className={`flex items-center gap-3 w-full md:contents ${mobileSearchOpen ? '' : 'hidden'} md:flex`}>
        <div className="relative flex-1 min-w-0 md:flex-1 flex items-center gap-2">
          <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Arşivde ara..."
              ref={mobileSearchRef}
              className="w-full px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-sm max-sm:text-[16px] text-[#f5f2eb] placeholder:text-white/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus:border-amber/60 transition-all"
          />
          <button
            onClick={() => { onSearch(''); setMobileSearchOpen(false); }}
            className="md:hidden w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all shrink-0"
            aria-label="Kapat"
          >
            <X size={18} className="text-[#e8d3d3]/60" />
          </button>
        </div>

        <div className="flex items-center gap-3 md:gap-4 md:shrink-0">
          <button onClick={() => navigate('/kafan-mi-karisik')} className="hidden md:flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 border border-white/10 rounded-full hover:scale-105 transition-all group animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-bg">Kafan mı Karışık?</span>
          </button>
          <button onClick={onOpenQuiz}
            title="Bugunku Ruh Halim"
            className="hidden md:flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-amber/90 hover:bg-amber text-bg rounded-full hover:scale-105 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] shrink-0 tap-target">
            <Brain size={16} className="text-bg/80 shrink-0" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Bugunku Ruh Halim</span>
          </button>
          {onShareMood && (
            <button onClick={onShareMood}
              title="Mood'unu Paylas"
              className="flex items-center gap-1.5 px-3 py-2.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 hover:border-amber/30 transition-all tap-target">
              <Share2 size={14} className="text-amber/70" />
              <span className="hidden md:inline text-[9px] font-bold uppercase tracking-widest text-ivory/60">Paylas</span>
            </button>
          )}
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
                ? <img src={resolveAvatarUrl(user.picture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : <Users size={13} className="text-amber/60" />}
            </span>
            <span className="font-sans text-[11px] font-semibold text-ivory/60 max-w-[100px] truncate">
              {user?.username || user?.name || 'Giriş Yap'}
            </span>
          </button>
        </div>
        </div>
      </div>
    </header>
  );
}
