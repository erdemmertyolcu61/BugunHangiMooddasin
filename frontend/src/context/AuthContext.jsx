import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/apiConfig';

const AUTH_KEY = 'fc_user_token';
const USER_KEY = 'fc_user_info';

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
      const res = await fetch(getApiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: googleCredential }),
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

  const logout = useCallback(() => {
    clearLocalUserData();
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(USER_KEY);
    window.__fc_user_token = null;
  }, []);

  // Expose token on window for api.js to pick up
  useEffect(() => {
    window.__fc_user_token = token;
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
