import { NextRequest, NextResponse } from 'next/server';
import { Resolver, lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getRootDomain, isValidDomain } from '@/lib/sender-domain';
import {
  BIMI_MAX_SVG_BYTES,
  isPublicAddress,
  parseBimiRecord,
  validateBimiSvg,
  type BimiRecord,
} from '@/lib/bimi';

// BIMI sender logos, looked up from the sender domain's DNS.
//
// This route does not know whether any message passed DMARC; the client only
// asks for a domain once a message from it did (see Avatar `dmarcPass`).
// Responses follow the favicon route: the logo, or a 1x1 transparent PNG with
// HTTP 200 when the domain has none, so <img> falls back without console noise.

const CACHE_MAX_SIZE = 1000;
// A domain that gives up BIMI must not keep its logo for weeks.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MAX_SIZE = 2000;
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Lookup failures (timeouts, SERVFAIL, logo host down) are retried sooner than
// a definite "no BIMI".
const ERROR_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;

interface CacheEntry {
  svg: string;
  fetchedAt: number;
}

interface NegativeCacheEntry {
  fetchedAt: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const negativeCache = new Map<string, NegativeCacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

const resolver = new Resolver({ timeout: 3000, tries: 2 });

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

function missing(maxAgeSeconds: number) {
  return new NextResponse(TRANSPARENT_PNG, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${maxAgeSeconds}`,
      'X-Bulwark-Bimi': 'missing',
    },
  });
}

function logo(svg: string) {
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      // Opened directly instead of through <img>, the SVG still gets no
      // script, no network and no same-origin access.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

class NoBimi extends Error {}

async function resolveBimiTxt(domain: string): Promise<string[][]> {
  try {
    return await resolver.resolveTxt(`default._bimi.${domain}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
    throw error;
  }
}

/**
 * Record at the author domain, else at its organizational domain
 * (`news.shop.de` → `shop.de`). A declination at the author domain stops the
 * lookup, it does not fall through.
 */
async function findRecord(domain: string): Promise<BimiRecord> {
  const own = parseBimiRecord(await resolveBimiTxt(domain));
  if (own === 'declined') throw new NoBimi();
  if (own) return own;

  const org = getRootDomain(domain);
  if (org === domain) throw new NoBimi();
  const inherited = parseBimiRecord(await resolveBimiTxt(org));
  if (!inherited || inherited === 'declined') throw new NoBimi();
  return inherited;
}

/** Refuse hosts that are, or resolve to, anything but public addresses. */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname) || !isValidDomain(hostname)) throw new NoBimi();
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new NoBimi();
  }
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > BIMI_MAX_SVG_BYTES) throw new NoBimi();
  if (!response.body) throw new NoBimi();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BIMI_MAX_SVG_BYTES) {
      await reader.cancel();
      throw new NoBimi();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchLogo(logoUrl: string): Promise<string> {
  let url = new URL(logoUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'https:' || (url.port && url.port !== '443')) throw new NoBimi();
    await assertPublicHost(url.hostname);

    const response = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'image/svg+xml' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new NoBimi();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`logo fetch failed: HTTP ${response.status}`);

    const svg = validateBimiSvg(await readCapped(response));
    if (!svg) throw new NoBimi();
    return svg;
  }
  throw new NoBimi();
}

function evictOldest<T extends { fetchedAt: number }>(map: Map<string, T>, max: number) {
  if (map.size < max) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of map) {
    if (entry.fetchedAt < oldestTime) {
      oldestTime = entry.fetchedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) map.delete(oldestKey);
}

async function loadLogo(domain: string): Promise<string | null> {
  try {
    const record = await findRecord(domain);
    const svg = await fetchLogo(record.logoUrl);
    evictOldest(cache, CACHE_MAX_SIZE);
    cache.set(domain, { svg, fetchedAt: Date.now() });
    return svg;
  } catch (error) {
    const ttl = error instanceof NoBimi ? NEGATIVE_CACHE_TTL_MS : ERROR_CACHE_TTL_MS;
    evictOldest(negativeCache, NEGATIVE_CACHE_MAX_SIZE);
    negativeCache.set(domain, { fetchedAt: Date.now(), ttl });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('domain');
  if (!raw || !isValidDomain(raw)) {
    return new NextResponse(null, {
      status: 400,
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }
  // Exact From domain, not the root: BIMI is looked up at the author domain
  // first and a subdomain may publish its own logo.
  const domain = raw.toLowerCase();

  const neg = negativeCache.get(domain);
  if (neg && Date.now() - neg.fetchedAt < neg.ttl) {
    return missing(Math.round(neg.ttl / 1000));
  }

  const cached = cache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return logo(cached.svg);
  }

  let pending = inflight.get(domain);
  if (!pending) {
    pending = loadLogo(domain).finally(() => inflight.delete(domain));
    inflight.set(domain, pending);
  }
  const svg = await pending;
  if (svg) return logo(svg);

  const entry = negativeCache.get(domain);
  return missing(Math.round((entry?.ttl ?? ERROR_CACHE_TTL_MS) / 1000));
}
