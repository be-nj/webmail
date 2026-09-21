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
import { MAX_PEM_BYTES, parseCertificates, verifiedLogo } from '@/lib/vmc';
import { VMC_ROOTS_PEM } from '@/lib/vmc-roots';

// BIMI sender logos, looked up from the sender domain's DNS.
//
// This route does not know whether any message passed DMARC; the client only
// asks for a domain once a message from it did (see Avatar `dmarcPass`).
//
// The answer is JSON, `{ svg, verified }`, with `svg: null` when the domain
// has no usable logo. `verified` says the logo came out of a verified mark
// certificate that checked out against our own roots (lib/vmc.ts); otherwise
// it is the picture at the record's l= URL and the client shows it unmarked.

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

interface Logo {
  svg: string;
  verified: boolean;
}

interface CacheEntry extends Logo {
  fetchedAt: number;
}

interface NegativeCacheEntry {
  fetchedAt: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const negativeCache = new Map<string, NegativeCacheEntry>();
const inflight = new Map<string, Promise<Logo | null>>();

const resolver = new Resolver({ timeout: 3000, tries: 2 });

// Parsed once. Empty would mean nothing can be verified, never that the check
// is skipped.
const vmcRoots = parseCertificates(VMC_ROOTS_PEM);

function answer(logo: Logo | null, maxAgeSeconds: number) {
  return NextResponse.json(logo ? { svg: logo.svg, verified: logo.verified } : { svg: null, verified: false }, {
    headers: {
      'Cache-Control': `private, max-age=${maxAgeSeconds}`,
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

/** The From domain and, for a subdomain, its organizational domain. */
function lookupDomains(domain: string): string[] {
  return [...new Set([domain, getRootDomain(domain)])];
}

/** Refuse hosts that are, or resolve to, anything but public addresses. */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname) || !isValidDomain(hostname)) throw new NoBimi();
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new NoBimi();
  }
}

async function readCapped(response: Response, cap: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > cap) throw new NoBimi();
  if (!response.body) throw new NoBimi();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
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

/** The body at an https URL on a public host, capped at `cap` bytes. */
async function fetchCapped(target: string, cap: number, accept: string): Promise<Uint8Array> {
  let url = new URL(target);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'https:' || (url.port && url.port !== '443')) throw new NoBimi();
    await assertPublicHost(url.hostname);

    const response = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: accept },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new NoBimi();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`fetch failed: HTTP ${response.status}`);
    return readCapped(response, cap);
  }
  throw new NoBimi();
}

/**
 * The logo out of the record's verified mark, or null when there is none or it
 * does not check out. Either domain may be the one the mark names; the
 * message's DMARC pass already tied it to both.
 */
async function markLogo(record: BimiRecord, domains: string[]): Promise<string | null> {
  if (!record.evidenceUrl) return null;
  try {
    const pem = await fetchCapped(record.evidenceUrl, MAX_PEM_BYTES, 'application/pem-certificate-chain');
    return verifiedLogo(Buffer.from(pem).toString('latin1'), domains, vmcRoots);
  } catch {
    // A mark that can't be fetched falls through to the plain logo, like one
    // that doesn't check out.
    return null;
  }
}

async function fetchLogo(record: BimiRecord, domain: string): Promise<Logo> {
  const marked = await markLogo(record, lookupDomains(domain));
  if (marked) return { svg: marked, verified: true };
  const svg = validateBimiSvg(await fetchCapped(record.logoUrl, BIMI_MAX_SVG_BYTES, 'image/svg+xml'));
  if (!svg) throw new NoBimi();
  return { svg, verified: false };
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

async function loadLogo(domain: string): Promise<Logo | null> {
  try {
    const record = await findRecord(domain);
    const logo = await fetchLogo(record, domain);
    evictOldest(cache, CACHE_MAX_SIZE);
    cache.set(domain, { ...logo, fetchedAt: Date.now() });
    return logo;
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
    return answer(null, Math.round(neg.ttl / 1000));
  }

  const cached = cache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return answer(cached, 86400);
  }

  let pending = inflight.get(domain);
  if (!pending) {
    pending = loadLogo(domain).finally(() => inflight.delete(domain));
    inflight.set(domain, pending);
  }
  const logo = await pending;
  if (logo) return answer(logo, 86400);

  const entry = negativeCache.get(domain);
  return answer(null, Math.round((entry?.ttl ?? ERROR_CACHE_TTL_MS) / 1000));
}
