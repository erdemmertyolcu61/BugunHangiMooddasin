import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { pushSupported, isPushSubscribed, isPushEnabledOnServer, enablePush } from '../utils/push';
import { track, EVENTS } from '../utils/analytics';

const DISMISS_KEY = 'fc_push_prompt_dismissed';

/**
 * Giriş sonrası nazik bildirim izni promptu.
 * Çoğu kullanıcı zildeki toggle'ı hiç bulmuyor → adoption düşük kalıyordu.
 * Yalnız şu koşullarda alttan nazik kart çıkar:
 *   girişli + pushSupported() (kurulu PWA / iOS 16.4+) + sunucuda push açık +
 *   henüz abone değil + daha önce kapatılmamış.
 * "Aç" butonu kullanıcı dokunuşu = iOS izin gesture'ı; enablePush() çağırır.
 */
export default function PushPrompt() {
  const { token } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setShow(false); return; }
    let alive = true;
    let timer = null;
    (async () => {
      try { if (localStorage.getItem(DISMISS_KEY)) return; } catch {}
      if (!pushSupported()) return;
      try {
        const serverOn = await isPushEnabledOnServer();
        if (!alive || !serverOn) return;
        const subscribed = await isPushSubscribed();
        if (!alive || subscribed) return;
        // Giriş/onboarding akışının üstüne binmesin diye küçük gecikme
        timer = setTimeout(() => { if (alive) setShow(true); }, 1800);
      } catch { /* sessiz */ }
    })();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [token]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setShow(false);
  }, []);

  const handleEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await enablePush();
      if (r.ok) {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
        track(EVENTS.SHARE_CLICK, { network: 'push', kind: 'enable_prompt' });
        setShow(false);
      }
      // Başarısızsa (izin reddi vb.) kart açık kalır; kullanıcı kapatabilir.
    } catch { /* sessiz */ } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:bottom-6 md:max-w-sm z-[97]"
          role="dialog"
          aria-label="Bildirim izni"
        >
          <div className="relative flex items-start gap-3 p-4 pr-9 rounded-2xl bg-[#161010]/98 border border-amber/25 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-amber/12 flex items-center justify-center shrink-0">
              <BellRing size={18} className="text-amber" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-[#f5f2eb]">Bildirimleri aç</p>
              <p className="text-[11px] text-white/55 leading-snug mt-0.5">
                Film önerisi ve arkadaşlık isteği geldiğinde telefonuna haber verelim.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleEnable}
                  disabled={busy}
                  className="inline-flex items-center justify-center h-9 px-5 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-[0.12em] hover:brightness-105 active:scale-95 transition-all disabled:opacity-60"
                >
                  {busy ? '…' : 'Aç'}
                </button>
                <button
                  onClick={dismiss}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] text-white/45 hover:text-white/70 transition-all"
                >
                  Şimdi değil
                </button>
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Kapat"
              className="absolute top-2.5 right-2.5 p-1 rounded-full text-white/35 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
