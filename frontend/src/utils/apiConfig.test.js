import { describe, it, expect } from 'vitest';
import { getApiUrl, getShareUrl, resolveAvatarUrl } from './apiConfig';

describe('getApiUrl', () => {
  it('prepends a leading slash when missing', () => {
    expect(getApiUrl('api/movies')).toBe('/api/movies');
  });

  it('keeps an existing leading slash (same-origin relative)', () => {
    expect(getApiUrl('/api/movies')).toBe('/api/movies');
  });
});

describe('getShareUrl', () => {
  it('returns an absolute backend URL for share/OG links', () => {
    const url = getShareUrl('/film/123');
    expect(url).toMatch(/^https?:\/\//);
    expect(url.endsWith('/film/123')).toBe(true);
  });
});

describe('resolveAvatarUrl', () => {
  it('returns empty string for falsy input', () => {
    expect(resolveAvatarUrl('')).toBe('');
    expect(resolveAvatarUrl(null)).toBe('');
  });

  it('keeps external (Google) URLs untouched', () => {
    const g = 'https://lh3.googleusercontent.com/a/abc';
    expect(resolveAvatarUrl(g)).toBe(g);
  });

  it('serves /uploads and /api paths via same-origin (relative) base', () => {
    expect(resolveAvatarUrl('/uploads/x.png')).toBe('/uploads/x.png');
    expect(resolveAvatarUrl('/api/avatar/1')).toBe('/api/avatar/1');
  });
});
