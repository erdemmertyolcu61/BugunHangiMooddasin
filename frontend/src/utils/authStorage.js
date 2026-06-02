/**
 * 3-katmanlı auth storage (iOS PWA localStorage tahliyesine karşı)
 *
 * Hiyerarşi: localStorage (sync, hızlı) → IndexedDB (en kalıcı, async) → cookie (server fallback)
 *
 * iOS PWA'da WKWebView localStorage + cookie'yi aynı anda silebilir.
 * IndexedDB farklı disk bölgesinde saklandığı için hayatta kalma olasılığı daha yüksektir.
 */

const DB_NAME = 'sinemood_auth_v1';
const STORE_NAME = 'keyval';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Async read: localStorage → IndexedDB → cookie */
export async function getAuthItem(key) {
  try {
    const ls = localStorage.getItem(key);
    if (ls != null) return ls;
  } catch {}
  try {
    const db = await openDB();
    const val = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { resolve(null); db.close(); };
    });
    if (val != null) {
      try { localStorage.setItem(key, val); } catch {}
      return val;
    }
  } catch {}
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    if (m) {
      const v = decodeURIComponent(m[1]);
      try { localStorage.setItem(key, v); } catch {}
      return v;
    }
  } catch {}
  return null;
}

/** Async write: tüm katmanlara yaz (en az biri çalışırsa yeter) */
export async function setAuthItem(key, value) {
  try { localStorage.setItem(key, value); } catch {}
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => db.close();
  } catch {}
  try {
    document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=7776000; path=/; SameSite=Lax`;
  } catch {}
}

/** Async remove: tüm katmanlardan sil */
export async function removeAuthItem(key) {
  try { localStorage.removeItem(key); } catch {}
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => db.close();
  } catch {}
  try {
    document.cookie = `${key}=; Max-Age=0; path=/; SameSite=Lax`;
  } catch {}
}
