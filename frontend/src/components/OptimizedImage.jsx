import { useState, useRef, useEffect, memo } from 'react';
import { proxyImageUrl } from '../services/api';

/**
 * OptimizedImage — Cross-Platform Movie Poster Component
 *
 * Handles:
 * ─ Responsive srcset with TMDB size variants (w342 / w500 / w780 / original)
 * ─ Intersection Observer lazy loading (no layout shift)
 * ─ Locked aspect ratio (2:3 poster / 16:9 backdrop)
 * ─ Memory-safe sizing — never decode a 2K image for a 150px thumbnail
 * ─ Skeleton placeholder with golden shimmer
 * ─ Cross-browser: loading="lazy" + decoding="async" + fetchpriority
 * ─ Error fallback with title overlay
 *
 * Usage:
 *   <OptimizedImage src={movie.poster_url} alt={movie.title} aspect="poster" size="md" />
 */

// TMDB image size map — maps semantic sizes to actual CDN widths
const TMDB_SIZES = {
  sm: 'w342',    // thumbnail, grid cards on mobile
  md: 'w500',    // standard card, list items
  lg: 'w780',    // detail views, large cards
  xl: 'original' // hero banners, full-screen
};

// Pixel widths for srcset descriptor
const TMDB_WIDTHS = {
  w342: 342,
  w500: 500,
  w780: 780,
  original: 1280,
};

// Aspect ratios
const ASPECTS = {
  poster: '2/3',
  backdrop: '16/9',
  square: '1/1',
};

/**
 * Converts a TMDB URL to a specific size variant.
 * Handles both direct TMDB URLs and proxy URLs.
 * e.g., https://image.tmdb.org/t/p/w500/abc.jpg → w780/abc.jpg
 */
function tmdbResize(url, sizeKey) {
  if (!url) return null;
  // Match /t/p/<size>/ pattern in TMDB URLs
  const match = url.match(/\/t\/p\/(w\d+|original)\//);
  if (match) {
    return url.replace(`/t/p/${match[1]}/`, `/t/p/${sizeKey}/`);
  }
  return url;
}

/**
 * Build srcset string from a TMDB image URL.
 * Returns null for non-TMDB images (they don't support size variants).
 */
function buildSrcSet(url, maxSize = 'lg') {
  if (!url || !url.includes('image.tmdb.org')) return null;

  const sizeOrder = ['sm', 'md', 'lg', 'xl'];
  const maxIdx = sizeOrder.indexOf(maxSize);
  const sizes = sizeOrder.slice(0, maxIdx + 1);

  return sizes
    .map((s) => {
      const sizeKey = TMDB_SIZES[s];
      const resized = tmdbResize(url, sizeKey);
      const proxied = proxyImageUrl(resized);
      return `${proxied} ${TMDB_WIDTHS[sizeKey]}w`;
    })
    .join(', ');
}

/**
 * Determine appropriate sizes attribute based on component size prop.
 */
function buildSizes(size) {
  switch (size) {
    case 'sm': return '(max-width: 640px) 33vw, 180px';
    case 'md': return '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px';
    case 'lg': return '(max-width: 640px) 90vw, (max-width: 1024px) 50vw, 420px';
    case 'xl': return '100vw';
    default:   return '(max-width: 640px) 50vw, 280px';
  }
}

function OptimizedImage({
  src,
  alt = '',
  aspect = 'poster',
  size = 'md',
  priority = false,
  className = '',
  fallbackTitle = '',
  onLoad: onLoadProp,
  onClick,
  style,
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(priority); // priority images skip observer
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || inView) return;
    const el = containerRef.current;
    if (!el) return;

    // Use native IntersectionObserver with generous rootMargin
    // so images start loading before they scroll into view
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px 0px', // start loading 200px before viewport
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [priority, inView]);

  const proxiedSrc = proxyImageUrl(src);
  const srcSet = inView ? buildSrcSet(src, size) : null;
  const sizes = buildSizes(size);

  const handleLoad = () => {
    setLoaded(true);
    onLoadProp?.();
  };

  const handleError = () => {
    setError(true);
  };

  const aspectRatio = ASPECTS[aspect] || ASPECTS.poster;

  return (
    <div
      ref={containerRef}
      className={`optimized-image-container ${className}`}
      style={{
        aspectRatio,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#1c1512',
        ...style,
      }}
      onClick={onClick}
    >
      {/* Skeleton shimmer — visible until image loads */}
      {!loaded && !error && (
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background: 'linear-gradient(110deg, #1c1512 30%, #2a1f1a 50%, #1c1512 70%)',
            backgroundSize: '200% 100%',
            animation: loaded ? 'none' : 'shimmer 1.5s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      )}

      {/* Actual image — only mount when in viewport */}
      {inView && !error && (
        <img
          ref={imgRef}
          src={proxiedSrc}
          srcSet={srcSet || undefined}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchpriority={priority ? 'high' : undefined}
          onLoad={handleLoad}
          onError={handleError}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.35s ease',
            // GPU layer promotion for smooth opacity transition
            transform: 'translate3d(0,0,0)',
            willChange: loaded ? 'auto' : 'opacity',
          }}
        />
      )}

      {/* Error fallback — show title on dark surface */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4"
             style={{
               background: 'linear-gradient(135deg, #1c1512 0%, #2a1f1a 30%, #120d0b 70%, #1c1512 100%)',
             }}>
          <p className="text-center font-serif font-bold italic text-amber/70 text-sm leading-tight">
            {fallbackTitle || alt || 'Film'}
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(OptimizedImage);
