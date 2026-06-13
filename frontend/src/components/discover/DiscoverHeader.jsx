import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Book, BookOpen, X, Brain, Users, Search } from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/apiConfig';

/**
 * Discover sayfasının yapışkan başlığı: mood başlığı, arama girişi (mobil
 * aç/kapa dahil) ve gezinme aksiyonları. Mobil arama aç/kapa state'i burada
 * yönetilir; parent yalnız arama metnini ve callback'leri verir.
 * (Discover.jsx'ten ayrıştırıldı — davranış birebir korunur.)
 */
export default function DiscoverHeader({ selectedMood, user, searchQuery, onSearch, onOpenQuiz }) {
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

        </div>
      </div>
    </header>
  );
}
