import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Link2, Check, Trophy } from 'lucide-react';
import { getReferrals } from '../../services/api';
import { copyToClipboard, shareToWhatsApp, shareToTelegram } from '../../utils/shareUtils';
import { track, EVENTS } from '../../utils/analytics';

/**
 * "Arkadaşını Davet Et" kartı — davet linki + sayaç + ödül ilerlemesi.
 * Sadece giriş yapmış kullanıcıya gösterilir (token gerektirir).
 */
export default function ReferralCard() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    getReferrals().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data || !data.invite_url) return null;

  const { count = 0, invite_url, rewards_unlocked = [], next_reward } = data;
  const shareText = 'Sinemood\'da ruh haline göre film keşfet, sana özel önerilerle. Gel beraber çarpışalım!';

  const handleCopy = async () => {
    await copyToClipboard(invite_url);
    track(EVENTS.SHARE_CLICK, { network: 'copy', kind: 'referral' });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pct = next_reward ? Math.min(100, Math.round((count / next_reward.at) * 100)) : 100;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl bg-gradient-to-br from-amber/[0.08] to-purple-600/[0.04] border border-amber/15 p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Gift size={16} className="text-amber" />
        <p className="font-sans text-[13px] font-bold uppercase tracking-[0.25em] text-amber/80">
          Arkadaşını Davet Et
        </p>
      </div>

      <p className="text-sm text-ivory/55 leading-relaxed">
        Linkini paylaş, gelen her arkadaş için rozetler ve özel kilitler açılır.
        Şimdiye dek <span className="text-amber font-bold">{count}</span> kişiyi davet ettin.
      </p>

      {/* Davet linki + kopyala */}
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-[12px] font-mono text-ivory/60 truncate">
          {invite_url}
        </div>
        <button onClick={handleCopy}
          className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] transition-all ${
            copied ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                   : 'bg-amber/15 border border-amber/25 text-amber hover:bg-amber/20'
          }`}>
          {copied ? <Check size={13} /> : <Link2 size={13} />}
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>

      {/* Hızlı paylaş */}
      <div className="flex items-center gap-2.5">
        <button onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'whatsapp', kind: 'referral' }); shareToWhatsApp(shareText, invite_url); }}
          className="flex-1 py-2.5 rounded-xl bg-[#25D366]/15 border border-[#25D366]/25 text-[#25D366] text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-[#25D366]/25 transition-all">
          WhatsApp
        </button>
        <button onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'telegram', kind: 'referral' }); shareToTelegram(shareText, invite_url); }}
          className="flex-1 py-2.5 rounded-xl bg-[#0088cc]/15 border border-[#0088cc]/25 text-[#0088cc] text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-[#0088cc]/25 transition-all">
          Telegram
        </button>
      </div>

      {/* Ödül ilerlemesi */}
      {next_reward ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ivory/45 flex items-center gap-1.5">
              <Trophy size={11} className="text-amber/60" /> Sıradaki: {next_reward.name}
            </span>
            <span className="text-ivory/40 tabular-nums">{count}/{next_reward.at}</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber/60 to-amber" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-emerald-400/80 flex items-center gap-1.5">
          <Trophy size={11} /> Tüm davet ödüllerini açtın, efsanesin!
        </p>
      )}

      {/* Açılan rozetler */}
      {rewards_unlocked.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {rewards_unlocked.map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber/10 border border-amber/20 text-[10px] font-bold text-amber/80">
              <Trophy size={10} /> {r}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
