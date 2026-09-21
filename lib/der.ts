/**
 * Just enough DER to walk a certificate extension. Server-only.
 *
 * The one structure read by hand here is the logotype extension of a verified
 * mark certificate (RFC 3709), which Node's X509Certificate does not expose.
 * Rather than pull in an ASN.1 library for one extension, this reads the
 * encoding directly: a tag byte, a length, and either bytes or more elements.
 *
 * It knows no schema and treats anything it cannot parse as the end of that
 * element; callers look for shapes among what came out. It parses input from a
 * stranger's certificate, so every length is checked against what is left, a
 * truncated element ends the walk, and nesting is capped.
 */

const CONSTRUCTED = 0x20;
const MAX_DEPTH = 24;

export const DER_SEQUENCE = 0x30;
export const DER_OCTET_STRING = 0x04;
export const DER_IA5_STRING = 0x16;
export const DER_OID = 0x06;

export interface DerElement {
  tag: number;
  content: Uint8Array;
  children: DerElement[];
}

/** The elements encoded in `bytes`, or as many as hold up. */
export function parseDer(bytes: Uint8Array): DerElement[] {
  return parseRange(bytes, 0, bytes.length, 0);
}

/** Every element in the tree, parents before children. */
export function flattenDer(elements: DerElement[]): DerElement[] {
  return elements.flatMap((e) => [e, ...flattenDer(e.children)]);
}

function parseRange(bytes: Uint8Array, from: number, until: number, depth: number): DerElement[] {
  if (depth > MAX_DEPTH) return [];
  const elements: DerElement[] = [];
  let at = from;
  while (at < until) {
    const tag = bytes[at];
    // High-tag-number form: nothing read here uses it.
    if ((tag & 0x1f) === 0x1f) return elements;
    const lengthAt = at + 1;
    if (lengthAt >= until) return elements;
    const first = bytes[lengthAt];
    let length: number;
    let contentAt: number;
    if (first < 0x80) {
      length = first;
      contentAt = lengthAt + 1;
    } else {
      // Long form. Indefinite length (0x80) is not DER; more than four length
      // bytes is longer than any buffer here.
      const count = first & 0x7f;
      if (count === 0 || count > 4 || lengthAt + count >= until) return elements;
      length = 0;
      for (let i = 1; i <= count; i++) length = length * 256 + bytes[lengthAt + i];
      contentAt = lengthAt + 1 + count;
    }
    if (contentAt + length > until) return elements;
    const content = bytes.subarray(contentAt, contentAt + length);
    const children = tag & CONSTRUCTED ? parseRange(bytes, contentAt, contentAt + length, depth + 1) : [];
    elements.push({ tag, content, children });
    at = contentAt + length;
  }
  return elements;
}

/** An OBJECT IDENTIFIER's dotted form, or null when `element` is not a well-formed one. */
export function derOid(element: DerElement): string | null {
  if (element.tag !== DER_OID || element.content.length === 0) return null;
  const bytes = element.content;
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  let pending = false;
  for (let i = 1; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (value > Number.MAX_SAFE_INTEGER / 128) return null;
    pending = true;
    if ((bytes[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
      pending = false;
    }
  }
  // A trailing byte with the continuation bit set is an unfinished number.
  if (pending) return null;
  return parts.join('.');
}

/** DER content as Latin-1 text, for IA5String and friends. */
export function derText(element: DerElement): string {
  return Buffer.from(element.content).toString('latin1');
}
