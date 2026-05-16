import React, { useState } from 'react';
import { ChevronRight, Calendar, Star, Music, Filter, TrendingUp } from 'lucide-react';

// Design Preview Showcase - All 5 New Design Sections

export default function DesignPreview() {
  const [activeSection, setActiveSection] = useState('defterim');
  const [selectedMood, setSelectedMood] = useState('pijama');

  const MOODS = {
    pijama: { icon: '🍿', label: 'Pijama & Battaniye', color: 'bg-amber-50 border-amber-200' },
    midnight: { icon: '🌙', label: 'Gece Yarısı', color: 'bg-indigo-50 border-indigo-200' },
    roadtrip: { icon: '🚗', label: 'Yolculuk Ruhu', color: 'bg-zinc-50 border-zinc-200' },
    rainy: { icon: '🌧️', label: 'Yağmurlu Pazar', color: 'bg-slate-50 border-slate-200' },
    kaos: { icon: '🔥', label: 'Kaos & Deşarj', color: 'bg-red-50 border-red-200' },
    nostalji: { icon: '📼', label: 'Nostalji Treni', color: 'bg-yellow-50 border-yellow-200' },
  };

  const SECTIONS = [
    { id: 'defterim', label: '📖 Defterim (Journal)', icon: '📖' },
    { id: 'discovery', label: '🔍 Mood Explorer', icon: '🔍' },
    { id: 'directors', label: '🎬 Director Collections', icon: '🎬' },
    { id: 'statistics', label: '📊 Viewing History', icon: '📊' },
    { id: 'cards', label: '🎨 Enhanced Cards', icon: '🎨' },
  ];

  // ============================================
  // SECTION 1: DEFTERIM (JOURNAL)
  // ============================================
  const DefterimPreview = () => (
    <div className="min-h-screen bg-warm-paper space-y-12">
      {/* Hero */}
      <section className="border-b border-aged-ink/10 px-12 py-16">
        <h1 className="font-serif text-8xl font-bold text-aged-ink mb-2">
          ÜSTADIN DEFTERI
        </h1>
        <p className="text-xs font-bold uppercase tracking-[0.5em] text-aged-ink/40">
          Kişisel Sinema Günlüğü
        </p>
      </section>

      {/* Mood Selector */}
      <section className="px-12 sticky top-0 bg-warm-paper/95 backdrop-blur py-6 border-b border-aged-ink/10 z-40">
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Object.entries(MOODS).map(([key, mood]) => (
            <button
              key={key}
              onClick={() => setSelectedMood(key)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap
                ${
                  selectedMood === key
                    ? 'bg-vinyl-red text-white shadow-lg scale-105'
                    : 'bg-aged-ink/5 text-aged-ink hover:bg-aged-ink/10'
                }`}
            >
              <span className="text-xl">{mood.icon}</span>
              {mood.label}
            </button>
          ))}
        </div>
      </section>

      {/* Journal Entry */}
      <section className="px-12">
        <div className="bg-white rounded-3xl border border-aged-ink/10 p-12 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <Calendar className="text-vinyl-red" size={20} />
            <span className="text-sm font-bold uppercase tracking-widest text-aged-ink/60">
              11 Mayıs, Pazartesi
            </span>
          </div>
          <h2 className="font-serif text-3xl font-bold text-aged-ink mb-6">
            Bugün ruh halin nasıl?
          </h2>
          <textarea
            placeholder="Kişisel düşüncelerinizi yazın..."
            className="w-full h-32 p-6 border border-aged-ink/10 rounded-2xl font-serif italic text-aged-ink/80 focus:outline-none focus:ring-2 focus:ring-vinyl-red"
          />
          <div className="mt-6 flex gap-4">
            <button className="px-8 py-3 bg-aged-ink text-warm-paper font-bold uppercase text-xs tracking-widest rounded-full hover:shadow-lg transition-all">
              Kaydet
            </button>
            <button className="px-8 py-3 border border-aged-ink/20 text-aged-ink font-bold uppercase text-xs tracking-widest rounded-full hover:bg-aged-ink/5">
              İptal
            </button>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="px-12 pb-12">
        <h2 className="font-serif text-4xl font-bold text-aged-ink mb-12">
          Son İzlenen Filmler
        </h2>
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-6">
              <div className="w-20 h-28 rounded-sm bg-gradient-to-br from-aged-ink to-aged-ink/50 flex items-center justify-center text-white text-2xl flex-shrink-0">
                🎬
              </div>
              <div className="flex-1 border-l-2 border-aged-ink/20 pl-6 py-2">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-serif text-xl font-bold text-aged-ink">
                    The Godfather
                  </h3>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={16}
                        className={i < 5 ? 'fill-vinyl-red text-vinyl-red' : 'text-aged-ink/20'}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-aged-ink/60 mb-3">
                  1972 • Francis Ford Coppola
                </p>
                <p className="text-sm italic text-aged-ink/70 leading-relaxed">
                  "Sinema tarihinin başyapıtı. Işık kullanımı, o gölgeler arasındaki sırlar..."
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Collections */}
      <section className="px-12 pb-16">
        <h2 className="font-serif text-4xl font-bold text-aged-ink mb-8">
          Koleksiyonlarım
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {['Başyapıtlar', 'Gece Saatleri', 'Zevk & Nostalji'].map((collection) => (
            <div key={collection} className="bg-white rounded-2xl p-6 border border-aged-ink/10">
              <h3 className="font-serif text-lg font-bold text-aged-ink mb-4">
                {collection}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((j) => (
                  <div
                    key={j}
                    className="aspect-[2/3] rounded-sm bg-gradient-to-br from-vinyl-red/20 to-vinyl-red/10 flex items-center justify-center text-2xl"
                  >
                    🎥
                  </div>
                ))}
              </div>
              <p className="text-xs text-aged-ink/60 mt-4">4 film</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // ============================================
  // SECTION 2: MOOD EXPLORER
  // ============================================
  const DiscoveryPreview = () => (
    <div className="min-h-screen bg-warm-paper space-y-12">
      {/* Atmospheric Preview */}
      <section className="relative h-96 bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-32 h-32 bg-indigo-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-48 h-48 bg-purple-400 rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 text-center text-white">
          <h1 className="font-serif text-6xl font-bold mb-4">🌙 Gece Yarısı Seansı</h1>
          <p className="text-lg italic max-w-2xl mx-auto leading-relaxed">
            "Karanlık çöktüğünde sinemanın o gizemli ve sarsıcı yüzüyle tanışmaya hazır ol..."
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Music size={20} />
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="40"
              className="w-48 h-1 bg-white/30 rounded-full"
            />
          </div>
        </div>
      </section>

      {/* Mood Tabs */}
      <section className="px-12">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Object.entries(MOODS).map(([key, mood]) => (
            <button
              key={key}
              className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap border-2
                ${
                  selectedMood === key
                    ? `border-aged-ink bg-aged-ink text-warm-paper`
                    : `border-aged-ink/20 bg-warm-paper text-aged-ink hover:border-aged-ink/40`
                }`}
            >
              {mood.icon} {mood.label}
            </button>
          ))}
        </div>
      </section>

      {/* Filter Controls */}
      <section className="px-12">
        <div className="bg-white rounded-2xl p-8 border border-aged-ink/10">
          <div className="flex items-center gap-3 mb-6">
            <Filter size={20} className="text-vinyl-red" />
            <h3 className="font-bold uppercase text-xs tracking-widest text-aged-ink">
              Filtreleri Özelleştir
            </h3>
          </div>
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-aged-ink/60 mb-3 block">
                Era: 1970 - 2020
              </label>
              <input type="range" min="1970" max="2025" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-aged-ink/60 mb-3 block">
                Pacing
              </label>
              <div className="flex gap-4">
                {['Yavaş', 'Orta', 'Hızlı'].map((p) => (
                  <button
                    key={p}
                    className="px-4 py-2 rounded-full border border-aged-ink/20 text-sm hover:bg-aged-ink/5"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button className="px-8 py-3 bg-vinyl-red text-white font-bold uppercase text-xs rounded-full w-full">
              Filtreleri Uygula
            </button>
          </div>
        </div>
      </section>

      {/* Discovery Grid */}
      <section className="px-12 pb-16">
        <h2 className="font-serif text-4xl font-bold text-aged-ink mb-8">
          Keşif Sonuçları
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="group cursor-pointer">
              <div className="relative aspect-[2/3] bg-gradient-to-br from-aged-ink/50 to-aged-ink rounded-sm overflow-hidden mb-4 hover:shadow-lg transition-all">
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                  <span className="text-4xl">🎬</span>
                </div>
              </div>
              <h3 className="font-bold text-sm text-aged-ink truncate">Film Title {i}</h3>
              <p className="text-xs text-aged-ink/60">2008 • Director</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // ============================================
  // SECTION 3: DIRECTOR COLLECTIONS
  // ============================================
  const DirectorsPreview = () => (
    <div className="min-h-screen bg-warm-paper space-y-12">
      <section className="border-b border-aged-ink/10 px-12 py-16">
        <h1 className="font-serif text-8xl font-bold text-aged-ink mb-2">
          YÖNETMEN KOLEKSİYONLARI
        </h1>
      </section>

      {/* Director Collections */}
      <section className="px-12 space-y-16">
        {[
          { name: 'Stanley Kubrick', era: '1964-1999', count: 8 },
          { name: 'Wong Kar-wai', era: '1988-2004', count: 6 },
          { name: 'Quentin Tarantino', era: '1992-2019', count: 9 },
        ].map((director) => (
          <div key={director.name}>
            <div className="mb-6">
              <h2 className="font-serif text-4xl font-bold text-aged-ink mb-2">
                {director.name} Universe
              </h2>
              <p className="text-sm text-aged-ink/60 flex gap-4">
                <span>📽️ {director.count} film</span>
                <span>📅 {director.era}</span>
              </p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[1, 2, 3, 4, 5].map((film) => (
                <div
                  key={film}
                  className="flex-shrink-0 w-32 aspect-[2/3] rounded-sm bg-gradient-to-br from-vinyl-red/30 to-vinyl-red/10 flex items-center justify-center text-2xl hover:shadow-lg transition-all cursor-pointer"
                >
                  🎞️
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Genre Crossovers */}
      <section className="px-12 pb-16">
        <h2 className="font-serif text-4xl font-bold text-aged-ink mb-12">
          TÜR ÇAPRAZLARI
        </h2>
        <div className="grid grid-cols-2 gap-8">
          {[
            'Sci-Fi × Noir',
            'Horror × Comedy',
            'Drama × Thriller',
            'Romance × Suspense',
          ].map((blend) => (
            <div
              key={blend}
              className="relative aspect-video rounded-lg bg-gradient-to-br from-aged-ink/20 to-aged-ink/5 border border-aged-ink/10 overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <h3 className="font-bold text-lg text-aged-ink text-center">
                  {blend}
                </h3>
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all"></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // ============================================
  // SECTION 4: VIEWING STATISTICS
  // ============================================
  const StatisticsPreview = () => (
    <div className="min-h-screen bg-warm-paper space-y-12">
      <section className="border-b border-aged-ink/10 px-12 py-16">
        <h1 className="font-serif text-8xl font-bold text-aged-ink mb-2">
          İZLEME YOL CULUĞUM
        </h1>
      </section>

      {/* Stats Cards */}
      <section className="px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { icon: '👁️', value: '47', label: 'Film İzledim' },
            { icon: '⏱️', value: '142.5', label: 'Saat' },
            { icon: '🎬', value: '8', label: 'Bu Ay' },
            { icon: '⭐', value: '7.8', label: 'Ort. Rating' },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl p-8 border border-aged-ink/10 text-center">
              <span className="text-4xl mb-4 block">{stat.icon}</span>
              <p className="font-serif text-3xl font-bold text-aged-ink mb-2">
                {stat.value}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-aged-ink/60">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Mood Distribution */}
      <section className="px-12">
        <h2 className="font-serif text-3xl font-bold text-aged-ink mb-8">
          Mod Dağılımı
        </h2>
        <div className="bg-white rounded-2xl p-8 border border-aged-ink/10 space-y-6">
          {[
            { mood: '🍿 Pijama', percent: 32, color: 'bg-amber-500' },
            { mood: '🌙 Midnight', percent: 24, color: 'bg-indigo-500' },
            { mood: '🚗 Roadtrip', percent: 16, color: 'bg-yellow-500' },
            { mood: '🌧️ Rainy', percent: 12, color: 'bg-blue-500' },
            { mood: '🔥 Chaos', percent: 10, color: 'bg-red-500' },
            { mood: '📼 Nostalgia', percent: 6, color: 'bg-orange-500' },
          ].map((item) => (
            <div key={item.mood}>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-bold text-aged-ink">{item.mood}</span>
                <span className="text-sm text-aged-ink/60">{item.percent}%</span>
              </div>
              <div className="h-3 bg-aged-ink/5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${item.color} transition-all duration-500`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Director Obsessions */}
      <section className="px-12 pb-16">
        <h2 className="font-serif text-3xl font-bold text-aged-ink mb-8">
          Yönetmen Takıntıları
        </h2>
        <div className="bg-white rounded-2xl border border-aged-ink/10 divide-y divide-aged-ink/10">
          {[
            { name: 'Christopher Nolan', count: 5 },
            { name: 'Stanley Kubrick', count: 4 },
            { name: 'Wong Kar-wai', count: 3 },
            { name: 'David Fincher', count: 3 },
            { name: 'Quentin Tarantino', count: 2 },
          ].map((director, i) => (
            <div key={i} className="px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-vinyl-red/20 flex items-center justify-center">
                  🎬
                </div>
                <span className="font-bold text-aged-ink">{director.name}</span>
              </div>
              <span className="text-sm text-aged-ink/60">{director.count} film</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // ============================================
  // SECTION 5: ENHANCED MOVIE CARDS
  // ============================================
  const CardsPreview = () => (
    <div className="min-h-screen bg-warm-paper space-y-12">
      <section className="border-b border-aged-ink/10 px-12 py-16">
        <h1 className="font-serif text-8xl font-bold text-aged-ink mb-4">
          GELİŞTİRİLMİŞ FILM KARTLARI
        </h1>
        <p className="text-aged-ink/60 max-w-2xl">
          Hover edin ve kart üzerindeki etkileşimleri keşfedin...
        </p>
      </section>

      {/* Card Grid */}
      <section className="px-12 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="group cursor-pointer">
              {/* Card Container */}
              <div className="relative aspect-[2/3] rounded-sm overflow-hidden shadow-sm group-hover:shadow-xl transition-all duration-300 mb-4">
                {/* Image */}
                <div className="absolute inset-0 bg-gradient-to-br from-aged-ink/30 to-aged-ink/50 flex items-center justify-center">
                  <span className="text-6xl">🎬</span>
                </div>

                {/* Mood Badge */}
                <div className="absolute top-3 left-3 z-20">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-vinyl-red/20 text-vinyl-red text-xs font-bold rounded-full">
                    <span>🌙</span>
                    Midnight
                  </div>
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4 z-10">
                  <button className="flex items-center gap-2 px-6 py-2 bg-white text-aged-ink font-bold uppercase text-xs rounded-full hover:bg-warm-paper transition-all">
                    ▶ Ön İzle
                  </button>
                  <button className="flex items-center gap-2 px-6 py-2 bg-white text-aged-ink font-bold uppercase text-xs rounded-full hover:bg-warm-paper transition-all">
                    ⟳ Listeye Ekle
                  </button>
                  <button className="flex items-center gap-2 px-6 py-2 bg-white text-aged-ink font-bold uppercase text-xs rounded-full hover:bg-warm-paper transition-all">
                    ♥ Beğen
                  </button>
                </div>
              </div>

              {/* Info */}
              <div>
                <h3 className="font-bold text-sm text-aged-ink truncate">
                  The Godfather {i}
                </h3>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-aged-ink/60">1972 • Coppola</p>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, j) => (
                      <Star
                        key={j}
                        size={12}
                        className={j < 5 ? 'fill-vinyl-red text-vinyl-red' : 'text-aged-ink/20'}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Card States Documentation */}
      <section className="px-12 pb-16">
        <h2 className="font-serif text-3xl font-bold text-aged-ink mb-8">
          Kart Durumları
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: 'Normal Durum',
              description: 'Basit görünüm, poster görüntüsü ve metadata',
            },
            {
              title: 'Hover Durumu',
              description: 'Overlay etkinleşir, 3 hızlı aksiyonla görünür',
            },
            {
              title: 'Seçili Durum',
              description: 'Altın kenar, bold başlık, koleksiyon göstergesi',
            },
          ].map((state, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-aged-ink/10">
              <h3 className="font-bold text-aged-ink mb-3">{state.title}</h3>
              <p className="text-sm text-aged-ink/70">{state.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="min-h-screen bg-warm-paper">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-warm-paper border-b border-aged-ink/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="font-serif text-3xl font-bold text-aged-ink mb-6">
            🎬 Film Eleştirmeni - Tasarım Ön İzlemesi
          </h1>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all
                  ${
                    activeSection === section.id
                      ? 'bg-vinyl-red text-white shadow-lg'
                      : 'bg-aged-ink/5 text-aged-ink hover:bg-aged-ink/10'
                  }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div>
        {activeSection === 'defterim' && <DefterimPreview />}
        {activeSection === 'discovery' && <DiscoveryPreview />}
        {activeSection === 'directors' && <DirectorsPreview />}
        {activeSection === 'statistics' && <StatisticsPreview />}
        {activeSection === 'cards' && <CardsPreview />}
      </div>

      {/* Footer */}
      <footer className="bg-aged-ink text-warm-paper py-12 mt-16">
        <div className="max-w-7xl mx-auto px-12">
          <div className="mb-8">
            <h3 className="font-serif text-2xl font-bold mb-2">
              Design Preview Showcase
            </h3>
            <p className="text-warm-paper/70">
              5 tasarım bölümünün tamamını keşfedin. Hover etkilerini deneyin!
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-sm">
            <div>
              <h4 className="font-bold uppercase tracking-widest mb-3 text-warm-paper">
                Tasarım Dokümanları
              </h4>
              <ul className="space-y-2 text-warm-paper/70">
                <li>📄 DESIGN_MOCKUPS.md</li>
                <li>📐 DESIGN_VARIANTS_COMPARISON.md</li>
                <li>🏗️ COMPONENT_STRUCTURE.md</li>
                <li>🚀 QUICK_START_GUIDE.md</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold uppercase tracking-widest mb-3 text-warm-paper">
                Tasarım Token'ları
              </h4>
              <ul className="space-y-2 text-warm-paper/70">
                <li>🎨 Warm Paper: #F5F2EB</li>
                <li>⚫ Aged Ink: #2C2825</li>
                <li>❤️ Vinyl Red: #A73A3A</li>
                <li>✨ Muted Gold: #C2A878</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
