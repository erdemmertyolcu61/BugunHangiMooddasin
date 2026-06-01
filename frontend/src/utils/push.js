/**
 * Web Push yardımcıları — izin iste, abone ol/çık, durum sorgula.
 * VAPID anahtarı backend'de yoksa (push kapalı) tüm akış sessizce devre dışı kalır.
 */
import { getPushPublicKey, subscribePush, unsubscribePush } from '../services/api';

export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
}

/** Mevcut abonelik durumu: true → bu cihaz abone. */
export async function isPushSubscribed() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/** Push backend'de açık mı (VAPID anahtarı var mı)? */
export async function isPushEnabledOnServer() {
  try {
    const { enabled } = await getPushPublicKey();
    return !!enabled;
  } catch {
    return false;
  }
}

/** PWA (Ana Ekrana Eklenmiş) modunda mı? */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone  // iOS Safari
    || false;
}

/** İzin iste + abone ol + backend'e kaydet. Başarılıysa true. */
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const { enabled, public_key } = await getPushPublicKey();
  if (!enabled || !public_key) return { ok: false, reason: 'disabled' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: 'no-sw' };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    });
  }
  await subscribePush({ ...sub.toJSON(), is_pwa: isStandalone() });
  return { ok: true };
}

/** Abonelikten çık + backend'den sil. */
export async function disablePush() {
  if (!pushSupported()) return { ok: false };
  try {
    const reg = await getRegistration();
    if (!reg) return { ok: false };
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribePush(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
