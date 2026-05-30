import { createContext, useContext, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Global toast (bildirim) sistemi.
 *
 * Amaç: sessizce yutulan fetch/işlem hatalarını kullanıcıya görünür kılmak.
 * Kullanım:
 *   const toast = useToast();
 *   toast.error('Listeye eklenemedi');
 *   toast.success('Listeye eklendi');
 *   toast.show('Bilgi mesajı', { type: 'info', duration: 4000 });
 */
const ToastContext = createContext(null);

let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback((message, { type = 'info', duration = 3500 } = {}) => {
    if (!message) return;
    const id = ++_id;
    setToasts((list) => [...list, { id, message, type }]);
    const tm = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, tm);
    return id;
  }, [dismiss]);

  const api = {
    show,
    dismiss,
    success: (m, o) => show(m, { ...o, type: 'success' }),
    error: (m, o) => show(m, { ...o, type: 'error', duration: o?.duration ?? 4500 }),
    info: (m, o) => show(m, { ...o, type: 'info' }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-[2000] flex flex-col items-center gap-2 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-6 pointer-events-none"
          role="region"
          aria-live="polite"
          aria-label="Bildirimler"
        >
          {toasts.map((t) => (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={[
                'pointer-events-auto max-w-md w-full sm:w-auto text-left',
                'px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md border text-sm font-medium',
                'animate-[blurFadeIn_0.4s_ease] transition-all',
                t.type === 'error'
                  ? 'bg-[#4a0404]/90 border-rose-400/30 text-rose-50'
                  : t.type === 'success'
                  ? 'bg-emerald-900/85 border-emerald-400/30 text-emerald-50'
                  : 'bg-[#1c1512]/90 border-white/15 text-ivory',
              ].join(' ')}
            >
              {t.message}
            </button>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Provider yoksa sessiz no-op — bileşenler patlamasın.
    return {
      show: () => {}, dismiss: () => {},
      success: () => {}, error: () => {}, info: () => {},
    };
  }
  return ctx;
}

export default ToastContext;
