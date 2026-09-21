import { NextRequest, NextResponse } from 'next/server';
import { getRootDomain, isValidDomain } from '@/lib/sender-domain';

// In-memory LRU cache: domain -> { data, contentType, fetchedAt }
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

interface CacheEntry {
  data: ArrayBuffer;
  contentType: string;
  fetchedAt: number;
}

interface NegativeCacheEntry {
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const negativeCache = new Map<string, NegativeCacheEntry>();
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const NEGATIVE_CACHE_MAX_SIZE = 2000;

// 1x1 transparent PNG. Returned with HTTP 200 (instead of 404) when no
// favicon exists for a domain, so the browser's <img> tag loads it cleanly
// without spamming the DevTools console with red 404 errors. Avatar.tsx
// checks `naturalWidth <= 1` in onLoad and falls back to initials.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);
const MISSING_FAVICON_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400', // 1 day
  'X-Bulwark-Favicon': 'missing',
};

function evictOldest() {
  if (cache.size < CACHE_MAX_SIZE) return;
  // Evict the oldest entry
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.fetchedAt < oldestTime) {
      oldestTime = entry.fetchedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain');

  if (!domain || !isValidDomain(domain)) {
    return new NextResponse(null, {
      status: 400,
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // Resolve to root domain so subdomains share the same favicon lookup
  const normalizedDomain = getRootDomain(domain.toLowerCase());

  // Check negative cache (domains known to have no favicon)
  const neg = negativeCache.get(normalizedDomain);
  if (neg && Date.now() - neg.fetchedAt < NEGATIVE_CACHE_TTL_MS) {
    return new NextResponse(TRANSPARENT_PNG, { headers: MISSING_FAVICON_HEADERS });
  }

  // Check cache
  const cached = cache.get(normalizedDomain);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return new NextResponse(cached.data, {
      headers: faviconHeaders(cached.contentType),
    });
  }

  try {
    const upstream = await fetch(
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(normalizedDomain)}.ico`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!upstream.ok) {
      evictNegativeOldest();
      negativeCache.set(normalizedDomain, { fetchedAt: Date.now() });
      return new NextResponse(TRANSPARENT_PNG, { headers: MISSING_FAVICON_HEADERS });
    }

    // Served inline on the webmail origin, so only raster image types pass:
    // an image/svg+xml or text/html favicon opened on its own would run
    // script as the webmail.
    const contentType = rasterFaviconType(upstream.headers.get('content-type'));
    if (!contentType) {
      evictNegativeOldest();
      negativeCache.set(normalizedDomain, { fetchedAt: Date.now() });
      return new NextResponse(TRANSPARENT_PNG, { headers: MISSING_FAVICON_HEADERS });
    }
    const data = await upstream.arrayBuffer();

    // Don't cache empty/tiny responses (likely no real favicon)
    if (data.byteLength < 10) {
      evictNegativeOldest();
      negativeCache.set(normalizedDomain, { fetchedAt: Date.now() });
      return new NextResponse(TRANSPARENT_PNG, { headers: MISSING_FAVICON_HEADERS });
    }

    // Cache the result
    evictOldest();
    cache.set(normalizedDomain, { data, contentType, fetchedAt: Date.now() });

    return new NextResponse(data, {
      headers: faviconHeaders(contentType),
    });
  } catch {
    return new NextResponse(null, {
      status: 502,
      headers: { 'Cache-Control': 'public, max-age=300' }, // 5 min
    });
  }
}

const RASTER_FAVICON_TYPES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/gif',
  'image/jpeg',
  'image/webp',
  'image/bmp',
]);

/** The upstream type when it is a raster image, else null. */
function rasterFaviconType(header: string | null): string | null {
  const type = (header ?? 'image/x-icon').split(';')[0].trim().toLowerCase();
  return RASTER_FAVICON_TYPES.has(type) ? type : null;
}

function faviconHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=1209600', // 2 weeks
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
}

function evictNegativeOldest() {
  if (negativeCache.size < NEGATIVE_CACHE_MAX_SIZE) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of negativeCache) {
    if (entry.fetchedAt < oldestTime) {
      oldestTime = entry.fetchedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) negativeCache.delete(oldestKey);
}
