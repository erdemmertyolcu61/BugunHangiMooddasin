/**
 * Share utilities — html2canvas capture + platform share helpers.
 */

import html2canvas from 'html2canvas';

// ═══════════════════════════════════════════════════════════════════
// Tailwind v4 → html2canvas uyumu
// Tailwind v4 renkleri oklch()/oklab()/color() olarak yayıyor; html2canvas
// 1.4.x bunları parse edemeyip hata fırlatıyor → paylaşım/indirme görseli
// hiç oluşmuyordu. Aşağıdaki sanitizer, yakalanan DOM klonundaki modern renk
// fonksiyonlarını rgb'ye çevirir (onclone'da, orijinalin computed style'ından).
// ═══════════════════════════════════════════════════════════════════
function _nums(str) {
  return (String(str).match(/-?\d*\.?\d+(?:e-?\d+)?%?/gi) || []);
}
function _toUnit(tok, scale = 1) {
  if (tok == null) return 0;
  const pct = String(tok).includes('%');
  const v = parseFloat(tok);
  return pct ? v / 100 : v / scale;
}
function _gamma(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
function _oklabToRgb(L, a, b, alpha) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const to = (v) => Math.max(0, Math.min(255, Math.round(_gamma(v) * 255)));
  return `rgba(${to(r)}, ${to(g)}, ${to(bb)}, ${alpha == null ? 1 : alpha})`;
}
function _convertColorFn(fn, inner) {
  const [main, alphaTok] = inner.split('/');
  const alpha = alphaTok != null ? _toUnit(alphaTok) : null;
  const t = _nums(main);
  fn = fn.toLowerCase();
  try {
    if (fn === 'oklch') {
      const L = _toUnit(t[0]); // 0..1 (veya %)
      const C = parseFloat(t[1]) || 0;
      const H = (parseFloat(t[2]) || 0) * Math.PI / 180;
      return _oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), alpha);
    }
    if (fn === 'oklab') {
      return _oklabToRgb(_toUnit(t[0]), parseFloat(t[1]) || 0, parseFloat(t[2]) || 0, alpha);
    }
    if (fn === 'color') {
      // color(srgb r g b / a) — r,g,b 0..1
      const to = (v) => Math.max(0, Math.min(255, Math.round((parseFloat(v) || 0) * 255)));
      return `rgba(${to(t[0])}, ${to(t[1])}, ${to(t[2])}, ${alpha == null ? 1 : alpha})`;
    }
  } catch { /* sessiz */ }
  return null;
}
function _sanitizeColorStr(val) {
  if (!val || (!val.includes('oklch') && !val.includes('oklab') && !val.includes('color('))) return val;
  return val.replace(/(oklch|oklab|color)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (m, fn, inner) => {
    return _convertColorFn(fn, inner) || m;
  });
}
const _COLOR_PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'boxShadow',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'fill', 'stroke',
];
function _sanitizeModernColors(origRoot, cloneRoot) {
  if (!origRoot || !cloneRoot) return;
  const win = origRoot.ownerDocument.defaultView;
  const orig = [origRoot, ...origRoot.querySelectorAll('*')];
  const clone = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
  const len = Math.min(orig.length, clone.length);
  for (let i = 0; i < len; i++) {
    let cs;
    try { cs = win.getComputedStyle(orig[i]); } catch { continue; }
    if (!cs) continue;
    for (const p of _COLOR_PROPS) {
      const v = cs[p];
      if (v && (v.includes('oklch') || v.includes('oklab') || v.includes('color('))) {
        try { clone[i].style[p] = _sanitizeColorStr(v); } catch { /* sessiz */ }
      }
    }
  }
}

/**
 * Capture a DOM element as PNG blob via html2canvas.
 * @param {HTMLElement} element - DOM node to capture
 * @param {object} opts - html2canvas options override
 * @returns {Promise<Blob>} PNG blob
 */
export async function captureElementAsBlob(element, opts = {}) {
  // Yazı tipleri (serif/display) yüklenmeden capture alınırsa html2canvas yedek
  // fonta düşer → görsel "bozuk/çirkin" çıkar. Önce fontların hazır olmasını bekle.
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch { /* sessiz */ }

  const canvas = await html2canvas(element, {
    backgroundColor: '#111111',
    scale: 2,
    useCORS: true,
    imageTimeout: 15000,
    logging: false,
    onclone: (_doc, clonedEl) => {
      try { _sanitizeModernColors(element, clonedEl); } catch { /* sessiz */ }
    },
    ...opts,
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Capture element → share via Web Share API (with image) or download fallback.
 * @param {HTMLElement} element - DOM node to capture
 * @param {string} filename - download filename
 * @param {string} shareText - text for share sheet
 * @returns {Promise<'shared'|'downloaded'|'error'>}
 */
export async function captureAndShare(element, filename = 'sinemood.png', shareText = '', opts = {}) {
  // 1) Görseli üret (bu başarısızsa yapacak bir şey yok)
  let blob;
  try {
    blob = await captureElementAsBlob(element, opts);
  } catch (e) {
    console.error('[shareUtils] capture error:', e);
    return 'error';
  }

  // 2) Önce native paylaşım (mobilde resimli paylaşım sayfası açılır)
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        text: shareText || 'Sinemood | Bugün Hangi Mooddasın?',
        files: [file],
      });
      return 'shared';
    }
  } catch (e) {
    if (e.name === 'AbortError') return 'shared'; // kullanıcı paylaşımı iptal etti
    // Paylaşım başarısız → indirmeye düş (sessiz hata YOK)
    console.warn('[shareUtils] share failed, indirilecek:', e);
  }

  // 3) Her durumda kullanıcı görseli alabilsin → indir
  try {
    downloadBlob(blob, filename);
    return 'downloaded';
  } catch (e) {
    console.error('[shareUtils] download error:', e);
    return 'error';
  }
}

/**
 * Download a blob as file.
 */
export function downloadBlob(blob, filename = 'sinemood.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// Platform share URL helpers
// ═══════════════════════════════════════════════════════════════════

export function shareToWhatsApp(text, url) {
  const msg = url ? `${text} ${url}` : text;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

export function shareToTelegram(text, url) {
  const params = new URLSearchParams();
  if (url) params.set('url', url);
  if (text) params.set('text', text);
  window.open(`https://t.me/share/url?${params.toString()}`, '_blank');
}

export function shareToTwitter(text, url) {
  const params = new URLSearchParams();
  if (text) params.set('text', text);
  if (url) params.set('url', url);
  window.open(`https://twitter.com/intent/tweet?${params.toString()}`, '_blank');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}
