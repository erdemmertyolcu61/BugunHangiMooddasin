import React, { useEffect, useState } from 'react';
import { useMood } from '../context/MoodContext';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const DEFAULT_PALETTE = ['#120d0b', '#1a1512', '#0f0d0c', '#1c1714'];
const CHAOS_PALETTE = ['#4c1d95', '#1e1b4b', '#be185d', '#000000'];
const LATTE_PALETTE = ['#efe5cf', '#e7dabd', '#f3ecdb', '#e3d4b4'];

export default function AuraBackground() {
  const { selectedMood } = useMood();
  const location = useLocation();
  const theme = useTheme?.()?.theme || 'dark';
  const isLight = theme === 'light';
  const [colors, setColors] = useState(DEFAULT_PALETTE);

  useEffect(() => {
    if (location.pathname === '/kafan-mi-karisik') setColors(CHAOS_PALETTE);
    else if (selectedMood?.auraColors) setColors(selectedMood.auraColors);
    else setColors(DEFAULT_PALETTE);
  }, [selectedMood, location.pathname]);

  const activeColors = isLight ? LATTE_PALETTE : colors;
  const [c0, c1, c2, c3] = activeColors;
  const baseColor = isLight ? '#e7dabd' : '#0a0807';
  const vignetteColor = isLight ? '#c9b78f' : (selectedMood?.vignette || '#000');

  return (
    <div className="fixed inset-0 -z-10 w-full h-full overflow-hidden" style={{ backgroundColor: baseColor }}>
      <div
        className="absolute inset-0 transition-colors duration-1000 ease-out"
        style={{
          background: `
            radial-gradient(60% 60% at 15% 10%, ${c0}cc 0%, transparent 60%),
            radial-gradient(55% 55% at 85% 15%, ${c1}b3 0%, transparent 60%),
            radial-gradient(70% 70% at 20% 90%, ${c2}99 0%, transparent 65%),
            radial-gradient(60% 60% at 90% 85%, ${c3}cc 0%, transparent 60%),
            ${baseColor}
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at center, transparent 35%, ${vignetteColor} 150%)`,
          opacity: isLight ? 0.15 : 0.55,
        }}
      />
    </div>
  );
}
