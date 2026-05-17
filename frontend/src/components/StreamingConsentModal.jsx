/**
 * Yayın platformu ilk eşleştirme onay modalı.
 * Kullanıcı bir platforma ilk kez tıkladığında çıkar; onay verirse
 * platform "linked" işaretlenir ve sonraki tıklamalarda sorulmaz.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, ExternalLink } from 'lucide-react';

export default function StreamingConsentModal({ open, platform, movieTitle, onConfirm, onClose }) {
  return (
    <AnimatePresence>
      {open && platform && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl p-8 shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-ivory/30 hover:text-amber transition-colors"
            >
              <X size={20} />
            </button>

            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
              style={{ backgroundColor: `${platform.color}22`, border: `1px solid ${platform.color}55` }}
            >
              <ShieldCheck size={26} style={{ color: platform.color }} />
            </div>

            <h3 className="font-serif text-2xl font-bold tracking-tight text-ivory mb-3">
              {platform.name} oturumunu eşleştir
            </h3>

            <p className="font-sans text-sm leading-relaxed text-ivory/60 mb-2">
              Sistem <span className="text-ivory font-semibold">{platform.name}</span> oturumunu bu
              tarayıcıda eşleştirmek istiyor.
            </p>
            <p className="font-sans text-[13px] leading-relaxed text-ivory/40 mb-7">
              Hiçbir şifre veya hesap bilgisi saklanmaz — yalnızca tercih ettiğin
              platform hatırlanır. Bir dahaki sefere{' '}
              <span className="text-amber/80 font-semibold">{movieTitle || 'film'}</span> için
              doğrudan oraya yönlendirileceksin.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-full font-bold uppercase text-[11px] tracking-[0.2em] text-bg transition-all hover:scale-[1.02]"
                style={{ backgroundColor: platform.color, color: '#fff' }}
              >
                <ExternalLink size={15} /> Eşleştir ve Git
              </button>
              <button
                onClick={onClose}
                className="px-6 py-4 rounded-full font-bold uppercase text-[11px] tracking-[0.2em] border border-white/10 text-ivory/50 hover:text-ivory hover:bg-white/5 transition-all"
              >
                Vazgeç
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
