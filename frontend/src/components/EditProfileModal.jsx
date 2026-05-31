import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, User, AtSign, Sparkles, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateProfile, uploadAvatar } from '../services/api';
import { resolveAvatarUrl } from '../utils/apiConfig';

const USERNAME_RE = /^[a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]{3,20}$/;

/**
 * Profil Düzenleme Modalı
 * - Avatar yükle (dosya seçici → canvas resize → base64 → backend)
 * - Görüntü adı (name) değiştir
 * - Kullanıcı adı (username) değiştir
 */
export default function EditProfileModal({ onClose, onSaved }) {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);

  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBase64, setAvatarBase64] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const currentAvatar = user?.picture || '';

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Dosya boyutu 5MB\'dan kucuk olmali.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Sadece resim dosyalari yuklenebilir.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Canvas ile resize (max 400x400)
        const canvas = document.createElement('canvas');
        const maxSize = 400;
        let w = img.width;
        let h = img.height;

        if (w > h) {
          if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
        } else {
          if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarPreview(base64);
        setAvatarBase64(base64);
        setError('');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setError('');
    setSaving(true);

    try {
      // Avatar yükle (varsa)
      let newPicture = null;
      if (avatarBase64) {
        const avatarRes = await uploadAvatar(avatarBase64);
        newPicture = avatarRes.picture;
      }

      // Profil bilgilerini güncelle
      const profilePayload = {};
      if (name.trim() && name.trim() !== user?.name) {
        profilePayload.name = name.trim();
      }
      if (username.trim() && username.trim() !== user?.username) {
        if (!USERNAME_RE.test(username.trim())) {
          setError('Kullanici adi 3-20 karakter, harf (Turkce dahil), rakam ve _ icermeli.');
          setSaving(false);
          return;
        }
        profilePayload.username = username.trim();
      }

      if (Object.keys(profilePayload).length > 0) {
        await updateProfile(profilePayload);
      }

      // AuthContext güncelle
      const updates = {};
      if (profilePayload.name) updates.name = profilePayload.name;
      if (profilePayload.username) updates.username = profilePayload.username;
      if (newPicture) updates.picture = newPicture;
      if (Object.keys(updates).length > 0) {
        updateUser(updates);
      }

      setSuccess(true);
      onSaved?.();
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message || 'Bir hata olustu.');
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = avatarPreview || resolveAvatarUrl(currentAvatar);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[1100] bg-black/70 theme-light:bg-white/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-x-4 top-[10vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2
                   z-[1101] w-auto sm:w-full sm:max-w-md
                   bg-[#1a1210] theme-light:bg-[#f3ecdb] border border-white/10 theme-light:border-black/10 rounded-3xl shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8 theme-light:border-black/8">
          <h3 className="font-serif text-lg font-bold text-[#f5f2eb] theme-light:text-[#2a2017]">Profili Duzenle</h3>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/5 theme-light:hover:bg-black/5 transition-colors">
            <X size={20} className="text-white/60 theme-light:text-black/60" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="w-24 h-24 rounded-full overflow-hidden bg-amber/10 border-2 border-amber/30
                            flex items-center justify-center transition-all group-hover:border-amber/60">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User size={36} className="text-amber/50" />
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100
                            flex items-center justify-center transition-opacity">
                <Camera size={22} className="text-white" />
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[13px] font-semibold text-amber/80 hover:text-amber transition-colors"
            >
              Fotograf Degistir
            </button>
            <p className="text-[11px] text-ivory/40 theme-light:text-black/40">
              JPG, PNG veya WebP · en fazla 5MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.15em] text-ivory/60">
              <Sparkles size={12} /> Goruntu Adi
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              placeholder="Adiniz"
              className="w-full px-4 py-3 bg-white/5 theme-light:bg-black/5 border border-white/10 theme-light:border-black/10 rounded-xl
                       text-[15px] text-[#f5f2eb] theme-light:text-[#2a2017] placeholder:text-white/30 theme-light:placeholder:text-black/30
                       focus:outline-none focus:border-amber/40 transition-all"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.15em] text-ivory/60">
              <AtSign size={12} /> Kullanici Adi
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\s/g, '').replace(/[^a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]/g, '');
                setUsername(cleaned.slice(0, 20));
                setError('');
              }}
              placeholder="kullanici_adi"
              className="w-full px-4 py-3 bg-white/5 theme-light:bg-black/5 border border-white/10 theme-light:border-black/10 rounded-xl
                       text-[15px] text-[#f5f2eb] theme-light:text-[#2a2017] placeholder:text-white/30 theme-light:placeholder:text-black/30 font-mono
                       focus:outline-none focus:border-amber/40 transition-all"
            />
            <p className="text-[12px] text-ivory/50 theme-light:text-black/50 px-1">
              3-20 karakter. Harf (Turkce dahil), rakam ve alt cizgi (_) kullanabilirsiniz.
            </p>
          </div>

          {/* Error / Success */}
          {error && (
            <p className="text-[14px] text-rose-400 text-center font-serif">{error}</p>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-2 text-emerald-400 text-[15px] font-semibold"
            >
              <Check size={16} /> Kaydedildi!
            </motion.div>
          )}

          {/* Save Button */}
          {!success && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 rounded-xl bg-amber text-[#120d0b] font-bold text-[15px]
                       uppercase tracking-wider hover:bg-amber-400 transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-[#120d0b]/30 border-t-[#120d0b] animate-spin" />
                  Kaydediliyor...
                </span>
              ) : 'Kaydet'}
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
