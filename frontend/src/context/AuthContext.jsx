import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { track, EVENTS } from '../utils/analytics';

const AUTH_KEY = 'fc_user_token';
const USER_KEY = 'fc_user_info';
const REF_KEY = 'fc_ref';

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
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_KEY) || null);

  // { ok: true } veya { ok: false, error: '...' } döndürür ki UI geri bildirim verebilsin.
  const login = useCallback(async (googleCredential) => {
    const ctrl = new AbortController();
    // Render free-tier soğuk başlatma uzun sürebilir → 35sn timeout
    const timer = setTimeout(() => ctrl.abort(), 35000);
    try {
      const ref = (() => { try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; } })();
      const res = await fetch(getApiUrl('/api/auth/google'), {
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
      const msg = e?.name === 'AbortError'
        ? 'Sunucu yanıt vermedi (uyanıyor olabilir, birkaç saniye sonra tekrar dene).'
        : 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.';
      console.error('[Auth] Google login error:', e);
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
      window.__fc_user_token = data.token;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Bağlantı hatası (backend çalışıyor mu?)' };
    }
  }, []);

  // E-posta + şifre ile giriş/kayıt (Google'dan bağımsız).
  // mode: 'login' | 'register'. { ok } veya { ok:false, error } döndürür.
  const emailAuth = useCallback(async (mode, { email, password, name = '' }) => {
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(getApiUrl(path), {
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
      window.__fc_user_token = data.token;
      track(EVENTS.SIGNUP, { is_new: !!data.is_new, method: 'email' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.' };
    }
  }, []);

  const emailLogin = useCallback((email, password) => emailAuth('login', { email, password }), [emailAuth]);
  const emailRegister = useCallback((email, password, name) => emailAuth('register', { email, password, name }), [emailAuth]);

  const logout = useCallback(() => {
    clearLocalUserData();
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(USER_KEY);
    window.__fc_user_token = null;
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
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
