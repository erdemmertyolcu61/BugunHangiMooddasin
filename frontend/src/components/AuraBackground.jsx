import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMood } from '../context/MoodContext';
import { useLocation } from 'react-router-dom';

/* ─── Default Palette when no mood is selected ─── */
const DEFAULT_PALETTE = ['#120d0b', '#1a1512', '#0f0d0c', '#1c1714'];

/* ─── Kefan Mı Karışık Palette ─── */
const CHAOS_PALETTE = ['#4c1d95', '#1e1b4b', '#be185d', '#000000'];

export default function AuraBackground() {
  const { selectedMood } = useMood();
  const location = useLocation();
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

  // Blobs animation variants
  const getBlobVariants = (index) => {
    const randomX = [0, 50, -50, 100, -100, 0];
    const randomY = [0, 80, -60, 40, -90, 0];
    const randomScale = [1, 1.2, 0.9, 1.1, 1];
    
    return {
      animate: {
        x: randomX.map(v => v * (index % 2 === 0 ? 1 : -1)),
        y: randomY.map(v => v * (index % 3 === 0 ? 1 : -1)),
        scale: randomScale,
        transition: {
          duration: 20 + index * 5,
          repeat: Infinity,
          ease: "easeInOut"
        }
      }
    };
  };

  return (
    <div className="fixed inset-0 -z-10 w-full h-full overflow-hidden bg-black">
      {/* Film Grain overlay if Zaman Yolcusu */}
      <AnimatePresence>
        {selectedMood?.id === 'zamanyolcusu' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="absolute inset-0 z-10 pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={colors.join('')} // trigger re-mount for smooth blend
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {/* Top Left Blob */}
          <motion.div
            variants={getBlobVariants(1)}
            animate="animate"
            className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen blur-[120px] opacity-80"
            style={{ backgroundColor: colors[0] }}
          />
          {/* Top Right Blob */}
          <motion.div
            variants={getBlobVariants(2)}
            animate="animate"
            className="absolute -top-[10%] -right-[10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen blur-[120px] opacity-70"
            style={{ backgroundColor: colors[1] }}
          />
          {/* Bottom Left Blob */}
          <motion.div
            variants={getBlobVariants(3)}
            animate="animate"
            className="absolute -bottom-[20%] -left-[20%] w-[80vw] h-[80vw] rounded-full mix-blend-screen blur-[130px] opacity-60"
            style={{ backgroundColor: colors[2] }}
          />
          {/* Bottom Right Blob */}
          <motion.div
            variants={getBlobVariants(4)}
            animate="animate"
            className="absolute -bottom-[10%] -right-[10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen blur-[120px] opacity-80"
            style={{ backgroundColor: colors[3] }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Vignette Overlay */}
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        animate={{ 
          background: `radial-gradient(circle at center, transparent 30%, ${selectedMood?.vignette || '#000'} 150%)` 
        }}
        transition={{ duration: 1.5 }}
      />
    </div>
  );
}
