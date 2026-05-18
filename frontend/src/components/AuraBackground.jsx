import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMood } from '../context/MoodContext';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

/* ─── Default Palette when no mood is selected ─── */
const DEFAULT_PALETTE = ['#120d0b', '#1a1512', '#0f0d0c', '#1c1714'];

/* ─── Kafan Mı Karışık Palette ─── */
const CHAOS_PALETTE = ['#4c1d95', '#1e1b4b', '#be185d', '#000000'];

/* ─── Latte (light) Palette — sıcak bej tonları ─── */
const LATTE_PALETTE = ['#efe5cf', '#e7dabd', '#f3ecdb', '#e3d4b4'];

/**
 * Performans notu:
 * Eski sürüm 4 adet ~80vw, blur-[120px], mix-blend-screen blob'u SONSUZ
 * animasyonla her karede hareket ettiriyordu — bu hem mobilde hem web'de
 * sürekli repaint/compositing yaratıp ciddi kasmaya yol açıyordu.
 *
 * Yeni sürüm: blur filtresi YOK, mix-blend YOK, sonsuz animasyon YOK.
 * Renkler GPU-dostu radial-gradient katmanlarıyla çiziliyor; mood
 * değişiminde sadece tek seferlik opacity geçişi yapılıyor.
 */
export default function AuraBackground() {
  const { selectedMood } = useMood();
  const location = useLocation();
  const theme = useTheme?.()?.theme || 'dark';
  const isLight = theme === 'light';
  const [colors, setColors] = useState(DEFAULT_PALETTE);

  useEffect(() => {
    if (location.pathname === '/kafan-mi-karisik') {
      setColors(CHAOS_PALETTE);
    } else if (selectedMood && selectedMood.auraColors) {
      setColors(selectedMood.auraColors);
    } else {
      setColors(DEFAULT_PALETTE);
    }
  }, [selectedMood, location.pathname]);

  // Latte temada koyu mood renklerini bej palete ezerek geç
  const activeColors = isLight ? LATTE_PALETTE : colors;
  const [c0, c1, c2, c3] = activeColors;

  // Radial gradient'ler blur filtresine gerek kalmadan yumuşak geçiş verir
  // ve compositor tarafından çok ucuz şekilde çizilir.
  const baseColor = isLight ? '#e7dabd' : '#0a0807';
  const gradient = `
    radial-gradient(60% 60% at 15% 10%, ${c0}cc 0%, transparent 60%),
    radial-gradient(55% 55% at 85% 15%, ${c1}b3 0%, transparent 60%),
    radial-gradient(70% 70% at 20% 90%, ${c2}99 0%, transparent 65%),
    radial-gradient(60% 60% at 90% 85%, ${c3}cc 0%, transparent 60%),
    ${baseColor}
  `;

  return (
    <div className="fixed inset-0 -z-10 w-full h-full overflow-hidden" style={{ backgroundColor: baseColor }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeColors.join('') + theme}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          className="absolute inset-0"
          style={{ background: gradient }}
        />
      </AnimatePresence>

      {/* Statik vignette — animasyon yok, sadece kenar koyulaştırma */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, transparent 35%, ${
            isLight ? '#c9b78f' : (selectedMood?.vignette || '#000')
          } 150%)`,
          opacity: isLight ? 0.15 : 0.55,
        }}
      />
    </div>
  );
}
