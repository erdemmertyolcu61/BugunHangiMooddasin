/**
 * Public Profile Page — /u/:username
 * Read-only view of a user's profile with taste map, stats, and recent movies.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, UserX } from 'lucide-react';
import { getApiUrl, getShareUrl, resolveAvatarUrl } from '../utils/apiConfig';
import ProfileHeader from '../components/profile/ProfileHeader';
import ProfileStats from '../components/profile/ProfileStats';
import ProfileTasteMap from '../components/profile/ProfileTasteMap';
import ProfileTimeline from '../components/profile/ProfileTimeline';
import ShareButtons from '../components/ShareButtons';

export default function PublicProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

            {/* Share buttons */}
            <div className="flex justify-center">
              <ShareButtons
                url={profileUrl}
                text={`${profile.name || username}'in Sinemood profili`}
                compact
              />
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
          </>
        )}
      </main>
    </motion.div>
  );
}
