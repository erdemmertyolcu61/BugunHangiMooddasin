/**
 * Public Profile Page — /u/:username
 * Read-only view of a user's profile with taste map, stats, and recent movies.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, UserX, Heart, Star, Send, Users, RotateCcw } from 'lucide-react';
import { getApiUrl, getShareUrl, resolveAvatarUrl } from '../utils/apiConfig';
import { recommendToCommunity, unrecommendFromCommunity, getCommunityRecommendations } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ProfileHeader from '../components/profile/ProfileHeader';
import ProfileStats from '../components/profile/ProfileStats';
import ProfileTasteMap from '../components/profile/ProfileTasteMap';
import ProfileTimeline from '../components/profile/ProfileTimeline';
import ShareButtons from '../components/ShareButtons';
import RecommendMovieSheet from '../components/RecommendMovieSheet';
import FilmDetailModal from '../components/FilmDetailModal';

const MOOD_COLORS = {
  battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
  askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
  yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
  zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
  sipsak: '#d4af37', 'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
};

export default function PublicProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [recommenders, setRecommenders] = useState([]);
  const [recommending, setRecommending] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);
    fetch(getApiUrl(`/api/users/public/${encodeURIComponent(username)}`))
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Kullanıcı bulunamadı' : 'Bir hata oluştu');
        return r.json();
      })
      .then(data => setProfile(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [username]);

  // Backend OG paylaşım ucu: kişiye özel link önizlemesi için.
  const profileUrl = getShareUrl(`/share/u/${username}`);

  useEffect(() => {
    if (!selectedMovie?.id) { setRecommenders([]); return; }
    let active = true;
    setRecommenders([]);
    getCommunityRecommendations(selectedMovie.id).then((d) => {
      if (active) setRecommenders(d.recommenders || []);
    });
    return () => { active = false; };
  }, [selectedMovie?.id]);

  const alreadyRecommended = recommenders.some((r) => user && r.uid === user.id);

  const handleRecommendToCommunity = async () => {
    if (!selectedMovie || recommending) return;
    setRecommending(true);
    try {
      if (alreadyRecommended) {
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

  const openMovie = async (film) => {
    const movie = { id: film.tmdb_id, ...film };
    setSelectedMovie(movie);
    try {
      const res = await fetch(getApiUrl(`/api/movies/${film.tmdb_id}/analyze`));
      if (res.ok) {
        const data = await res.json();
        setSelectedMovie((prev) => ({ ...prev, ...data }));
      }
    } catch {}
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen bg-[#120d0b] text-ivory font-sans relative">

      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#120d0b]/98 backdrop-blur-sm border-b border-white/5 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-2.5">
          <button onClick={() => navigate(-1)}
            className="w-10 h-10 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
            <ChevronLeft size={20} />
          </button>
          <span className="font-sans text-[13px] font-bold uppercase tracking-[0.35em] text-amber/70"
            style={{ textShadow: '0 0 20px rgba(255,191,0,0.15)' }}>
            @{username}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 pb-nav">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-[#d4af37]"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <UserX size={40} className="text-ivory/30" />
            <p className="font-serif text-xl italic text-ivory/60">{error}</p>
            <button onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-full bg-amber/15 border border-amber/20 text-amber text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-amber/25 transition-all">
              Ana Sayfaya Dön
            </button>
          </div>
        )}

        {!loading && !error && profile && (
          <>
            <ProfileHeader
              user={profile}
              avatar={resolveAvatarUrl(profile.picture)}
              displayName={profile.name || profile.username || 'Sinemasever'}
              initials={(profile.name || profile.username || 'S')[0].toUpperCase()}
              isPublic
            />

            {/* Share buttons + Bana Film Oner */}
            <div className="flex flex-col items-center gap-3">
              <ShareButtons
                url={profileUrl}
                text={`${profile.name || username}'in Sinemood profili`}
                compact
              />
              {user && String(user.user_id) !== String(profile.id) && (
                <button
                  onClick={() => setRecommendOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider
                             bg-amber/15 text-amber border border-amber/30 hover:bg-amber/25 transition-all"
                >
                  <Send size={14} />
                  Film Oner
                </button>
              )}
            </div>

            <ProfileStats
              watchedCount={profile.watched_count || 0}
              savedCount={profile.saved_count || 0}
              thisMonthCount={profile.this_month_count || 0}
            />

            {profile.taste_map && (
              <ProfileTasteMap
                tasteMap={profile.taste_map}
                username={profile.name || username}
                profileUrl={profileUrl}
              />
            )}

            {profile.recent_watched?.length > 0 && (
              <ProfileTimeline
                recentWatched={profile.recent_watched}
                topMoods={profile.taste_map?.top_moods || []}
              />
            )}

            {/* Topluluk Önerileri */}
            {profile.community_recs?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2.5 px-1">
                  <Heart size={14} className="text-amber/50" />
                  <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">
                    Topluluğa Önerdiği Filmler
                  </p>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {profile.community_recs.map((film) => (
                    <motion.button key={film.tmdb_id}
                      onClick={() => openMovie(film)}
                      whileHover={{ scale: 1.05, y: -4 }}
                      className="group relative text-left"
                    >
                      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[#1c1512] border border-white/[0.06]
                        group-hover:border-amber/30 transition-all shadow-lg">
                        {film.poster_url ? (
                          <img src={film.poster_url} alt={film.title} loading="lazy"
                            className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Star size={16} className="text-ivory/20" />
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent
                        rounded-b-xl p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] font-semibold text-ivory/90 truncate leading-tight">
                          {film.title}
                        </p>
                        {film.vote_average > 0 && (
                          <p className="text-[8px] text-amber/70 font-bold mt-0.5">
                            ★ {Number(film.vote_average).toFixed(1)}
                          </p>
                        )}
                      </div>
                      </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Top Moods Vitrin */}
            {profile.top_moods?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2.5 px-1">
                  <Star size={14} className="text-amber/50" />
                  <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">
                    Sinema Ruhu
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.top_moods.slice(0, 5).map((mood, i) => {
                    const color = MOOD_COLORS[mood.mood_id] || '#d4af37';
                    return (
                      <motion.span key={mood.mood_id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.7 + i * 0.08 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                          bg-[#1c1512]/90 border border-white/[0.06] text-[13px] font-semibold text-ivory/80"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}55` }} />
                        {mood.title}
                      </motion.span>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Bana Film Oner Sheet */}
      {recommendOpen && profile && (
        <RecommendMovieSheet
          targetUser={{ id: profile.id, name: profile.name, username: profile.username, avatar: profile.picture }}
          onClose={() => setRecommendOpen(false)}
        />
      )}

      {selectedMovie && (
        <FilmDetailModal
          movieId={selectedMovie.id || selectedMovie.tmdb_id}
          initialMovie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          headerBadge={recommenders.length > 0 ? (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/80 border border-white/5">
              <div className="flex -space-x-2">
                {recommenders.slice(0, 3).map((r) => (
                  <span key={r.uid} className="w-7 h-7 rounded-full overflow-hidden border-2 border-slate-900">
                    {r.avatar
                      ? <img src={resolveAvatarUrl(r.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : <span className="w-full h-full flex items-center justify-center font-serif text-[11px] font-bold text-amber bg-slate-800">{r.username?.[0]}</span>}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-ivory/60">
                <span className="font-bold text-amber">Gurme {recommenders[0].username}</span>
                {recommenders.length > 1 && <span> ve {recommenders.length - 1} kişi daha</span>} önerdi
              </p>
            </div>
          ) : null}
          extraActions={user ? (
            <button onClick={handleRecommendToCommunity}
              disabled={recommending}
              title={alreadyRecommended ? 'Öneriyi geri al' : 'Topluluğa öner'}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap ${alreadyRecommended ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25' : 'bg-amber/12 border-amber/25 text-amber hover:bg-amber/25'}`}>
              {alreadyRecommended ? <><RotateCcw size={14} /> Öneriyi Geri Al</> : <><Users size={14} /> Topluluğa Öner</>}
            </button>
          ) : null}
        />
      )}
    </motion.div>
  );
}
