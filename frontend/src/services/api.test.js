import { describe, it, expect } from 'vitest';
import { proxyImageUrl } from './api';

describe('proxyImageUrl', () => {
  it('returns null for falsy input', () => {
    expect(proxyImageUrl(null)).toBe(null);
    expect(proxyImageUrl('')).toBe(null);
  });

  it('routes TMDB image URLs through the backend proxy (ISP DNS bypass)', () => {
    const tmdb = 'https://image.tmdb.org/t/p/w500/poster.jpg';
    const out = proxyImageUrl(tmdb);
    expect(out).toContain('/api/image-proxy?url=');
    expect(out).toContain(encodeURIComponent(tmdb));
  });

  it('leaves non-TMDB URLs untouched', () => {
    const other = 'https://example.com/x.jpg';
    expect(proxyImageUrl(other)).toBe(other);
  });
});
