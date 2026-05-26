/**
 * Share utilities — html2canvas capture + platform share helpers.
 */

import html2canvas from 'html2canvas';

/**
 * Capture a DOM element as PNG blob via html2canvas.
 * @param {HTMLElement} element - DOM node to capture
 * @param {object} opts - html2canvas options override
 * @returns {Promise<Blob>} PNG blob
 */
export async function captureElementAsBlob(element, opts = {}) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#111111',
    scale: 2,
    useCORS: true,
    logging: false,
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
export async function captureAndShare(element, filename = 'sinemood.png', shareText = '') {
  try {
    const blob = await captureElementAsBlob(element);
    const file = new File([blob], filename, { type: 'image/png' });

    // Try Web Share API with file support
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        text: shareText || 'Sinemood — Bugün Hangi Mooddasın?',
        files: [file],
      });
      return 'shared';
    }

    // Fallback: download
    downloadBlob(blob, filename);
    return 'downloaded';
  } catch (e) {
    if (e.name === 'AbortError') return 'shared'; // user cancelled share sheet
    console.error('[shareUtils] captureAndShare error:', e);
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
