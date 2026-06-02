import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { track, EVENTS } from '../utils/analytics';
import { getAuthItem, setAuthItem, removeAuthItem } from '../utils/authStorage';

const AUTH_KEY = 'fc_user_token';
const USER_KEY = 'fc_user_info';
const REF_KEY = 'fc_ref';

// iOS PWA localStorage kaybına karşı cookie fallback
function readCookie(key) {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

// Davet linkinden gelen ?ref=<username> değerini yakala ve sakla.
// OAuth yönlendirmesi/yenilemeler arasında kaybolmaması için localStorage'a yazılır.
// İlk gelişte (kayıt öncesi) çağrılır; başarılı YENİ kayıttan sonra temizlenir.
export function captureReferral() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[a-zA-Z0-9_]{2,32}$/.test(ref) && !localStorage.getItem(AUTH_KEY)) {
      localStorage.setItem(REF_KEY, ref.toLowerCase());
    }
  } catch { /* sessiz */ }
}

// Cihaz-yerel watchlist/not önbelleği hesaplar arası sızmasın diye
// giriş/çıkışta temizlenir; backend kullanıcının kendi verisini geri yükler.
const LOCAL_DATA_KEYS = ['fc_watchlist_v2', 'fc_notes_v2', 'fc_watchlist_deleted'];
function clearLocalUserData() {
  LOCAL_DATA_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch {}
  });
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    let u = null;
    try { u = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch {}
    if (!u) {
      const cookie = readCookie(USER_KEY);
      if (cookie) {
        try { u = JSON.parse(cookie); localStorage.setItem(USER_KEY, cookie); } catch {}
      }
    }
    return u;
  });
  const [token, setToken] = useState(() => {
    let t = localStorage.getItem(AUTH_KEY);
    if (!t) {
      t = readCookie(AUTH_KEY);
      if (t) localStorage.setItem(AUTH_KEY, t);
    }
    return t || null;
  });

  // { ok: true } veya { ok: false, error: '...' } döndürür ki UI geri bildirim verebilsin.
  const login = useCallback(async (googleCredential) => {
    const ctrl = new AbortController();
    // Render free-tier soğuk başlatma uzun sürebilir → 35sn timeout
    const timer = setTimeout(() => ctrl.abort(), 35000);
    const authUrl = getApiUrl('/api/auth/google');
    try {
      const ref = (() => { try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; } })();
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: googleCredential, ref }),
        signal: ctrl.signal,
      });
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        const detail = (data && (data.detail || data.message)) || `Sunucu hatası (${res.status})`;
        console.error('[Auth] Google login failed:', res.status, detail);
        return { ok: false, error: String(detail) };
      }
      if (!data?.token) return { ok: false, error: 'Sunucudan geçersiz yanıt' };
      // Önceki (anonim veya başka) hesabın yerel önbelleğini temizle
      clearLocalUserData();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(AUTH_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setAuthItem(AUTH_KEY, data.token);
      setAuthItem(USER_KEY, JSON.stringify(data.user));
      window.__fc_user_token = data.token;
      track(EVENTS.SIGNUP, { is_new: !!data.is_new });
      // Davet atıfı backend'de işlendi → ref'i temizle (tekrar atıf olmasın)
      if (data.is_new) {
        try {
          if (localStorage.getItem(REF_KEY)) track(EVENTS.INVITED_SIGNUP);
          localStorage.removeItem(REF_KEY);
        } catch {}
      }
      return { ok: true };
    } catch (e) {
      // Teşhis: gerçek hata tipi/mesajı + hedef host. "Failed to fetch" → ağ/CORS,
      // host onrender ise eski bundle, railway ise farklı bir sorun.
      let host = '';
      try { host = new URL(authUrl).host; } catch { host = authUrl; }
      const msg = e?.name === 'AbortError'
        ? 'Sunucu yanıt vermedi (uyanıyor olabilir, birkaç saniye sonra tekrar dene).'
        : `Bağlantı hatası [${e?.name || 'Error'}: ${e?.message || e}] · hedef: ${host}`;
      console.error('[Auth] Google login error:', e, 'url:', authUrl);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  }, []);

  // SADECE YEREL geliştirme — Google olmadan sahte kullanıcıyla giriş.
  // Backend üretimde 403 döndürür; buton zaten yalnız DEV build'inde gösterilir.
  const devLogin = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/auth/dev-login'), { method: 'POST' });
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok || !data?.token) {
        return { ok: false, error: (data && data.detail) || 'Dev giriş başarısız' };
      }
      clearLocalUserData();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(AUTH_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setAuthItem(AUTH_KEY, data.token);
      setAuthItem(USER_KEY, JSON.stringify(data.user));
      window.__fc_user_token = data.token;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Bağlantı hatası (backend çalışıyor mu?)' };
    }
  }, []);

  // E-posta + şifre ile giriş/kayıt (Google'dan bağımsız).
  // mode: 'login' | 'register'. { ok } veya { ok:false, error } döndürür.
  const emailAuth = useCallback(async (mode, { email, password, name = '' }) => {
    const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const authUrl = getApiUrl(path);
    try {
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register' ? { email, password, name } : { email, password }),
      });
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok || !data?.token) {
        return { ok: false, error: (data && data.detail) || `Sunucu hatası (${res.status})` };
      }
      clearLocalUserData();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(AUTH_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setAuthItem(AUTH_KEY, data.token);
      setAuthItem(USER_KEY, JSON.stringify(data.user));
      window.__fc_user_token = data.token;
      track(EVENTS.SIGNUP, { is_new: !!data.is_new, method: 'email' });
      return { ok: true };
    } catch (e) {
      let host = '';
      try { host = new URL(authUrl).host; } catch { host = authUrl; }
      return { ok: false, error: `Bağlantı hatası [${e?.name || 'Error'}: ${e?.message || e}] · hedef: ${host}` };
    }
  }, []);

  const emailLogin = useCallback((email, password) => emailAuth('login', { email, password }), [emailAuth]);
  const emailRegister = useCallback((email, password, name) => emailAuth('register', { email, password, name }), [emailAuth]);

  // Startup: IndexedDB'den hydrate et (iOS localStorage+cookie silinmişse) + expiry check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let currentToken = token;
      let currentUser = user;

      // IndexedDB fallback (iOS PWA localStorage+cookie tahliyesine karşı)
      if (!currentToken) {
        try {
          const storedToken = await getAuthItem(AUTH_KEY);
          const storedUser = await getAuthItem(USER_KEY);
          if (storedToken && !cancelled) {
            currentToken = storedToken;
            try { localStorage.setItem(AUTH_KEY, storedToken); } catch {}
            window.__fc_user_token = storedToken;
          }
          if (storedUser && !cancelled) {
            try {
              currentUser = JSON.parse(storedUser);
              localStorage.setItem(USER_KEY, storedUser);
            } catch {}
          }
        } catch {}
      }

      if (cancelled) return;

      // Expiry check
      if (currentToken) {
        try {
          const payload = JSON.parse(atob(currentToken.split('.')[1]));
          if (payload.exp * 1000 < Date.now()) {
            await removeAuthItem(AUTH_KEY);
            await removeAuthItem(USER_KEY);
            setToken(null);
            setUser(null);
            window.__fc_user_token = null;
            return;
          }
        } catch {
          await removeAuthItem(AUTH_KEY);
          await removeAuthItem(USER_KEY);
          setToken(null);
          setUser(null);
          window.__fc_user_token = null;
          return;
        }
      }

      // State'i güncelle (hydration sonrası fark varsa)
      if (!cancelled) {
        if (currentToken !== token) setToken(currentToken);
        if (currentUser !== user && currentUser) setUser(currentUser);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = useCallback(() => {
    clearLocalUserData();
    setToken(null);
    setUser(null);
    removeAuthItem(AUTH_KEY);
    removeAuthItem(USER_KEY);
    window.__fc_user_token = null;
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      const json = JSON.stringify(next);
      localStorage.setItem(USER_KEY, json);
      setAuthItem(USER_KEY, json);
      return next;
    });
  }, []);

  // Expose token on window for api.js to pick up
  useEffect(() => {
    window.__fc_user_token = token;
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, devLogin, emailLogin, emailRegister, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
