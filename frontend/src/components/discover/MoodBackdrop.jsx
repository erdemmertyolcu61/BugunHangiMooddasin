import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Discover sayfasının sabit arkaplan katmanları + mood geçiş animasyonları.
 * Saf sunum: yalnızca `selectedMood`'a bağlı, hiçbir state tutmaz.
 * (Discover.jsx'ten ayrıştırıldı — davranış birebir korunur.)
 */
export default function MoodBackdrop({ selectedMood }) {
  if (!selectedMood) return null;
  return (
    <>
      {/* ═══ FIXED ARKAPLAN KATMANLARI (motion.div DIŞINDA — Safari fix) ═══ */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-30 -left-30 w-[450px] h-[450px] rounded-full opacity-[0.30]"
          style={{ background: selectedMood.accentHex || '#ffbf00', filter: 'blur(80px)', willChange: 'filter' }}
        />
        <div
          className="absolute -bottom-30 -right-30 w-[350px] h-[350px] rounded-full opacity-[0.20]"
          style={{ background: selectedMood.vignette || '#000', filter: 'blur(60px)', willChange: 'filter' }}
        />
      </div>

      <div className="vignette vignette-active" />

      {/* Sürekli Vignette — mood rengine göre kenarlarda hafif gölge */}
      <div
        className="fixed inset-0 pointer-events-none z-10 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(circle, transparent 20%, ${selectedMood.vignette || '#000'} 150%)`,
          opacity: 0.35,
        }}
      />

      {/* Paper texture */}
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03]"
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      {/* ═══ MOOD GEÇİŞ ANİMASYONLARI ═══ */}
      <AnimatePresence mode="sync">
        <motion.div
          key={`wash-${selectedMood.id}`}
          initial={{ opacity: 0.75, scale: 1.04 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.25, 1, 0.5, 1] }}
          className={`fixed inset-0 z-30 pointer-events-none bg-gradient-to-br ${selectedMood.color}`}
        />
      </AnimatePresence>

      <AnimatePresence mode="sync">
        <motion.div
          key={`icon-${selectedMood.id}`}
          initial={{ opacity: 0.85, scale: 2.2 }}
          animate={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center"
        >
          {selectedMood.icon && (
            <selectedMood.icon
              size={160}
              strokeWidth={0.8}
              style={{ color: selectedMood.accentHex || '#ffbf00' }}
              className="drop-shadow-[0_0_60px_rgba(255,191,0,0.25)]"
            />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
