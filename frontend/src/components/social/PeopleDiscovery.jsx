import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Users, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSimilarUsers, getTopRecommenders, sendFriendRequest } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import { track } from '../../utils/analytics';

/**
 * Kişi keşfi — "Senin gibi izleyenler" (zevk haritası benzerliği) +
 * yedek olarak en aktif topluluk önericileri. Akış boşken arkadaş
 * edinme yolunu açar (içerik çarkının ilk dişlisi).
 */
export default function PeopleDiscovery({ loggedIn = false }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState(null);
  const [title, setTitle] = useState('Senin Gibi İzleyenler');
  const [sent, setSent] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      let list = [];
      if (loggedIn) {
        const sim = await getSimilarUsers();
        list = sim.users || [];
      }
      if (list.length === 0) {
        const top = await getTopRecommenders();
        list = (top.users || []).map((u) => ({ ...u, match: null }));
        if (alive && list.length > 0) setTitle('Topluluğun Gurmeleri');
      }
      if (alive) setUsers(list);
    })();
    return () => { alive = false; };
  }, [loggedIn]);

  if (!users || users.length === 0) return null;

  const onAdd = async (u) => {
    if (sent[u.id]) return;
    try {
      await sendFriendRequest(u.username);
      setSent((s) => ({ ...s, [u.id]: true }));
      track('discovery_friend_request', { target: u.id });
    } catch {
      // zaten istek atılmış olabilir — yine de işaretle
      setSent((s) => ({ ...s, [u.id]: true }));
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2.5 px-1 mb-3">
        <Users size={14} className="text-amber/50" />
        <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">{title}</p>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar -mx-2 px-2">
        {users.map((u, i) => (
          <motion.div key={u.id}
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="shrink-0 w-[124px] p-3 rounded-2xl bg-[#1a1310] border border-white/[0.05] flex flex-col items-center text-center gap-2"
          >
            <button onClick={() => navigate(`/u/${u.username}`)}
              className="w-12 h-12 rounded-full overflow-hidden bg-white/10 ring-2 ring-amber/20">
              {u.avatar
                ? <img src={resolveAvatarUrl(u.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : <span className="w-full h-full flex items-center justify-center text-amber/70 font-serif font-bold">{(u.username || '?')[0].toUpperCase()}</span>}
            </button>
            <button onClick={() => navigate(`/u/${u.username}`)} className="min-w-0 w-full">
              <p className="text-[12px] font-semibold text-ivory truncate">@{u.username}</p>
              {u.match != null ? (
                <p className="text-[10px] font-bold text-emerald-400/80">%{u.match} uyum</p>
              ) : u.rec_count != null ? (
                <p className="text-[10px] text-white/35">{u.rec_count} öneri</p>
              ) : null}
            </button>
            {loggedIn && (
              <button onClick={() => onAdd(u)}
                disabled={!!sent[u.id]}
                className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider border transition-all ${
                  sent[u.id]
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400/80'
                    : 'bg-amber/12 border-amber/20 text-amber hover:bg-amber/20'
                }`}
              >
                {sent[u.id] ? <><Check size={9} /> Gönderildi</> : <><UserPlus size={9} /> Ekle</>}
              </button>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
