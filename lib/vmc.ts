/**
 * The verified mark certificate (VMC) behind a BIMI record: what it has to
 * prove before the logo it carries counts as more than the domain's say-so.
 * Server-only. Ported from the Larus Android app (VmcRules.kt).
 *
 * Without this, a BIMI logo means "the domain that passed DMARC publishes this
 * picture", which a look-alike domain with its own clean DMARC can publish
 * just as well. A VMC is a certificate in which a mark authority states that
 * the trademark belongs to the organization behind the domain, and it carries
 * the logo inside the signed certificate (RFC 3709). The logo taken from here
 * is signed material, not something fetched from a URL the same record named.
 *
 * Four things must hold:
 * 1. The chain ends in one of the roots in lib/vmc-roots.ts. Roots shipped in
 *    the bundle are ignored.
 * 2. The certificate is for message identification (id-kp-BIMI).
 * 3. One of its subject alternative names is a domain the message's DMARC
 *    pass tied it to.
 * 4. The logotype hash matches the image it carries, and that image passes
 *    validateBimiSvg like any other logo.
 *
 * Revocation is not checked: an unreachable responder must not turn into a
 * silent accept, and the other checks stand without it.
 */

import { X509Certificate, createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { DER_IA5_STRING, DER_OCTET_STRING, DER_SEQUENCE, derOid, derText, flattenDer, parseDer, type DerElement } from '@/lib/der';
import { BIMI_MAX_SVG_BYTES, validateBimiSvg } from '@/lib/bimi';

/** id-kp-BrandIndicatorforMessageIdentification */
export const BIMI_KEY_PURPOSE = '1.3.6.1.5.5.7.3.31';
/** RFC 3709 logotype extension, where the mark sits. */
export const LOGOTYPE_EXTENSION = '1.3.6.1.5.5.7.1.12';
/** A VMC with its chain runs to some ten kilobytes; this is room, not a target. */
export const MAX_PEM_BYTES = 128 * 1024;

const MAX_CHAIN = 6;
const SVG_DATA_URI = 'data:image/svg+xml;base64,';
const DIGESTS: Record<string, string> = {
  '1.3.14.3.2.26': 'sha1',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};

/** The certificates in a PEM bundle, in order; comments around the blocks are ignored. */
export function parseCertificates(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  const certificates: X509Certificate[] = [];
  for (const block of blocks) {
    try {
      certificates.push(new X509Certificate(block));
    } catch {
      return [];
    }
  }
  return certificates;
}

const isSelfSigned = (c: X509Certificate) => c.subject === c.issuer;

/** The dNSName entries of the subject alternative name, lower-cased. Wildcards stay literal and never match. */
export function namesVouchedFor(certificate: X509Certificate): string[] {
  const san = certificate.subjectAltName;
  if (!san) return [];
  return san
    .split(/,\s*/)
    .filter((entry) => entry.startsWith('DNS:'))
    .map((entry) => entry.slice(4).toLowerCase());
}

/** The one certificate that issued nothing else in the bundle: the mark itself. */
function leafOf(certificates: X509Certificate[]): X509Certificate | null {
  if (certificates.length === 0) return null;
  const issuers = new Set(certificates.filter((c) => !isSelfSigned(c)).map((c) => c.issuer));
  return certificates.find((c) => !issuers.has(c.subject)) ?? certificates[0];
}

function validAt(certificate: X509Certificate, at: Date): boolean {
  return new Date(certificate.validFrom) <= at && at <= new Date(certificate.validTo);
}

function issuedBy(child: X509Certificate, parent: X509Certificate): boolean {
  try {
    return child.checkIssued(parent) && child.verify(parent.publicKey);
  } catch {
    return false;
  }
}

/**
 * Whether `leaf` chains to one of `roots` at `at`. The bundle's certificates
 * serve as intermediates only; self-signed ones among them are the sender's
 * copy of a root and are dropped.
 */
function chainTrusted(leaf: X509Certificate, bundle: X509Certificate[], roots: X509Certificate[], at: Date): boolean {
  const intermediates = bundle.filter((c) => c !== leaf && !isSelfSigned(c));
  let current = leaf;
  const used = new Set<X509Certificate>();
  for (let depth = 0; depth < MAX_CHAIN; depth++) {
    if (!validAt(current, at)) return false;
    const root = roots.find((r) => issuedBy(current, r));
    if (root) return validAt(root, at);
    const next = intermediates.find((c) => !used.has(c) && c.ca && issuedBy(current, c));
    if (!next) return false;
    used.add(next);
    current = next;
  }
  return false;
}

/** The extnValue bytes of extension `oid` in `certificate`, or null. */
function extensionValue(certificate: X509Certificate, oid: string): Uint8Array | null {
  for (const element of flattenDer(parseDer(certificate.raw))) {
    if (element.tag !== DER_SEQUENCE || element.children.length < 2) continue;
    if (derOid(element.children[0]) !== oid) continue;
    const value = element.children[element.children.length - 1];
    if (value.tag === DER_OCTET_STRING) return value.content;
  }
  return null;
}

/** `packed` decompressed, or as-is when not gzipped, capped at the logo size limit. */
function gunzipped(packed: Buffer): Buffer | null {
  if (packed.length < 2 || packed[0] !== 0x1f || packed[1] !== 0x8b) {
    return packed.length <= BIMI_MAX_SVG_BYTES ? packed : null;
  }
  try {
    // The cap is the point: a few hundred bytes of gzip can name gigabytes.
    return gunzipSync(packed, { maxOutputLength: BIMI_MAX_SVG_BYTES });
  } catch {
    return null;
  }
}

/** The HashAlgAndValue pairs among `elements`: SEQUENCE { AlgorithmIdentifier, OCTET STRING }. */
function hashesIn(elements: DerElement[]): Array<[string, Uint8Array]> {
  const pairs: Array<[string, Uint8Array]> = [];
  for (const element of elements) {
    if (element.tag !== DER_SEQUENCE || element.children.length !== 2) continue;
    const [algorithm, value] = element.children;
    const oid = algorithm.children.map(derOid).find((o) => o !== null);
    const digest = oid ? DIGESTS[oid] : undefined;
    if (digest && value.tag === DER_OCTET_STRING) pairs.push([digest, value.content]);
  }
  return pairs;
}

/**
 * The SVG inside the certificate's logotype extension, checked against the
 * hash beside it. The signature already covers both; a mismatch means this
 * parse read the structure wrong, and then nothing is drawn. RFC 3709 hashes
 * "the image", and certificates differ on whether that is the gzip or what it
 * unpacks to, so both are accepted.
 */
export function embeddedLogo(certificate: X509Certificate): string | null {
  const extension = extensionValue(certificate, LOGOTYPE_EXTENSION);
  if (!extension) return null;
  const elements = flattenDer(parseDer(extension));
  const uri = elements
    .filter((e) => e.tag === DER_IA5_STRING)
    .map(derText)
    .find((text) => text.toLowerCase().startsWith(SVG_DATA_URI));
  if (!uri) return null;
  const packed = Buffer.from(uri.slice(SVG_DATA_URI.length).replace(/\s+/g, ''), 'base64');
  const image = gunzipped(packed);
  if (!image) return null;
  const agrees = hashesIn(elements).some(([digest, expected]) =>
    [image, packed].some((candidate) => Buffer.from(expected).equals(createHash(digest).update(candidate).digest())),
  );
  if (!agrees) return null;
  return image.toString('utf8');
}

/**
 * The logo `pem` proves belongs to one of `domains`, or null when it proves
 * nothing. An empty `roots` means nothing can be verified.
 */
export function verifiedLogo(
  pem: string,
  domains: string[],
  roots: X509Certificate[],
  at: Date = new Date(),
): string | null {
  if (roots.length === 0 || pem.length > MAX_PEM_BYTES) return null;
  const certificates = parseCertificates(pem);
  const leaf = leafOf(certificates);
  if (!leaf) return null;
  if (!(leaf.keyUsage ?? []).includes(BIMI_KEY_PURPOSE)) return null;
  const wanted = domains.map((d) => d.toLowerCase());
  if (!namesVouchedFor(leaf).some((name) => wanted.includes(name))) return null;
  if (!chainTrusted(leaf, certificates, roots, at)) return null;
  const svg = embeddedLogo(leaf);
  if (!svg) return null;
  return validateBimiSvg(new TextEncoder().encode(svg));
}
