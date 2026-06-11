import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ListPlus, Flag } from 'lucide-react';
import { getPublicList, proxyImageUrl, isLoggedIn } from '../services/api';
import { resolveAvatarUrl } from '../utils/apiConfig';
import FilmDetailModal from '../components/FilmDetailModal';
import ReportSheet from '../components/social/ReportSheet';
import ShareButtons from '../components/ShareButtons';
import useDocumentMeta from '../utils/useDocumentMeta';
import { track } from '../utils/analytics';

/**
 * /liste/:slug — herkese açık kullanıcı listesi (WhatsApp paylaşım hedefi).
 * Login GEREKTIRMEZ; ziyaretçiye "Sen de listeni yap" CTA'sı gösterir.
 * (Editöryel /listeler/:slug rotasından ayrıdır.)
 */
export default function PublicList() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  useDocumentMeta({
    title: list ? `${list.name} | Sinemood Listesi` : 'Liste | Sinemood',
    description: list?.description || 'Sinemood topluluğundan bir film listesi.',
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getPublicList(slug);
        if (alive) { setList(data); track('public_list_view', { slug }); }
      } catch (e) {
        if (alive) setError(e.message || 'Liste bulunamadı');
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <ListPlus size={40} className="text-white/15 mb-4" />
        <p className="font-serif text-lg text-ivory/60">{error}</p>
        <button onClick={() => navigate('/')}
          className="mt-4 px-6 py-2.5 rounded-full bg-amber/15 text-amber border border-amber/30 text-xs font-bold uppercase tracking-wider hover:bg-amber/25 transition-all">
          Keşfe Çık
        </button>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="min-h-screen px-4 sm:px-8 pt-24 max-w-5xl mx-auto">
        <div className="h-8 w-1/3 bg-white/5 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="min-h-screen pb-28 pt-safe">
      <header className="max-w-5xl mx-auto px-4 sm:px-8 pt-6">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-ivory/50 hover:text-amber transition-all mb-6">
          <ChevronLeft size={16} /> Sinemood
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber/50 mb-1">TOPLULUK LİSTESİ</p>
            <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight">
              {list.emoji && <span className="mr-2">{list.emoji}</span>}{list.name}
            </h1>
            {list.description && (
              <p className="mt-2 font-serif italic text-ivory/55 text-sm sm:text-base">{list.description}</p>
            )}
          </div>
          <button onClick={() => setReportOpen(true)} title="Listeyi bildir"
            className="p-2.5 rounded-full hover:bg-white/5 text-white/30 hover:text-rose-400/70 transition-all shrink-0">
            <Flag size={15} />
          </button>
        </div>

        {/* Liste sahibi */}
        <button onClick={() => list.owner?.username && navigate(`/u/${list.owner.username}`)}
          className="mt-4 flex items-center gap-2.5 group">
          <span className="w-8 h-8 rounded-full overflow-hidden bg-white/10 ring-1 ring-amber/20">
            {list.owner?.avatar
              ? <img src={resolveAvatarUrl(list.owner.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="w-full h-full flex items-center justify-center text-amber/70 font-serif font-bold text-sm">{(list.owner?.username || '?')[0].toUpperCase()}</span>}
          </span>
          <span className="text-[13px] text-ivory/60">
            <span className="font-semibold text-amber/80 group-hover:text-amber transition-colors">@{list.owner?.username}</span>
            {' '}· {list.count} film
          </span>
        </button>

        <div className="mt-5">
          <ShareButtons compact
            url={window.location.href}
            text={`${list.emoji || '🎬'} "${list.name}" Sinemood listesi:`} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 mt-8">
        {list.items.length === 0 ? (
          <p className="font-serif italic text-ivory/40 py-12 text-center">Bu liste henüz boş.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            {list.items.map((m, i) => (
              <motion.button key={m.tmdb_id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.5) }}
                onClick={() => setSelected({ id: m.tmdb_id, title: m.title, poster_url: m.poster_url })}
                className="group text-left">
                <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/[0.06] group-hover:border-amber/30 transition-all">
                  {m.poster_url
                    ? <img src={proxyImageUrl(m.poster_url)} alt={m.title} loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" />
                    : <div className="w-full h-full flex items-center justify-center text-white/15"><ListPlus size={24} /></div>}
                </div>
                <p className="mt-2 text-[12px] font-serif font-semibold text-ivory/80 line-clamp-1 group-hover:text-amber/90 transition-colors">
                  {m.title}
                </p>
              </motion.button>
            ))}
          </div>
        )}

        {/* Ziyaretçi CTA — büyüme döngüsü */}
        {!isLoggedIn() && (
          <div className="mt-12 p-6 rounded-[2rem] bg-amber/[0.06] border border-amber/15 text-center">
            <p className="font-serif text-lg text-ivory/80">Sen de kendi film listeni yap, arkadaşlarınla paylaş.</p>
            <button onClick={() => navigate('/profil')}
              className="mt-4 px-7 py-3 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-[0.2em] hover:brightness-110 transition-all">
              Sinemood'a Katıl
            </button>
          </div>
        )}
      </main>

      {selected && (
        <FilmDetailModal movieId={selected.id} initialMovie={selected} onClose={() => setSelected(null)} />
      )}

      {reportOpen && (
        <ReportSheet
          contentType="list"
          contentId={slug}
          author={list.owner ? { id: list.owner.id, username: list.owner.username } : null}
          onClose={() => setReportOpen(false)}
        />
      )}
    </motion.div>
  );
}
