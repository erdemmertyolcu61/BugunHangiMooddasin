import { useState, useEffect, useRef, useCallback } from 'react';

const CACHE = new Map();

const CACHE_TTL = {
  moodMovies: 5 * 60 * 1000,
  discover: 10 * 60 * 1000,
  search: 3 * 60 * 1000,
  default: 5 * 60 * 1000,
};

function getFresh(key, ttl) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (entry.stale && Date.now() - entry.cachedAt > ttl) {
    CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function isStale(key, ttl) {
  const entry = CACHE.get(key);
  if (!entry) return true;
  return Date.now() - entry.cachedAt > ttl;
}

/**
 * SWR-style cache hook.
 * - Returns cached data immediately if available (even if stale)
 * - Refreshes stale data in background
 * - Deduplicates in-flight requests
 *
 * @param {string} key  Cache key (falsy = skip)
 * @param {() => Promise<any>} fetcher
 * @param {{ ttl?: number, revalidateOnMount?: boolean }} options
 */
export function useCache(key, fetcher, options = {}) {
  const { ttl = CACHE_TTL.default, revalidateOnMount = true } = options;
  const [data, setData] = useState(() => key ? getFresh(key, ttl) : undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const inflightRef = useRef(null);

  const revalidate = useCallback(async () => {
    if (!key || !fetcher) return;
    if (inflightRef.current) return inflightRef.current;
    setIsLoading(true);
    setError(null);
    inflightRef.current = (async () => {
      try {
        const result = await fetcher();
        if (!mountedRef.current) return;
        CACHE.set(key, { data: result, cachedAt: Date.now(), stale: true });
        setData(result);
        setError(null);
      } catch (err) {
        if (mountedRef.current) setError(err);
      } finally {
        if (mountedRef.current) setIsLoading(false);
        inflightRef.current = null;
      }
    })();
    return inflightRef.current;
  }, [key, fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    if (!key) { setData(undefined); setIsLoading(false); setError(null); return; }
    const fresh = getFresh(key, ttl);
    if (fresh !== undefined) {
      setData(fresh);
      setIsLoading(false);
      if (isStale(key, ttl)) revalidate();
    } else if (revalidateOnMount) {
      revalidate();
    }
    return () => { mountedRef.current = false; };
  }, [key]);

  return { data, isLoading, error, revalidate };
}

export function clearCache() {
  CACHE.clear();
}

export default useCache;
