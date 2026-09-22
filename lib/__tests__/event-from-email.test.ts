import { describe, it, expect } from 'vitest';
import { MAX_EMBEDDED_EMAIL_BYTES, buildEventDraftFromEmail } from '../event-from-email';

const input = {
  messageUrl: 'https://mail.example/mail/message/m1',
  sourceLine: 'From Alice <alice@example.org>, 17 Sept 2026',
  messageLinkTitle: 'Open message',
  filename: '2026-09-17 Lunch.eml',
};
const raw = (bytes: number) => new TextEncoder().encode('x'.repeat(bytes));

describe('buildEventDraftFromEmail', () => {
  it('takes the subject as the title and names the source', () => {
    const draft = buildEventDraftFromEmail({ subject: '  Lunch  ' }, input);
    expect(draft.title).toBe('Lunch');
    expect(draft.description).toBe(input.sourceLine);
  });

  it('leaves the title empty for a message without subject', () => {
    expect(buildEventDraftFromEmail({ subject: '' }, input).title).toBe('');
    expect(buildEventDraftFromEmail({}, input).title).toBe('');
  });

  it('always links back to the message', () => {
    const { links } = buildEventDraftFromEmail({ subject: 'Lunch' }, input);
    expect(links.message).toMatchObject({
      '@type': 'Link',
      href: input.messageUrl,
      rel: 'enclosure',
      contentType: 'message/rfc822',
      title: 'Open message',
    });
    expect(links.eml).toBeUndefined();
  });

  it('embeds a small message as a data: URI under its filename', () => {
    const bytes = new TextEncoder().encode('From: a@b.example\r\n\r\nhi\r\n');
    const { links } = buildEventDraftFromEmail({ subject: 'Lunch' }, { ...input, raw: bytes });
    expect(links.eml.title).toBe('2026-09-17 Lunch.eml');
    expect(links.eml.size).toBe(bytes.byteLength);
    expect(links.eml.href.startsWith('data:message/rfc822;base64,')).toBe(true);
    const decoded = Buffer.from(links.eml.href.split(',')[1], 'base64').toString('utf8');
    expect(decoded).toBe('From: a@b.example\r\n\r\nhi\r\n');
  });

  it('encodes bytes above the 8 KB chunk boundary correctly', () => {
    const bytes = raw(20 * 1024);
    const { links } = buildEventDraftFromEmail({ subject: 'Big' }, { ...input, raw: bytes });
    expect(Buffer.from(links.eml.href.split(',')[1], 'base64').byteLength).toBe(bytes.byteLength);
  });

  it('leaves a large message out, keeping only the link', () => {
    const { links } = buildEventDraftFromEmail({ subject: 'Big' }, { ...input, raw: raw(MAX_EMBEDDED_EMAIL_BYTES + 1) });
    expect(links.eml).toBeUndefined();
    expect(links.message).toBeDefined();
  });

  it('embeds a message of exactly the cap', () => {
    const { links } = buildEventDraftFromEmail({ subject: 'Edge' }, { ...input, raw: raw(MAX_EMBEDDED_EMAIL_BYTES) });
    expect(links.eml).toBeDefined();
  });

  it('ignores empty raw bytes', () => {
    const { links } = buildEventDraftFromEmail({ subject: 'Lunch' }, { ...input, raw: new Uint8Array() });
    expect(links.eml).toBeUndefined();
  });
});
