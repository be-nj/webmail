import type { CalendarLink, Email } from '@/lib/jmap/types';

/**
 * Turning a message into a calendar event: what the new event carries over
 * from the mail.
 *
 * The event keeps the subject as its title, a line naming who wrote and when,
 * and the message itself as attachments (JSCalendar `links`):
 *
 * - A link back to the message in this webmail, so the event is one click from
 *   the mail it came from.
 * - The raw message as a `data:` URI, when it is small enough. Stalwart drops
 *   a link that only carries a `blobId` (the event saves, the attachment is
 *   gone), and a JMAP download URL needs credentials no other calendar client
 *   has - so the bytes travel inside the event or not at all.
 */

/**
 * Largest message embedded as a `data:` URI. base64 adds a third, and every
 * copy of the event carries it through every calendar sync, so this is a
 * deliberate ceiling rather than a technical limit.
 */
export const MAX_EMBEDDED_EMAIL_BYTES = 256 * 1024;

export interface EventDraftFromEmail {
  title: string;
  description: string;
  links: Record<string, CalendarLink>;
}

const link = (over: Partial<CalendarLink> & { href: string }): CalendarLink => ({
  '@type': 'Link',
  cid: null,
  contentType: null,
  size: null,
  rel: 'enclosure',
  display: null,
  title: null,
  ...over,
});

export interface EventFromEmailInput {
  /** Absolute deep link to the message in this webmail. */
  messageUrl: string;
  /** "From Alice <a@b.example>, 17 Sept 2026" - the caller formats and translates it. */
  sourceLine: string;
  /** Label for the link back to the message, e.g. "Open message". */
  messageLinkTitle: string;
  /** Filename for the attached message, e.g. "2026-09-17 Subject.eml". */
  filename: string;
  /** The raw message, when it is to be embedded. */
  raw?: Uint8Array | null;
}

/**
 * The event a message becomes. Pure: the caller fetches the raw message and
 * formats the texts, this decides what the event carries.
 */
export function buildEventDraftFromEmail(
  email: Pick<Email, 'subject'>,
  input: EventFromEmailInput,
): EventDraftFromEmail {
  const links: Record<string, CalendarLink> = {
    message: link({
      href: input.messageUrl,
      rel: 'enclosure',
      contentType: 'message/rfc822',
      title: input.messageLinkTitle,
    }),
  };

  if (input.raw && input.raw.byteLength > 0 && input.raw.byteLength <= MAX_EMBEDDED_EMAIL_BYTES) {
    links.eml = link({
      href: `data:message/rfc822;base64,${base64(input.raw)}`,
      rel: 'enclosure',
      contentType: 'message/rfc822',
      size: input.raw.byteLength,
      title: input.filename,
    });
  }

  return {
    title: email.subject?.trim() || '',
    description: input.sourceLine,
    links,
  };
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) blows the argument limit well below
  // the size cap above.
  const chunk = 8 * 1024;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}
