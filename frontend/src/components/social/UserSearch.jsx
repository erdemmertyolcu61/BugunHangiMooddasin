import { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { searchUsers, sendFriendRequest } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';

export default function UserSearch({ onViewProfile }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(new Set());
  const inputRef = useRef(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      searchUsers(query).then((d) => {
        setResults(d?.users || []);
        setLoading(false);
      }).catch(() => { setResults([]); setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleAdd = async (username) => {
    try {
      await sendFriendRequest(username);
      setSent((s) => new Set(s).add(username));
    } catch { /* */ }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kullanıcı ara..."
          className="w-full pl-9 pr-8 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[13px] max-sm:text-[16px] text-ivory/80 placeholder:text-white/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber/40"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-white/30 hover:text-white/60">
            <X size={14} />
          </button>
        )}
      </div>

      {loading && <div className="h-10 rounded-xl bg-white/5 animate-pulse" />}

      {!loading && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-all">
              <button onClick={() => onViewProfile?.(u.username)}
                className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 ring-1 ring-amber/15">
                {u.avatar
                  ? <img src={resolveAvatarUrl(u.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  : <span className="w-full h-full flex items-center justify-center text-[13px] font-bold text-amber/60">{(u.username || '?')[0].toUpperCase()}</span>}
              </button>
              <button onClick={() => onViewProfile?.(u.username)} className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-semibold text-amber/75 truncate">@{u.username}</p>
                {u.name && <p className="text-[11px] text-white/40 truncate">{u.name}</p>}
              </button>
              {sent.has(u.username) ? (
                <span className="text-[10px] text-green-400/60 font-bold">Gönderildi</span>
              ) : (
                <button onClick={() => handleAdd(u.username)}
                  className="p-2 rounded-full bg-amber/12 text-amber hover:bg-amber/20 transition-all"
                  aria-label="Arkadaş ekle">
                  <UserPlus size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && query.length >= 2 && results.length === 0 && (
        <p className="text-[12px] text-white/30 text-center py-3">Kullanıcı bulunamadı.</p>
      )}
    </div>
  );
}
