import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Tek noktadan "chrome" görünürlüğü: scroll yönüne göre
 * document.documentElement[data-chrome] = "top" | "up" | "down".
 *
 * CSS (index.css) bu attribute'a bakar:
 *   down → header gizlenir (aşağı bakıyoruz, içerik öncelikli)
 *   up   → mobil alt bar gizlenir
 *   top  → ikisi de görünür
 *
 * Sayfa başına header'lara dokunmadan, tek dinleyiciyle çalışır.
 */
export default function ScrollChrome() {
  const { pathname } = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    let lastY = window.scrollY;
    let ticking = false;
    const DELTA = 10;        // titreşim eşiği (10px altı yok say)
    const TOP_ZONE = 24;    // en üstte her şey görünür

    const apply = () => {
      ticking = false;
      const y = window.scrollY;
      if (y < TOP_ZONE) {
        root.dataset.chrome = 'top';
      } else if (y > lastY + DELTA) {
        root.dataset.chrome = 'down';
      } else if (y < lastY - DELTA) {
        root.dataset.chrome = 'up';
      }
      lastY = y;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    };

    // Rota değişince üste dönülüyor → chrome'u görünür başlat
    root.dataset.chrome = 'top';
    lastY = window.scrollY;

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  return null;
}
