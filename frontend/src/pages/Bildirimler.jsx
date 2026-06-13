import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, UserPlus, Film, Heart, MessageCircle, ChevronLeft } from 'lucide-react';
import { getAllNotifications, respondFriendRequest, isLoggedIn } from '../services/api';
import { resolveAvatarUrl } from '../utils/apiConfig';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return 'az önce';
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
}

const ICONS = {
  friend_request: UserPlus,
  movie_recommendation: Film,
  review_like: Heart,
  review_reply: MessageCircle,
};

const LABELS = {
  friend_request: 'seni arkadaş eklemek istiyor',
  movie_recommendation: 'sana film önerdi',
  review_like: 'sözünü beğendi',
  review_reply: 'sözüne yanıt verdi',
};

export default function Bildirimler() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [responded, setResponded] = useState(new Set());

  useEffect(() => {
    if (!isLoggedIn()) return;
    getAllNotifications().then((d) => setItems(d?.notifications || [])).catch(() => setItems([]));
  }, []);

  const handleFriendRespond = async (requestId, action) => {
    try {
      await respondFriendRequest(requestId, action);
      setResponded((s) => new Set(s).add(requestId));
    } catch { /* */ }
  };

  if (!isLoggedIn()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-white/40 font-serif text-sm">Bildirimleri görmek için giriş yap.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 pt-safe">
      <div className="max-w-2xl mx-auto px-4 sm:px-8">
        <div className="flex items-center gap-3 py-5">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-all">
            <ChevronLeft size={22} />
          </button>
          <Bell size={18} className="text-amber/60" />
          <h1 className="font-serif text-lg font-bold">Bildirimler</h1>
        </div>

        {items === null ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bell size={32} className="mx-auto text-white/15 mb-3" />
            <p className="text-white/35 font-serif text-sm">Henüz bildirim yok.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = ICONS[item.type] || Bell;
              const label = LABELS[item.type] || '';
              const from = item.from_user || {};
              const isFriendReq = item.type === 'friend_request';
              const alreadyResponded = isFriendReq && responded.has(item.request_id);

              return (
                <div key={item.id}
                  className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-all">
                  <span className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 ring-1 ring-amber/15">
                    {from.avatar
                      ? <img src={resolveAvatarUrl(from.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : <span className="w-full h-full flex items-center justify-center text-[12px] font-bold text-amber/60">
                          {(from.username || '?')[0].toUpperCase()}
                        </span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-ivory/90">
                      <span className="font-semibold text-amber/80">@{from.username}</span>{' '}
                      {label}
                    </p>
                    {item.note && <p className="text-[12px] text-white/40 mt-0.5 truncate">"{item.note}"</p>}
                    {item.review_preview && <p className="text-[12px] text-white/40 mt-0.5 truncate">"{item.review_preview}"</p>}
                    {item.reply_preview && <p className="text-[12px] text-white/40 mt-0.5 truncate">"{item.reply_preview}"</p>}
                    {item.movie_title && (
                      <p className="text-[11px] text-amber/50 mt-0.5">{item.movie_title}</p>
                    )}
                    <span className="text-[10px] text-white/20">{timeAgo(item.created_at)}</span>

                    {isFriendReq && !alreadyResponded && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleFriendRespond(item.request_id, 'ACCEPT')}
                          className="px-3 py-1 rounded-full bg-amber/20 text-amber text-[11px] font-bold hover:bg-amber/30 transition-all">
                          Kabul Et
                        </button>
                        <button onClick={() => handleFriendRespond(item.request_id, 'DECLINE')}
                          className="px-3 py-1 rounded-full bg-white/5 text-white/50 text-[11px] font-bold hover:bg-white/10 transition-all">
                          Reddet
                        </button>
                      </div>
                    )}
                    {alreadyResponded && (
                      <p className="text-[11px] text-green-400/60 mt-1">Yanıtlandı</p>
                    )}
                  </div>
                  <Icon size={14} className="text-white/20 mt-1 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
