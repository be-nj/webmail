/**
 * BIMI (Brand Indicators for Message Identification) helpers for the
 * /api/bimi route. Server-only.
 *
 * The route answers one question: "which logo does this domain publish in its
 * BIMI record?". Whether a message may show that logo at all is decided on the
 * client, which only asks once the message passed DMARC for this domain.
 *
 * Two tiers. Where the record names a verified mark certificate (`a=`) and it
 * checks out (lib/vmc.ts), the logo is read out of that certificate and is
 * "verified": a mark authority tied the brand to the domain. Otherwise the
 * logo comes from the `l=` URL and means no more than "the domain that passed
 * DMARC publishes this image", which a look-alike domain can do as well.
 */

import { isIP } from 'node:net';

/** SVG Tiny PS logos are small; anything larger is not a BIMI logo. */
export const BIMI_MAX_SVG_BYTES = 32 * 1024;

export interface BimiRecord {
  /** HTTPS URL of the SVG logo. */
  logoUrl: string;
  /** URL of the VMC/CMC, if published; checked by lib/vmc.ts. */
  evidenceUrl?: string;
}

/**
 * Pick the BIMI record out of the TXT records at `<selector>._bimi.<domain>`.
 *
 * Each TXT record arrives as its character-strings; they are concatenated
 * before parsing. Returns
 * - `null` when there is no `v=BIMI1` record, so the caller may try the
 *   organizational domain next;
 * - `'declined'` when there is a record but no usable logo: a declination
 *   record (empty `l=`), a logo URL that is not HTTPS, or more than one
 *   record (which the BIMI draft says means none applies). The lookup stops
 *   here; the domain has spoken.
 */
export function parseBimiRecord(txtRecords: string[][]): BimiRecord | 'declined' | null {
  const candidates = txtRecords
    .map((chunks) => chunks.join('').trim())
    .filter((txt) => /^v\s*=\s*BIMI1\s*(;|$)/i.test(txt));
  if (candidates.length === 0) return null;
  if (candidates.length > 1) return 'declined';

  const tags = new Map<string, string>();
  for (const part of candidates[0].split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (!key || tags.has(key)) continue;
    tags.set(key, part.slice(eq + 1).trim());
  }

  const logo = tags.get('l');
  if (!logo) return 'declined';
  // Older drafts allowed a comma-separated list; only the first one counts.
  const logoUrl = toHttpsUrl(logo.split(',')[0].trim());
  if (!logoUrl) return 'declined';

  const evidence = tags.get('a');
  const evidenceUrl = evidence ? toHttpsUrl(evidence) ?? undefined : undefined;
  return { logoUrl, evidenceUrl };
}

function toHttpsUrl(value: string): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  return url.toString();
}

/**
 * Whether `address` (as returned by DNS) is a public unicast address that a
 * server-side fetch may connect to. Everything else - loopback, private,
 * link-local, CGNAT, multicast, documentation and reserved ranges - is
 * refused so a BIMI record cannot point the server at the internal network.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function isPublicIPv4(address: string): boolean {
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function isPublicIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) is judged by the IPv4 address it carries.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);
  if (lower === '::' || lower === '::1') return false;
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) return false; // documentation
  if (lower.startsWith('64:ff9b:')) return false; // NAT64, reaches IPv4 space
  // Only global unicast (2000::/3) is left as acceptable.
  return (first & 0xe000) === 0x2000;
}

/**
 * Check a downloaded logo and return it as text, or `null` if it is not an
 * SVG this app is willing to serve.
 *
 * The logo is shown through `<img>`, where browsers run no script, and served
 * with a CSP that forbids it anyway. This check is the third layer, not the
 * only one: anything scriptable, anything that pulls in other resources, and
 * anything that is not plainly an SVG document is refused outright rather
 * than cleaned up.
 */
export function validateBimiSvg(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0 || bytes.byteLength > BIMI_MAX_SVG_BYTES) return null;

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }

  // Must be an SVG document: optional BOM, XML declaration, comments and a
  // DOCTYPE without internal subset, then the <svg> root element.
  const body = text
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[^>]*\?>/i, '')
    .replace(/^(\s*(<!--[\s\S]*?-->|<!DOCTYPE[^>[]*>))*/i, '')
    .trimStart();
  if (!/^<svg[\s>]/i.test(body)) return null;
  if (!/<\/svg>\s*$/i.test(body)) return null;

  const forbidden: RegExp[] = [
    /<!DOCTYPE/i, // anything the prefix strip above did not accept
    /<!ENTITY/i, // entity expansion
    /<script/i,
    /<foreignObject/i,
    /<iframe/i,
    /<audio/i,
    /<video/i,
    /<embed/i,
    /<object/i,
    /<image/i, // raster or external images; SVG Tiny PS has none
    /<animate/i, // SVG Tiny PS is static; animation can rewrite href
    /<set[\s>]/i,
    /<handler/i,
    /<listener/i,
    /\son[a-z]+\s*=/i, // event handler attributes
    /javascript:/i,
    /@import/i,
  ];
  if (forbidden.some((re) => re.test(body))) return null;

  // Only same-document references: href="#id", url(#id).
  for (const m of body.matchAll(/(?:xlink:)?(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    if (!m[2].trim().startsWith('#')) return null;
  }
  for (const m of body.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!m[2].trim().startsWith('#')) return null;
  }

  return text;
}
