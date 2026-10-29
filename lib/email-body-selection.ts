import { Email, EmailBodyPart } from '@/lib/jmap/types';
import { hasMeaningfulHtmlBody } from '@/lib/signature-utils';
import { escapeHtml, plainTextToSafeHtml } from '@/lib/email-sanitization';
import { normalizeCid } from '@/lib/attachment-visibility';

/**
 * Pick the HTML body an email should be rendered from, or null when it should be
 * rendered as plain text instead. Shared by the desktop viewer and the mobile
 * thread view so the two cannot drift apart again (#489: the thread view was
 * missing the part-type guard and rendered plain-text-only mail as HTML,
 * collapsing every line break).
 */
export function getRenderableHtmlBody(
  email: Pick<Email, 'htmlBody' | 'textBody' | 'bodyValues'>
): string | null {
  const htmlPart = email.htmlBody?.[0];
  if (!htmlPart?.partId || !email.bodyValues?.[htmlPart.partId]) return null;

  const htmlContent = email.bodyValues[htmlPart.partId].value;
  if (!htmlContent) return null;

  // Per RFC 8621, a single-part email exposes the same part in both htmlBody and
  // textBody. That shared part may actually be text/plain (plain-text-only mail);
  // rendering it as HTML collapses newlines and skips linkification, so route by
  // the part's media type rather than by which list it appears in.
  if (htmlPart.type && htmlPart.type.toLowerCase() !== 'text/html') return null;

  // Prefer textBody when the HTML is an auto-generated minimal wrapper (no rich
  // formatting). Server-generated HTML from text/plain emails often lacks <br>
  // tags, which would collapse newlines just the same.
  const textPartId = email.textBody?.[0]?.partId;
  const hasDistinctTextBody =
    !!textPartId && textPartId !== htmlPart.partId && !!email.bodyValues[textPartId];
  if (hasDistinctTextBody && !hasMeaningfulHtmlBody(htmlContent)) return null;

  return htmlContent;
}

/** Stands in for the Content-ID of a body image that has none. */
const BODY_IMAGE_CID_PREFIX = 'bulwark-body-part-';

function isBodyImage(part: EmailBodyPart): boolean {
  return !!part.blobId && (part.type || '').toLowerCase().startsWith('image/');
}

/**
 * The `cid:` under which the readers resolve an image of the body: its own
 * Content-ID, or one made from its part id.
 */
export function bodyImageCid(part: Pick<EmailBodyPart, 'partId' | 'cid'>): string {
  return part.cid ? normalizeCid(part.cid) : `${BODY_IMAGE_CID_PREFIX}${part.partId}`;
}

/**
 * Images that sit between the text parts of a `multipart/mixed` body, the
 * way Apple Mail and the iPhone send a photo placed in the text. RFC 8621
 * lists such a part in `htmlBody` and `textBody`, not in `attachments`, and
 * the text around it never references it.
 */
export function getBodyImageParts(email: Pick<Email, 'htmlBody'>): EmailBodyPart[] {
  return (email.htmlBody ?? []).filter(isBodyImage);
}

/**
 * The HTML the readers render. A body made of several parts with images
 * between them is rendered whole, in order: HTML parts as they are, plain
 * text parts as escaped text, images as `cid:` references (see
 * `bodyImageCid`). Any other message renders from its first HTML part, or
 * as plain text (null), as `getRenderableHtmlBody` decides.
 */
export function getReaderHtmlBody(
  email: Pick<Email, 'htmlBody' | 'textBody' | 'bodyValues'>
): string | null {
  const parts = email.htmlBody ?? [];
  if (parts.length < 2 || !parts.some(isBodyImage)) return getRenderableHtmlBody(email);

  const html = parts.map((part) => {
    const type = (part.type || '').toLowerCase();
    if (isBodyImage(part)) {
      return `<div><img src="cid:${escapeHtml(bodyImageCid(part))}" alt="${escapeHtml(part.name ?? '')}" style="max-width: 100%;"></div>`;
    }
    const value = part.partId ? email.bodyValues?.[part.partId]?.value : undefined;
    if (!value) return '';
    if (type === 'text/html') return value;
    if (type.startsWith('text/')) return `<div style="white-space: pre-wrap;">${plainTextToSafeHtml(value)}</div>`;
    return '';
  }).join('');
  return html || null;
}

/**
 * The plain-text body of a draft being re-opened, taken from the parts the
 * server lists as the body and from nothing else.
 *
 * `bodyValues` is keyed by part id, and `getEmail` asks for
 * `fetchAllBodyValues`, which per RFC 8621 § 4.1.4 covers every `text/*`
 * part of the message - attachments included. Joining all of them put the
 * contents of an attached .csv or .txt into the composer as the message
 * text: a draft carrying only attachments and no body re-opened showing an
 * attachment's contents as what you had written, and saving or sending it
 * then made that the actual message.
 */
export function getDraftTextBody(
  email: Pick<Email, 'textBody' | 'bodyValues'>
): string {
  return (email.textBody ?? [])
    .map(part => (part.partId ? email.bodyValues?.[part.partId]?.value : undefined))
    .filter((value): value is string => !!value)
    .join('\n');
}

/** A part the readers fetch to resolve the body's `cid:` references. */
export interface CidImageSource {
  cid: string;
  blobId: string;
  name?: string | null;
  type: string;
}

/**
 * Every part a body may reference by `cid:`: attachments with a Content-ID
 * and the images between the body's text parts (see `getReaderHtmlBody`).
 */
export function getCidImageSources(email: Pick<Email, 'attachments' | 'htmlBody'>): CidImageSource[] {
  const sources = new Map<string, CidImageSource>();
  for (const att of email.attachments ?? []) {
    if (!att.cid || !att.blobId) continue;
    const cid = normalizeCid(att.cid);
    if (!sources.has(cid)) sources.set(cid, { cid, blobId: att.blobId, name: att.name, type: att.type });
  }
  for (const part of getBodyImageParts(email)) {
    const cid = bodyImageCid(part);
    if (!sources.has(cid)) sources.set(cid, { cid, blobId: part.blobId, name: part.name, type: part.type });
  }
  return [...sources.values()];
}
