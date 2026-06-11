import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { grantAnalyticsConsent, revokeAnalyticsConsent, track, EVENTS } from '../utils/analytics';

/**
 * ConsentBanner — KVKK/gizlilik onay POP-UP'ı.
 * Mobilde alt-sheet, masaüstünde ortalanmış kart. İki temaya da uyumlu
 * (semantik token'lar: bg-surface / text-fg / border-default / bg-amber).
 * İlk ziyarette görünür; karar verilince (`fc_consent` set) bir daha çıkmaz.
 * Onay yokken analytics tamamen no-op çalışır (bkz. analytics.js).
 */
const CONSENT_KEY = 'fc_consent';

export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let decided = true;
    try { decided = localStorage.getItem(CONSENT_KEY) !== null; } catch { /* sessiz */ }
    if (!decided) {
      const t = setTimeout(() => setShow(true), 1100);
      return () => clearTimeout(t);
    }
  }, []);

  // Çerezsiz analitik varsayılan açık (opt-out). "Tamam" = açık kalsın,
  // "Analitiği Kapat" = opt-out. Her iki durumda da karar kaydedilir (banner bir daha çıkmaz).
  const accept = () => {
    grantAnalyticsConsent();
    track(EVENTS.LANDING);
    setShow(false);
  };
  const decline = () => {
    revokeAnalyticsConsent();
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-6">
          {/* Karartma + blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
          />

          {/* Kart — mobilde alt-sheet, sm+ ortalanmış */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Gizlilik onayı"
            initial={{ y: '110%', opacity: 0.6, scale: 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="relative w-full sm:max-w-md
                       bg-surface border-t sm:border border-default
                       rounded-t-[1.75rem] sm:rounded-[1.75rem]
                       shadow-[0_-12px_50px_rgba(0,0,0,0.45)] sm:shadow-[0_24px_70px_rgba(0,0,0,0.5)]
                       overflow-hidden pb-safe"
          >
            {/* Üst altın çizgi + yumuşak hale */}
            <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-amber to-transparent opacity-70" />
            <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-amber/15 blur-3xl" />

            {/* Mobil tutamaç */}
            <div className="sm:hidden flex justify-center pt-3">
              <span className="h-1.5 w-10 rounded-full bg-fg-subtle/30" />
            </div>

            <div className="relative px-6 pt-5 sm:pt-7 pb-6 sm:pb-7">
              {/* Rozet + başlık */}
              <div className="flex items-center gap-3 mb-3.5">
                <span className="shrink-0 w-11 h-11 rounded-2xl bg-amber/12 border border-amber/25
                                 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-amber" />
                </span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-amber/70">Sinemood</p>
                  <h2 className="font-serif text-xl font-bold text-fg leading-tight">
                    Gizliliğine saygımız var
                  </h2>
                </div>
              </div>

              <p className="text-[13.5px] leading-relaxed text-fg-muted">
                Deneyimini iyileştirmek için <span className="text-fg font-semibold">çerezsiz, anonim</span> analitik
                kullanıyoruz; <span className="text-fg font-semibold">çerez yok, IP saklanmaz, kişisel veri toplanmaz</span>.
                Hesap bilgilerin ve listelerin yalnızca hizmeti sunmak için işlenir; üçüncü taraflara satılmaz.
                İstersen aşağıdan kapatabilirsin.{' '}
                <Link to="/gizlilik" onClick={() => setShow(false)}
                  className="text-amber font-semibold underline underline-offset-2 hover:text-amber/80 transition-colors">
                  Detaylar
                </Link>
              </p>

              {/* Aksiyonlar — mobilde dikey, sm+ yatay */}
              <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2.5">
                <button
                  onClick={decline}
                  className="flex-1 px-5 py-3 rounded-full text-[11px] font-bold uppercase tracking-[0.18em]
                             text-fg-subtle hover:text-fg border border-default
                             hover:bg-fg/[0.04] transition-colors"
                >
                  Analitiği Kapat
                </button>
                <button
                  onClick={accept}
                  className="flex-1 px-5 py-3 rounded-full text-[11px] font-bold uppercase tracking-[0.18em]
                             bg-amber text-bg shadow-[0_8px_24px_rgba(255,191,0,0.25)]
                             hover:scale-[1.02] active:scale-[0.99] transition-transform"
                >
                  Tamam
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
