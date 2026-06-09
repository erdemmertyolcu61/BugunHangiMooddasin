import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Eye, Bookmark, Send, ChevronLeft, Film, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSocialFeed } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import { proxyImageUrl } from '../../services/api';
import { MOODS } from '../../context/MoodContext';
import { useAuth } from '../../context/AuthContext';
import RecommendMovieSheet from '../RecommendMovieSheet';
import DailyFilmBanner from '../DailyFilmBanner';
import useDocumentMeta from '../../utils/useDocumentMeta';

const IMG_SM = 'https://image.tmdb.org/t/p/w185';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Az once';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
}

export default function MoodFeed() {
  useDocumentMeta({ title: 'Akis — Sinemood', description: 'Arkadaslarinin mood ve film aktivitesi.' });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendTarget, setRecommendTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getSocialFeed();
        if (alive) setFeed(data);
      } catch {
        if (alive) setFeed({ friend_moods: [], activities: [], recommendations: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <Users size={40} className="text-white/15 mb-4" />
        <p className="font-serif text-lg text-ivory/60">Akisi gormek icin giris yap</p>
        <button onClick={() => navigate('/profil')}
          className="mt-4 px-6 py-2.5 rounded-full bg-amber/15 text-amber border border-amber/30 text-xs font-bold uppercase tracking-wider hover:bg-amber/25 transition-all">
          Giris Yap
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="min-h-screen pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-4 px-2 sm:px-6 max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
          <ChevronLeft size={16} className="sm:size-[20px] text-ivory/70" />
        </button>
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-bold text-ivory leading-tight">Akis</h1>
          <p className="text-[10px] sm:text-[11px] text-white/35">Arkadaslarinin sinema dunyasi</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: '#d4af37' }}
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* Gunun Filmi */}
          <DailyFilmBanner />

          {/* Section 1: Arkadaslarin Moodlari */}
          {feed?.friend_moods?.length > 0 && (
            <section>
              <SectionHeader icon={Activity} text="Arkadaslarin Mood'u" />
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 no-scrollbar -mx-2 sm:-mx-4 px-2 sm:px-4">
                {feed.friend_moods.map((fm) => {
                  const mood = MOODS[fm.mood_id];
                  const MoodIcon = mood?.icon;
                  const color = mood?.accentHex || '#d4af37';
                  return (
                    <motion.div key={fm.user_id}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      className="shrink-0 w-[100px] sm:w-[160px] p-2 sm:p-3.5 rounded-2xl bg-[#1a1310] border border-white/[0.05] space-y-2 sm:space-y-2.5"
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-white/10 shrink-0">
                          {fm.avatar ? (
                            <img src={resolveAvatarUrl(fm.avatar)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-amber/60 font-bold text-sm">
                              {(fm.username || '?')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-[12px] font-semibold text-ivory truncate">@{fm.username}</p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {MoodIcon && <MoodIcon size={14} className="sm:size-[16px]" style={{ color }} />}
                        <span className="text-[11px] sm:text-[13px] font-serif font-bold" style={{ color }}>
                          {mood?.title || fm.mood_id}
                        </span>
                      </div>
                      <p className="text-[9px] sm:text-[10px] text-white/30">{timeAgo(fm.updated_at)}</p>
                      <button
                        onClick={() => setRecommendTarget({ id: fm.user_id, name: fm.name, username: fm.username, avatar: fm.avatar })}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-bold uppercase tracking-wider
                          bg-amber/12 border border-amber/20 text-amber hover:bg-amber/20 transition-all"
                      >
                        <Send size={9} className="sm:size-[10px]" /> Film Oner
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section 2: Arkadas Aktivitesi */}
          {feed?.activities?.length > 0 && (
            <section>
              <SectionHeader icon={Eye} text="Arkadas Aktivitesi" />
              <div className="space-y-2">
                {feed.activities.map((a, i) => (
                  <motion.div key={`${a.user_id}-${a.tmdb_id}-${i}`}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1310] border border-white/[0.05]"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0">
                      {a.avatar ? (
                        <img src={resolveAvatarUrl(a.avatar)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-amber/60 font-bold text-xs">
                          {(a.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-ivory/80 truncate">
                        <span className="font-semibold text-amber/70">@{a.username}</span>{' '}
                        {a.action_type === 'watched' ? 'izledi' : 'kaydetti'}
                      </p>
                      <p className="text-[13px] font-serif font-semibold text-ivory truncate">{a.title}</p>
                    </div>
                    {a.poster_url && (
                      <img src={proxyImageUrl(a.poster_url)} alt=""
                        className="w-10 h-[60px] rounded-lg object-cover bg-white/5 shrink-0" loading="lazy" />
                    )}
                    <div className="flex flex-col items-end shrink-0">
                      {a.action_type === 'watched'
                        ? <Eye size={14} className="text-emerald-400/60" />
                        : <Bookmark size={14} className="text-amber/50" />}
                      <span className="text-[9px] text-white/25 mt-1">{timeAgo(a.action_at)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Section 3: Son Oneriler */}
          {feed?.recommendations?.length > 0 && (
            <section>
              <SectionHeader icon={Send} text="Son Gelen Oneriler" />
              <div className="space-y-2">
                {feed.recommendations.map((r) => (
                  <motion.div key={r.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1310] border border-white/[0.05]"
                  >
                    {r.poster_url ? (
                      <img src={proxyImageUrl(r.poster_url)} alt=""
                        className="w-10 h-[60px] rounded-lg object-cover bg-white/5 shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-10 h-[60px] rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Film size={14} className="text-white/20" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white/40">
                        <span className="text-amber/70 font-semibold">@{r.sender?.username || 'arkadas'}</span> onerdi
                      </p>
                      <p className="text-[13px] font-serif font-semibold text-ivory truncate">{r.movie_title}</p>
                      {r.user_note && (
                        <p className="text-[11px] font-serif italic text-white/40 truncate">{r.user_note}</p>
                      )}
                    </div>
                    <span className="text-[9px] text-white/25 shrink-0">{timeAgo(r.created_at)}</span>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {!feed?.friend_moods?.length && !feed?.activities?.length && !feed?.recommendations?.length && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Activity size={40} className="text-white/10 mb-4" />
              <p className="font-serif text-lg text-ivory/50">Akis bos</p>
              <p className="text-[13px] text-white/30 mt-1">Arkadas ekleyince burada aktiviteleri gorunecek.</p>
            </div>
          )}
        </div>
      )}

      {recommendTarget && (
        <RecommendMovieSheet targetUser={recommendTarget} onClose={() => setRecommendTarget(null)} />
      )}
    </motion.div>
  );
}

function SectionHeader({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2.5 px-1 mb-3">
      <Icon size={14} className="text-amber/50" />
      <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">{text}</p>
    </div>
  );
}
