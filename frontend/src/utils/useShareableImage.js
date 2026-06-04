/**
 * useShareableImage — paylaşılabilir kart görselleri için tek tip hook.
 *
 * Neden: iOS Safari/PWA'da `navigator.share`, dokunma jesti İÇİNDE senkron
 * çağrılmazsa (örn. `await html2canvas(...)` sonrası) `NotAllowedError` ile
 * sessizce başarısız olur → "paylaş çalışmıyor". Çözüm: görseli kart
 * göründüğünde ÖNCEDEN üret (blobRef), tıklamada hazır blob'u senkron paylaş.
 *
 * Tüm paylaşım kartları (Quiz, Zevk Haritası, Çarpışma, Günün Filmi, Mood
 * Kâhini) bunu kullanır → tek davranış, tek hata yönetimi, toast geri bildirimi.
 *
 * Kullanım:
 *   const cardRef = useRef(null);
 *   const { share, download, sharing } = useShareableImage(cardRef, {
 *     fileName: 'sinemood-foo.png',
 *     shareText: `${text} ${url}`.trim(),
 *     backgroundColor: '#0c0a12',
 *     deps: [someId],   // içerik değişince yeniden capture
 *   });
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { captureElementAsBlob, captureAndShare, downloadBlob } from './shareUtils';
import { useToast } from '../context/ToastContext';

const SHARE_TIMEOUT = 30000; // 30sn — html2canvas/navigator.share asılı kalırsa

export function useShareableImage(cardRef, {
  fileName = 'sinemood.png',
  shareText = '',
  backgroundColor = '#0c0a12',
  deps = [],
} = {}) {
  const blobRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const toast = useToast();

  // Kart göründüğünde / içerik değişince görseli önceden üret.
  useEffect(() => {
    let cancelled = false;
    blobRef.current = null;
    if (!cardRef.current) return undefined;
    const t = setTimeout(async () => {
      if (!cardRef.current) return;
      try {
        const blob = await captureElementAsBlob(cardRef.current, { backgroundColor });
        if (!cancelled) blobRef.current = blob;
      } catch (e) { console.warn('[useShareableImage] pre-capture failed, retry on click:', e); }
    }, 650); // giriş animasyonu + görseller otursun
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const share = useCallback(async () => {
    if (sharing) return;
    const blob = blobRef.current;

    // Hazır blob → jest içinde SENKRON paylaş (iOS dostu)
    if (blob) {
      try {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ text: shareText, files: [file] });
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // kullanıcı iptal etti
        // paylaşım reddedildi → indirmeye düş
      }
      try { downloadBlob(blob, fileName); toast.success('Görsel indirildi 📸'); return; } catch { /* aşağı düş */ }
    }

    // Blob henüz hazır değil → üret + paylaş/indir
    if (!cardRef.current) { toast.error('Görsel oluşturulamadı, tekrar dene.'); return; }
    setSharing(true);
    try {
      const r = await Promise.race([
        captureAndShare(cardRef.current, fileName, shareText, { backgroundColor }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SHARE_TIMEOUT)),
      ]);
      if (r === 'downloaded') toast.success('Görsel indirildi 📸');
      else if (r === 'error') toast.error('Görsel oluşturulamadı, tekrar dene.');
    } catch (e) {
      if (e?.message === 'timeout') console.warn('[useShareableImage] share timed out');
      toast.error('Görsel oluşturulamadı, tekrar dene.');
    } finally {
      setSharing(false);
    }
  }, [sharing, fileName, shareText, backgroundColor, toast, cardRef]);

  const download = useCallback(async () => {
    if (sharing) return;
    const ready = blobRef.current;
    if (ready) {
      try { downloadBlob(ready, fileName); toast.success('Görsel indirildi 📸'); return; } catch { /* yeniden üret */ }
    }
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const blob = await captureElementAsBlob(cardRef.current, { backgroundColor });
      downloadBlob(blob, fileName);
      toast.success('Görsel indirildi 📸');
    } catch {
      toast.error('Görsel oluşturulamadı, tekrar dene.');
    } finally {
      setSharing(false);
    }
  }, [sharing, fileName, backgroundColor, toast, cardRef]);

  return { share, download, sharing };
}

export default useShareableImage;
