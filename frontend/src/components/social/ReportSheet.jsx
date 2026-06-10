import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flag, Loader2, Check, Ban } from 'lucide-react';
import { reportContent, blockUser } from '../../services/api';
import { track } from '../../utils/analytics';

const REASONS = [
  { id: 'spam', label: 'Spam / alakasız' },
  { id: 'hakaret', label: 'Hakaret / taciz' },
  { id: 'spoiler', label: 'İşaretsiz spoiler' },
  { id: 'uygunsuz', label: 'Uygunsuz içerik' },
  { id: 'diger', label: 'Diğer' },
];

/**
 * UGC şikayet sheet'i — store (App Store/Play) zorunluluğu:
 * her herkese açık içerik şikayet edilebilmeli + yazarı engellenebilmeli.
 *
 * Props: contentType ('review'|'list'|'profile'), contentId,
 *        author {id, username} (engelleme için, opsiyonel), onClose, onBlocked
 */
export default function ReportSheet({ contentType, contentId, author, onClose, onBlocked }) {
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const submit = async (r) => {
    if (busy || done) return;
    setReason(r);
    setBusy(true);
    try {
      await reportContent(contentType, contentId, r);
      track('ugc_report', { type: contentType, reason: r });
      setDone(true);
    } catch { /* sessiz — kullanıcıya yine teşekkür göster */ setDone(true); }
    finally { setBusy(false); }
  };

  const handleBlock = async () => {
    if (!author?.id || blockBusy || blocked) return;
    setBlockBusy(true);
    try {
      await blockUser(author.id);
      track('user_block', { target: author.id });
      setBlocked(true);
      onBlocked?.(author.id);
    } catch { /* sessiz */ }
    finally { setBlockBusy(false); }
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[1101] flex flex-col
                   bg-[#161010] border-t border-rose-500/20 rounded-t-[2rem] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] pb-safe"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-white/15" />
        </div>

        <div className="flex items-center justify-between px-6 pt-2 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Flag size={17} className="text-rose-400/80 shrink-0" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-rose-400/60">İÇERİĞİ BİLDİR</p>
              <h3 className="font-serif text-lg font-bold text-ivory">Sorun nedir?</h3>
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat"
            className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-all">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-2">
          {done ? (
            <div className="flex flex-col items-center py-6 text-center gap-2">
              <span className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Check size={22} className="text-emerald-400" />
              </span>
              <p className="font-serif text-base text-ivory/80">Şikayetin alındı</p>
              <p className="text-[12px] text-white/40">En kısa sürede incelenecek. Teşekkürler.</p>
            </div>
          ) : (
            REASONS.map((r) => (
              <button key={r.id} onClick={() => submit(r.id)} disabled={busy}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/8
                           hover:border-rose-400/30 transition-all text-left">
                <span className="text-[14px] text-ivory/85">{r.label}</span>
                {busy && reason === r.id && <Loader2 size={15} className="animate-spin text-rose-400/70" />}
              </button>
            ))
          )}

          {author?.id && (
            <button onClick={handleBlock} disabled={blockBusy || blocked}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border text-[12px] font-bold uppercase tracking-wider transition-all mt-2 ${
                blocked
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400/80'
                  : 'bg-rose-500/8 border-rose-500/20 text-rose-400/80 hover:bg-rose-500/15'
              }`}>
              {blockBusy ? <Loader2 size={13} className="animate-spin" />
                : blocked ? <><Check size={13} /> @{author.username} engellendi</>
                : <><Ban size={13} /> @{author.username} kullanıcısını engelle</>}
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
