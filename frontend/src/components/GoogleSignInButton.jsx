/**
 * GoogleSignInButton — Programatik Google Identity Services butonu.
 *
 * Neden: GSI'nın deklaratif <div id="g_id_onload"> yöntemi yalnızca ilk
 * sayfa yüklenişinde taranır. React SPA'da /profil'e client-side gidince
 * div'ler geç mount olur ve buton HİÇ çıkmaz. Programatik
 * google.accounts.id.renderButton her mount'ta güvenle çalışır.
 */
import { useEffect, useRef } from 'react';

export default function GoogleSignInButton({ clientId, onCredential, width = 280 }) {
  const holderRef = useRef(null);

  useEffect(() => {
    if (!clientId || !holderRef.current) return;
    let cancelled = false;
    let pollId;

    const tryInit = () => {
      if (cancelled) return;
      const gsi = window.google?.accounts?.id;
      if (!gsi) {
        // GSI script (index.html) henüz yüklenmedi — kısa aralıkla bekle
        pollId = setTimeout(tryInit, 250);
        return;
      }
      try {
        gsi.initialize({
          client_id: clientId,
          callback: (resp) => {
            if (resp?.credential) onCredential(resp.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        if (holderRef.current) {
          holderRef.current.innerHTML = '';
          gsi.renderButton(holderRef.current, {
            type: 'standard',
            theme: 'filled_black',
            text: 'signin_with',
            shape: 'pill',
            locale: 'tr',
            width,
          });
        }
      } catch (e) {
        console.error('[GoogleSignIn] init error:', e);
      }
    };

    tryInit();
    return () => {
      cancelled = true;
      if (pollId) clearTimeout(pollId);
    };
  }, [clientId, onCredential, width]);

  return <div ref={holderRef} className="flex justify-center min-h-[44px]" />;
}
