/**
 * useDocumentMeta — SPA için sayfa-başı SEO meta yönetimi.
 *
 * Route değişince document.title, <meta name="description">, <link rel="canonical">
 * ve og:title/og:url etiketlerini günceller. Bağımsız (ek paket yok).
 *
 * Kullanım:
 *   useDocumentMeta({ title: 'Keşfet — Sinemood', description: '...' });
 * canonical verilmezse mevcut pathname'den türetilir.
 */
import { useEffect } from 'react';

const HOST = (import.meta.env.VITE_SITEMAP_HOST || 'https://bug-n-hangi-mooddas-n.vercel.app').replace(/\/$/, '');
const DEFAULT_TITLE = 'Sinemood | Bugün Hangi Mooddasın?';

function upsertMeta(selector, attr, name, content) {
  if (!content) return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export default function useDocumentMeta({ title, description, canonical, image } = {}) {
  useEffect(() => {
    const fullTitle = title || DEFAULT_TITLE;
    document.title = fullTitle;

    const url = canonical || `${HOST}${window.location.pathname}`;

    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description);
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
      upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
    if (image) {
      upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
      upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }
    upsertLink('canonical', url);
  }, [title, description, canonical, image]);
}
