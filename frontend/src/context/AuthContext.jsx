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

  const login = useCallback(async (googleCredential) => {
    try {
      const res = await fetch(getApiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: googleCredential }),
      });
      if (!res.ok) throw new Error('Google login başarısız');
      const data = await res.json();
      // Önceki (anonim veya başka) hesabın yerel önbelleğini temizle
      clearLocalUserData();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(AUTH_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      window.__fc_user_token = data.token;
    } catch (e) {
      console.error('[Auth] Google login error:', e);
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
