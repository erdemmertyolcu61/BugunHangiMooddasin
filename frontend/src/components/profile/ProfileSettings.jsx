import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Bell, Palette, Database, AlertTriangle, ChevronRight, ChevronDown, Clock, EyeOff, Ban,
} from 'lucide-react';
import { getWatchlist, getNotifyTime, setNotifyTime, setActivityVisibility, getBlockedUsers, unblockUser } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import { getApiUrl } from '../../utils/apiConfig';
import { isPushSubscribed } from '../../utils/push';

/**
 * Günlük film bildirimi saati seçici — yalnız bu cihaz push'a aboneyse görünür.
 * Saat kullanıcının tüm cihazlarına uygulanır (backend per-user notify_hour).
 */
function NotifyTimeRow() {
  const [subscribed, setSubscribed] = useState(false);
  const [hour, setHour] = useState(18);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sub = await isPushSubscribed();
      if (!alive) return;
      setSubscribed(sub);
      if (sub) {
        try { const r = await getNotifyTime(); if (alive && r?.hour != null) setHour(r.hour); } catch { /* sessiz */ }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!subscribed) return null;

  const onChange = async (e) => {
    const h = parseInt(e.target.value, 10);
    setHour(h);
    try {
      const r = await setNotifyTime(h);
      if (r?.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    } catch { /* sessiz */ }
  };

  return (
    <div className="w-full flex items-center gap-3.5 px-5 py-4">
      <Clock size={17} className="text-ivory/65" />
      <div className="flex-1 min-w-0">
        <p className="font-sans text-[14px] font-semibold text-ivory/80">Günlük Film Saati</p>
        <p className="font-sans text-[12px] text-ivory/60 mt-0.5">
          {saved ? 'Kaydedildi ✓' : 'Günün filmi bildiriminin saati'}
        </p>
      </div>
      <select
        value={hour}
        onChange={onChange}
        aria-label="Günlük bildirim saati"
        className="shrink-0 bg-amber/10 border border-amber/20 rounded-full px-3 py-1.5 font-sans text-[13px] font-bold text-amber/90 focus:outline-none focus:border-amber/50"
      >
        {Array.from({ length: 16 }, (_, i) => i + 8).map((h) => (
          <option key={h} value={h} className="bg-[#1c1512] text-ivory">
            {String(h).padStart(2, '0')}:00
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Settings shortcuts panel.
 */
function ActivityToggleRow() {
  const [hide, setHide] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const token = window.__fc_user_token;
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          if (alive) { setHide(!!d.hide_activity); setLoaded(true); }
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  if (!loaded) return null;

  const toggle = async () => {
    const next = !hide;
    setHide(next);
    await setActivityVisibility(next);
  };

  return (
    <button onClick={toggle}
      className="w-full flex items-center gap-3.5 px-5 py-4 text-left transition-all hover:bg-white/[0.04]">
      <EyeOff size={17} className="text-ivory/65" />
      <div className="flex-1 min-w-0">
        <p className="font-sans text-[14px] font-semibold text-ivory/80">Aktivite Gizliliği</p>
        <p className="font-sans text-[12px] text-ivory/60 mt-0.5">
          {hide ? 'Aktiviten arkadaşlarından gizli' : 'Aktiviten arkadaşlarına görünür'}
        </p>
      </div>
      <span className={`px-2.5 py-1 rounded-full border font-sans text-[11px] font-bold uppercase tracking-wide shrink-0 ${
        hide ? 'bg-rose-500/10 border-rose-500/20 text-rose-400/70' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400/70'
      }`}>
        {hide ? 'Gizli' : 'Açık'}
      </span>
      <ChevronRight size={14} className="text-ivory/60 shrink-0" />
    </button>
  );
}

/** Engellenen kullanıcılar yönetimi — UGC moderasyonunun kullanıcı tarafı. */
function BlockedUsersRow() {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(null);

  const load = async () => {
    const d = await getBlockedUsers();
    setBlocked(d.blocked || []);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && blocked === null) load();
  };

  const handleUnblock = async (id) => {
    try { await unblockUser(id); } catch { /* sessiz */ }
    setBlocked((b) => (b || []).filter((u) => u.id !== id));
  };

  return (
    <div>
      <button onClick={toggle}
        className="w-full flex items-center gap-3.5 px-5 py-4 text-left transition-all hover:bg-white/[0.04]">
        <Ban size={17} className="text-ivory/65" />
        <div className="flex-1 min-w-0">
          <p className="font-sans text-[14px] font-semibold text-ivory/80">Engellenen Kullanıcılar</p>
          <p className="font-sans text-[12px] text-ivory/60 mt-0.5">İçerikleri sana görünmez</p>
        </div>
        {open ? <ChevronDown size={14} className="text-ivory/60 shrink-0" />
              : <ChevronRight size={14} className="text-ivory/60 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-2">
          {blocked === null ? (
            <p className="text-[12px] text-ivory/40">Yükleniyor...</p>
          ) : blocked.length === 0 ? (
            <p className="text-[12px] text-ivory/40 italic">Engellediğin kimse yok.</p>
          ) : (
            blocked.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">
                  {u.avatar
                    ? <img src={resolveAvatarUrl(u.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <span className="w-full h-full flex items-center justify-center text-[11px] font-bold text-amber/60">{(u.username || '?')[0].toUpperCase()}</span>}
                </span>
                <p className="flex-1 text-[12px] font-semibold text-ivory/80 truncate">@{u.username}</p>
                <button onClick={() => handleUnblock(u.id)}
                  className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-ivory/60 hover:text-ivory hover:border-white/25 transition-all">
                  Engeli Kaldır
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfileSettings({ theme, toggleTheme, logout, navigate, onNotifOpen }) {
  const settings = [
    {
      icon: Bell, label: 'Bildirimler', desc: 'Öneri ve istek bildirimleri',
      action: onNotifOpen,
    },
    {
      icon: Palette, label: 'Görünüm',
      desc: theme === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç',
      action: toggleTheme,
      badge: theme === 'dark' ? 'Karanlık' : 'Aydınlık',
    },
    {
      icon: Database, label: 'Verilerim', desc: 'Dışa aktar veya yedekle',
      action: async () => {
        try {
          const wl = await getWatchlist();
          const blob = new Blob([JSON.stringify(wl, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'sinemood-verilerim.json'; a.click();
          URL.revokeObjectURL(url);
        } catch { alert('Veri dışa aktarılamadı.'); }
      },
    },
    {
      icon: AlertTriangle, label: 'Hesabı Sil', desc: 'Tüm verileri kalıcı olarak sil', danger: true,
      action: async () => {
        if (!window.confirm('Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?')) return;
        try {
          const token = window.__fc_user_token;
          const res = await fetch(getApiUrl('/api/auth/account'), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (res.ok) { logout(); navigate('/'); }
          else alert('Hesap silinemedi. Lütfen tekrar deneyin.');
        } catch { alert('Bir hata oluştu.'); }
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.40, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3">

      <div className="flex items-center gap-2.5 px-1">
        <Settings size={14} className="text-amber/50" />
        <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">
          Ayarlar
        </p>
      </div>

      <div className="rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
        <NotifyTimeRow />
        <ActivityToggleRow />
        <BlockedUsersRow />
        {settings.map(({ icon: Icon, label, desc, danger, action, badge }) => (
          <button key={label} onClick={action}
            className={`w-full flex items-center gap-3.5 px-5 py-4 text-left transition-all
              ${danger ? 'hover:bg-rose-500/8' : 'hover:bg-white/[0.04]'}`}>
            <Icon size={17} className={danger ? 'text-rose-400/70' : 'text-ivory/65'} />
            <div className="flex-1 min-w-0">
              <p className={`font-sans text-[14px] font-semibold ${danger ? 'text-rose-400/80' : 'text-ivory/80'}`}>
                {label}
              </p>
              <p className="font-sans text-[12px] text-ivory/60 mt-0.5">{desc}</p>
            </div>
            {badge && (
              <span className="px-2.5 py-1 rounded-full bg-amber/10 border border-amber/20 font-sans text-[11px] font-bold text-amber/70 uppercase tracking-wide shrink-0">
                {badge}
              </span>
            )}
            <ChevronRight size={14} className="text-ivory/60 shrink-0" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
