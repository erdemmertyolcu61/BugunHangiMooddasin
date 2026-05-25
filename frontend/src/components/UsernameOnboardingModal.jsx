import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMe, setUsername } from '../services/api';

const VALID_RE = /^[a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]{3,20}$/;
const FORBIDDEN_CHARS_RE = /[^a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]/;

/**
 * Zorunlu username onboarding modalı.
 * Google ile giriş yapan ancak henüz özel kullanıcı adı seçmemiş
 * kullanıcılara sinematik bir kimlik seçtirme akışı sunar.
 * Kapatılamaz — username seçmeden uygulamayı kullanamaz.
 */
export default function UsernameOnboardingModal() {
  const { token, user, updateUser } = useAuth();
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Mount'da /auth/me çağır — has_custom_username false ise modalı aç
  useEffect(() => {
    if (!token || checked) return;
    let alive = true;
    (async () => {
      try {
        const me = await getMe();
        if (alive && me && me.has_custom_username === false) {
          setShow(true);
        }
      } catch { /* sessiz */ }
      finally { if (alive) setChecked(true); }
    })();
    return () => { alive = false; };
  }, [token, checked]);

  const handleChange = useCallback((e) => {
    const cleaned = e.target.value.replace(/\s/g, '').replace(FORBIDDEN_CHARS_RE, '');
    setValue(cleaned.slice(0, 20));
    setError('');
  }, []);

  const validationHint = (() => {
    if (!value) return '';
    if (value.length < 3) return 'En az 3 karakter olmalı.';
    if (!VALID_RE.test(value)) return 'Geçersiz karakter var. Harf, rakam, alt çizgi (_) ve Türkçe karakter kullanın.';
    return '';
  })();

  const handleSave = async () => {
    if (!VALID_RE.test(value) || saving) return;
    setSaving(true);
    setError('');
    try {
      const data = await setUsername(value);
      updateUser({ username: data.username, has_custom_username: true });
      setValue(data.username);
      setSuccess(true);
      setTimeout(() => setShow(false), 1200);
    } catch (err) {
      setError(err.message || 'Bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-[90vw] max-w-md mx-auto p-8 rounded-[2rem] bg-[#161010] border border-amber/30
                     shadow-[0_0_80px_rgba(212,175,55,0.12)]"
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        >
          {success ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-5 py-6 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 rounded-full bg-[#d4af37]/20 flex items-center justify-center"
              >
                <Check size={28} className="text-[#d4af37]" />
              </motion.div>
              <p className="font-serif text-xl text-[#f5f2eb] italic">
                Hoş geldin, <span className="text-[#d4af37] font-bold">@{value}</span>
              </p>
            </motion.div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#d4af37]/15 border border-[#d4af37]/30
                               flex items-center justify-center">
                  <Sparkles size={22} className="text-[#d4af37]" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-[#f5f2eb] tracking-tight">
                  Sinematik Kimliğini Seç
                </h2>
                <p className="text-sm text-white/60 leading-relaxed">
                  Arkadaşların seni bu adla bulacak. Benzersiz bir kullanıcı adı belirle.
                </p>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#d4af37]/80 font-bold text-sm">@</span>
                  <input
                    value={value}
                    onChange={handleChange}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder="kullanıcı_adı"
                    autoFocus
                    className="w-full pl-9 pr-4 py-3.5 bg-white/5 border-2 border-[#d4af37]/50 rounded-2xl
                               text-[#f5f2eb] text-base placeholder:text-white/45
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus:border-[#d4af37]/80 transition-all font-mono tracking-wide"
                  />
                </div>
                {validationHint && (
                  <p className="text-xs text-amber-400/70 flex items-center gap-1.5 px-1">
                    <AlertCircle size={12} /> {validationHint}
                  </p>
                )}
                {error && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5 px-1">
                    <AlertCircle size={12} /> {error}
                  </p>
                )}
                <p className="text-[10px] text-white/40 px-1">
                  3-15 karakter. Harf, rakam, alt çizgi (_) ve Türkçe karakter (ğ, ü, ş, ı, ö, ç) kullanılabilir.
                </p>
              </div>

              {/* Button */}
              <button
                onClick={handleSave}
                disabled={!VALID_RE.test(value) || saving}
                className="w-full py-3.5 rounded-2xl font-bold text-sm uppercase tracking-[0.15em]
                           bg-[#d4af37] text-[#120d0b]
                           disabled:opacity-30 disabled:cursor-not-allowed
                           hover:bg-amber-400 transition-all active:scale-[0.97]
                           shadow-[0_0_24px_rgba(212,175,55,0.2)]"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#120d0b]/30 border-t-[#120d0b] animate-spin" />
                    Kaydediliyor...
                  </span>
                ) : (
                  'Kimliğimi Onayla'
                )}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
