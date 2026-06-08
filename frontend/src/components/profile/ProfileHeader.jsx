import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AtSign, CalendarDays } from 'lucide-react';

const formatDate = (iso) => {
  if (!iso) return 'Bilinmiyor';
  try {
    const d = new Date(String(iso).trim().replace(' ', 'T'));
    if (isNaN(d.getTime())) return 'Bilinmiyor';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return 'Bilinmiyor'; }
};

/**
 * Profile identity hero — avatar, name, username, join date, edit button.
 */
export default function ProfileHeader({ user, avatar, displayName, initials, onEditProfile, isPublic = false }) {
  const [imgError, setImgError] = useState(false);
  // Avatar URL değişince hata durumunu sıfırla (yeni foto yüklenince tekrar dene)
  useEffect(() => { setImgError(false); }, [avatar]);
  const showImg = avatar && !imgError;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center text-center gap-5 pt-2"
    >
      {/* Avatar with conic-gradient ring */}
      <div className="relative">
        <div className="w-28 h-28 rounded-full p-[3px] avatar-ring-conic">
          <div className="w-full h-full rounded-full overflow-hidden bg-[#120d0b] flex items-center justify-center">
            {showImg
              ? <img src={avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer"
                  onError={() => setImgError(true)} />
              : <span className="font-serif text-4xl font-bold text-amber">{initials}</span>}
          </div>
        </div>
        <div className="absolute inset-0 rounded-full opacity-20 blur-xl -z-10"
          style={{ background: 'radial-gradient(circle, var(--color-amber) 0%, transparent 70%)' }} />
      </div>

      {/* Name + username */}
      <div className="space-y-1.5">
        <h1 className="font-serif text-[30px] sm:text-4xl font-bold tracking-tight text-ivory leading-tight">
          {displayName}
        </h1>
        {user?.username && (
          <p className="flex items-center justify-center gap-1.5 font-mono text-sm text-amber/60">
            <AtSign size={13} />{user.username}
          </p>
        )}
        <p className="font-sans text-[13px] text-ivory/50 flex items-center justify-center gap-1.5">
          <CalendarDays size={11} className="text-amber/50" />
          {formatDate(user?.created_at)} tarihinde katıldı
        </p>
        {!isPublic && onEditProfile && (
          <button
            onClick={onEditProfile}
            className="mt-2 px-5 py-2 rounded-full bg-white/5 border border-white/10
                     text-[12px] font-semibold text-ivory/70 hover:text-amber hover:border-amber/30
                     transition-all active:scale-95"
          >
            Profili Düzenle
          </button>
        )}
      </div>
    </motion.div>
  );
}
