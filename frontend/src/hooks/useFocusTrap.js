import { useEffect, useRef } from 'react';

/**
 * useFocusTrap — modal/dialog erişilebilirliği için odak yönetimi.
 *
 * - Açılınca odağı modal içindeki ilk odaklanabilir öğeye (yoksa konteynere) taşır.
 * - Tab / Shift+Tab ile odağı modal sınırları içinde döndürür (focus trap).
 * - Kapanınca odağı modal açılmadan önceki öğeye geri yükler.
 *
 * Escape ve arka plan scroll kilidi bileşenlerde ayrıca ele alınır;
 * bu hook yalnızca odak (focus) sorumluluğunu üstlenir.
 *
 * @param {boolean} active  Trap etkin mi (modal açık mı)
 * @returns {React.RefObject} Modal konteynerine bağlanacak ref
 */
export function useFocusTrap(active = true) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement;

    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    const FOCUSABLE = [
      'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
      'input:not([disabled])', 'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Açılışta odağı içeri al
    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}

export default useFocusTrap;
