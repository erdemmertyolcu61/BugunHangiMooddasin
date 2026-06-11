import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Quote, Loader2, AlertTriangle } from 'lucide-react';
import { saveMovieReview } from '../../services/api';
import { track } from '../../utils/analytics';

const MAX_LEN = 280;

/**
 * "Söz Bırak" — film için herkese açık mini yorum yazma sheet'i
 * (AddToListSheet deseni). 280 karakter, spoiler işaretleme destekli.
 */
export default function ReviewComposerSheet({ movie, initialContent = '', initialSpoiler = false, onClose, onSaved }) {
  const [content, setContent] = useState(initialContent);
  const [hasSpoiler, setHasSpoiler] = useState(initialSpoiler);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remaining = MAX_LEN - content.length;
  const movieId = movie?.id || movie?.tmdb_id;

  const handleSave = async () => {
    const text = content.trim();
    if (text.length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      await saveMovieReview(movieId, text, hasSpoiler);
      track('review_saved', { movie_id: movieId });
      // onSaved handles both optimistic UI update AND closing the sheet
      if (onSaved) onSaved({ content: text, has_spoiler: hasSpoiler });
      else onClose();
    } catch (e) {
      setError(e.message || 'Söz kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[1001] flex flex-col
                   bg-[#161010] border-t border-amber/20 rounded-t-[2rem] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] pb-safe"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-white/15" />
        </div>

        <div className="flex items-center justify-between px-6 pt-2 pb-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Quote size={18} className="text-amber shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber/50">SÖZ BIRAK</p>
              <h3 className="font-serif text-lg font-bold text-ivory line-clamp-1">{movie?.title}</h3>
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat"
            className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-all">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-3">
          <p className="text-[11px] text-white/40">
            Sözün <span className="text-amber/70 font-semibold">herkese açık</span> olur, film sayfasında tüm Sinemood topluluğu görür.
          </p>
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
            placeholder="Bu film hakkında tek bir söz söyleyecek olsan..."
            rows={4}
            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-2xl text-base font-serif text-ivory
                       placeholder:text-ivory/30 placeholder:italic focus:outline-none focus:border-amber/40 resize-none"
          />
          <div className="flex items-center justify-between">
            <button onClick={() => setHasSpoiler(!hasSpoiler)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${
                hasSpoiler
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
              }`}>
              <AlertTriangle size={11} /> Spoiler içerir
            </button>
            <span className={`text-[11px] font-mono ${remaining < 30 ? 'text-rose-400/80' : 'text-white/30'}`}>
              {remaining}
            </span>
          </div>
          {error && <p className="text-[12px] text-rose-400/90">{error}</p>}
          <button onClick={handleSave} disabled={busy || content.trim().length < 2}
            className="w-full py-3.5 rounded-full bg-amber text-bg text-[12px] font-bold uppercase tracking-[0.2em]
                       disabled:opacity-40 hover:brightness-110 transition-all flex items-center justify-center gap-2">
            {busy ? <Loader2 size={15} className="animate-spin" /> : 'Sözü Yayınla'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
