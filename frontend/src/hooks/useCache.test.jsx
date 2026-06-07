import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCache, clearCache } from './useCache';

beforeEach(() => {
  clearCache();
});

describe('useCache', () => {
  it('fetches and returns data on mount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: 1 });
    const { result } = renderHook(() => useCache('k1', fetcher));
    await waitFor(() => expect(result.current.data).toEqual({ ok: 1 }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves cached data immediately to a second consumer (shared cache)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 42 });
    const first = renderHook(() => useCache('shared', fetcher));
    await waitFor(() => expect(first.result.current.data).toEqual({ n: 42 }));

    const second = renderHook(() => useCache('shared', fetcher));
    expect(second.result.current.data).toEqual({ n: 42 });
  });

  it('surfaces fetcher errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCache('err', fetcher));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it('skips fetching when key is falsy', () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useCache('', fetcher));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
