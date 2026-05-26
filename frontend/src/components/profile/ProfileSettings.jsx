import React from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Bell, Palette, Database, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { getWatchlist } from '../../services/api';
import { getApiUrl } from '../../utils/apiConfig';

/**
 * Settings shortcuts panel.
 */
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
