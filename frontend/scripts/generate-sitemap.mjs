/**
 * generate-sitemap.mjs — build öncesi public/sitemap.xml üretir.
 *
 * Statik route'lar + backend/data/lists.json'daki koleksiyon slug'ları.
 * `npm run build` öncesi (prebuild) otomatik çalışır → sitemap her zaman güncel.
 *
 * Kanonik host: VITE_SITEMAP_HOST env'i varsa onu, yoksa varsayılanı kullanır.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST = (process.env.VITE_SITEMAP_HOST || 'https://bug-n-hangi-mooddas-n.vercel.app').replace(/\/$/, '');

// Botların indekslemesini istediğimiz herkese açık route'lar
const STATIC_ROUTES = [
  '/', '/discover', '/listeler', '/surprise',
  '/kafan-mi-karisik', '/carpistir', '/gunun-filmi', '/oyun', '/gizlilik',
];

function loadListSlugs() {
  const candidates = [
    resolve(__dirname, '../../backend/data/lists.json'),
    resolve(__dirname, '../backend/data/lists.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'));
        return Array.isArray(data)
          ? data.map((l) => l && l.slug).filter(Boolean)
          : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

const today = new Date().toISOString().slice(0, 10);
const urls = [
  ...STATIC_ROUTES,
  ...loadListSlugs().map((slug) => `/listeler/${slug}`),
];

const body = urls
  .map(
    (u) =>
      `  <url>\n    <loc>${HOST}${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u === '/' ? 'daily' : 'weekly'}</changefreq>\n    <priority>${u === '/' ? '1.0' : '0.7'}</priority>\n  </url>`
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

const out = resolve(__dirname, '../public/sitemap.xml');
writeFileSync(out, xml, 'utf-8');
console.log(`[sitemap] ${urls.length} URL yazıldı → public/sitemap.xml (host: ${HOST})`);
