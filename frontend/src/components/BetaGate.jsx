import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Film } from 'lucide-react';
import { getApiUrl } from '../utils/apiConfig';
import { useAuth } from '../context/AuthContext';

const BETA_TOKEN_KEY = 'beta_token';

/**
 * Checks if a stored beta token is still valid.
 * Returns true if valid, false otherwise.
 */
async function verifyStoredToken() {
  const token = localStorage.getItem(BETA_TOKEN_KEY);
  if (!token) return false;
  try {
    const res = await fetch(getApiUrl('/api/auth/verify'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.valid === true;
    }
  } catch {
    // Network error — allow offline access if token exists
    return true;
  }
  localStorage.removeItem(BETA_TOKEN_KEY);
  return false;
}

/**
 * Returns the stored beta token, or null.
 */
export function getBetaToken() {
  return localStorage.getItem(BETA_TOKEN_KEY);
}

/**
 * BetaGate wraps the app. If beta auth is required and user hasn't
 * authenticated, shows a password screen. Otherwise renders children.
 */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function BetaGate({ children }) {
  const [authenticated, setAuthenticated] = useState(null); // null = checking
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login: googleLogin, user: googleUser } = useAuth();

  // If Google login succeeds, mark authenticated
  useEffect(() => {
    if (googleUser) setAuthenticated(true);
  }, [googleUser]);

  // Register Google callback on window so GSI script can call it
  useEffect(() => {
    window.handleGoogleCallback = async (response) => {
      if (response?.credential) {
        await googleLogin(response.credential);
        setAuthenticated(true);
      }
    };
    return () => { delete window.handleGoogleCallback; };
  }, [googleLogin]);

  useEffect(() => {
    // Check if beta gate is needed
    const check = async () => {
      // First try stored token
      const valid = await verifyStoredToken();
      if (valid) {
        setAuthenticated(true);
        return;
      }
      // Check if backend even requires beta auth
      try {
        const res = await fetch(getApiUrl('/api/health'));
        if (res.ok) {
          const data = await res.json();
          if (!data.beta_enabled) {
            // No beta password configured — allow access
            setAuthenticated(true);
            return;
          }
        }
      } catch {
        // Backend unreachable — show gate anyway
      }
      setAuthenticated(false);
    };
    check();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/auth/beta'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(BETA_TOKEN_KEY, data.token);
        setAuthenticated(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Yanlis sifre. Tekrar deneyin.');
        setPassword('');
      }
    } catch {
      setError('Sunucuya ulasilamiyor. Daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Still checking — show nothing (fast)
  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-[#120d0b] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
      </div>
    );
  }

  // Authenticated — render app
  if (authenticated) {
    return children;
  }

  // Beta gate — password screen
  return (
    <div className="min-h-screen bg-[#120d0b] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-12">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber/20 flex items-center justify-center mx-auto mb-6">
            <Film size={32} className="text-amber" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-[#f5f2eb] tracking-tight mb-3">
            Film Connoisseur
          </h1>
          <p className="text-[#f5f2eb]/40 text-sm font-sans">
            Beta Erisimine Hosgeldiniz
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#f5f2eb]/20" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Beta sifresi"
              autoFocus
              className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/10 rounded-2xl text-[#f5f2eb] placeholder:text-white/20 focus:outline-none focus:border-amber/50 focus:bg-white/[0.07] transition-all text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f5f2eb]/20 hover:text-[#f5f2eb]/50 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full py-4 bg-amber text-[#120d0b] rounded-2xl font-bold uppercase text-xs tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(255,191,0,0.15)]"
          >
            {loading ? 'Dogrulaniyor...' : 'Giris Yap'}
          </button>
        </form>

        {GOOGLE_CLIENT_ID && (
          <div className="mt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] uppercase tracking-widest text-[#f5f2eb]/20">veya</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <div
              id="g_id_onload"
              data-client_id={GOOGLE_CLIENT_ID}
              data-callback="handleGoogleCallback"
              data-auto_prompt="false"
            />
            <div
              className="g_id_signin flex justify-center"
              data-type="standard"
              data-theme="filled_black"
              data-text="signin_with"
              data-shape="pill"
              data-locale="tr"
              data-width="300"
            />
          </div>
        )}

        <p className="text-center text-[#f5f2eb]/15 text-[10px] mt-12 uppercase tracking-[0.3em]">
          Davetiye Gereklidir
        </p>
      </motion.div>
    </div>
  );
}
