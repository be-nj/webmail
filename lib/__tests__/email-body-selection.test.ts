import { describe, it, expect } from 'vitest';
import { getRenderableHtmlBody, getDraftTextBody, getReaderHtmlBody, getCidImageSources } from '@/lib/email-body-selection';

type PartialEmail = Parameters<typeof getRenderableHtmlBody>[0];

function makeEmail(parts: {
  html?: { partId: string; type: string };
  text?: { partId: string; type: string };
  values: Record<string, string>;
}): PartialEmail {
  const part = (p: { partId: string; type: string }) => ({
    partId: p.partId,
    blobId: `blob-${p.partId}`,
    size: 1,
    type: p.type,
  });
  return {
    htmlBody: parts.html ? [part(parts.html)] : [],
    textBody: parts.text ? [part(parts.text)] : [],
    bodyValues: Object.fromEntries(
      Object.entries(parts.values).map(([k, v]) => [k, { value: v, isEncodingProblem: false, isTruncated: false }])
    ),
  } as PartialEmail;
}

describe('getRenderableHtmlBody', () => {
  it('renders as plain text when the shared part is text/plain (#489)', () => {
    // Plain-text-only mail: RFC 8621 puts the same part in htmlBody and textBody.
    const email = makeEmail({
      html: { partId: '1', type: 'text/plain' },
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'line one\nline two\nline three' },
    });

    expect(getRenderableHtmlBody(email)).toBeNull();
  });

  it('matches the media type case-insensitively', () => {
    const email = makeEmail({
      html: { partId: '1', type: 'TEXT/HTML' },
      text: { partId: '1', type: 'TEXT/HTML' },
      values: { '1': '<p>hello</p>' },
    });

    expect(getRenderableHtmlBody(email)).toBe('<p>hello</p>');
  });

  it('renders HTML-only mail as HTML even though the part is shared', () => {
    const email = makeEmail({
      html: { partId: '1', type: 'text/html' },
      text: { partId: '1', type: 'text/html' },
      values: { '1': '<div><b>rich</b> content</div>' },
    });

    expect(getRenderableHtmlBody(email)).toBe('<div><b>rich</b> content</div>');
  });

  it('prefers the distinct text part when the HTML alternative is a bare wrapper', () => {
    const email = makeEmail({
      html: { partId: '2', type: 'text/html' },
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'line one\nline two', '2': '<html><body>line one line two</body></html>' },
    });

    expect(getRenderableHtmlBody(email)).toBeNull();
  });

  it('keeps a distinct HTML alternative that carries real formatting', () => {
    const html = '<html><body><p>line one</p><p><b>line two</b></p></body></html>';
    const email = makeEmail({
      html: { partId: '2', type: 'text/html' },
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'line one\nline two', '2': html },
    });

    expect(getRenderableHtmlBody(email)).toBe(html);
  });

  it('returns null when there is no HTML body at all', () => {
    const email = makeEmail({
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'just text' },
    });

    expect(getRenderableHtmlBody(email)).toBeNull();
  });

  it('returns null when the HTML part has no fetched body value', () => {
    const email = makeEmail({
      html: { partId: '2', type: 'text/html' },
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'just text' },
    });

    expect(getRenderableHtmlBody(email)).toBeNull();
  });

  it('returns null for an empty HTML body value', () => {
    const email = makeEmail({
      html: { partId: '2', type: 'text/html' },
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'just text', '2': '' },
    });

    expect(getRenderableHtmlBody(email)).toBeNull();
  });
});

/**
 * Re-opening a draft used to join every value in bodyValues into the
 * message. getEmail asks for fetchAllBodyValues, which per RFC 8621
 * covers every text/* part including attachments, so a draft carrying
 * only a .csv re-opened with the contents of that .csv as its text - and
 * the next save made that the real message.
 */
describe('getDraftTextBody', () => {
  type DraftEmail = Parameters<typeof getDraftTextBody>[0];

  const draft = (textBody: { partId: string }[], values: Record<string, string>): DraftEmail => ({
    textBody: textBody as DraftEmail['textBody'],
    bodyValues: Object.fromEntries(
      Object.entries(values).map(([id, value]) => [id, { value, isEncodingProblem: false, isTruncated: false }]),
    ) as DraftEmail['bodyValues'],
  });

  it('takes the body from the parts listed as the body', () => {
    expect(getDraftTextBody(draft([{ partId: '1' }], { '1': 'hello' }))).toBe('hello');
  });

  it('ignores a text attachment that is not part of the body', () => {
    // Part 2 is an attached text/csv: fetchAllBodyValues returns its value
    // too, but it is not in textBody and is not the message.
    const d = draft([{ partId: '1' }], { '1': 'see attached', '2': 'Date,Amount\n2026-08-30,12.00' });
    expect(getDraftTextBody(d)).toBe('see attached');
  });

  it('is empty for a draft that has attachments and no body at all', () => {
    expect(getDraftTextBody(draft([], { '2': 'Date,Amount\n2026-08-30,12.00' }))).toBe('');
  });

  it('joins several body parts', () => {
    expect(getDraftTextBody(draft([{ partId: '1' }, { partId: '2' }], { '1': 'one', '2': 'two' })))
      .toBe('one\ntwo');
  });

  it('survives a part whose value the server did not return', () => {
    expect(getDraftTextBody(draft([{ partId: '1' }, { partId: '9' }], { '1': 'one' }))).toBe('one');
  });
});

// Apple Mail and the iPhone put a photo between two text parts of a
// multipart/mixed body. RFC 8621 lists it in htmlBody and textBody only, not
// in attachments, and no text part references it.
describe('getReaderHtmlBody', () => {
  const value = (v: string) => ({ value: v, isEncodingProblem: false, isTruncated: false });
  const photo = { partId: '3', blobId: 'blob-photo', size: 9, type: 'image/jpeg', name: 'IMG_0001.jpeg' };

  it('renders the HTML parts around a photo in order, the photo as a cid: reference', () => {
    const email = {
      htmlBody: [
        { partId: '2', blobId: 'b2', size: 1, type: 'text/html' },
        { ...photo, cid: '<photo@apple>' },
        { partId: '5', blobId: 'b5', size: 1, type: 'text/html' },
      ],
      textBody: [],
      bodyValues: { '2': value('<p>Look:</p>'), '5': value('<p>Nice, right?</p>') },
    } as PartialEmail;
    const html = getReaderHtmlBody(email)!;
    expect(html.indexOf('Look:')).toBeLessThan(html.indexOf('cid:photo@apple'));
    expect(html.indexOf('cid:photo@apple')).toBeLessThan(html.indexOf('Nice, right?'));
  });

  it('turns a plain-text body with a photo into HTML and keeps its text escaped', () => {
    const email = {
      htmlBody: [
        { partId: '1', blobId: 'b1', size: 1, type: 'text/plain' },
        photo,
      ],
      textBody: [],
      bodyValues: { '1': value('Hi <you>\nphoto below') },
    } as PartialEmail;
    const html = getReaderHtmlBody(email)!;
    expect(html).toContain('Hi &lt;you&gt;');
    expect(html).toContain('white-space: pre-wrap');
    expect(html).toContain('src="cid:bulwark-body-part-3"');
  });

  it('leaves every other message to getRenderableHtmlBody', () => {
    const email = makeEmail({
      html: { partId: '1', type: 'text/plain' },
      text: { partId: '1', type: 'text/plain' },
      values: { '1': 'just text' },
    });
    expect(getReaderHtmlBody(email)).toBeNull();
  });
});

describe('getCidImageSources', () => {
  it('lists cid attachments and body photos once each, under the cid the body uses', () => {
    const sources = getCidImageSources({
      attachments: [
        { partId: '4', blobId: 'logo', size: 1, type: 'image/png', cid: '<logo@x>' },
        { partId: '6', blobId: 'pdf', size: 1, type: 'application/pdf' },
      ],
      htmlBody: [
        { partId: '1', blobId: 'b1', size: 1, type: 'text/html' },
        { partId: '3', blobId: 'photo', size: 1, type: 'image/jpeg' },
      ],
    } as Parameters<typeof getCidImageSources>[0]);
    expect(sources.map((s) => [s.cid, s.blobId])).toEqual([['logo@x', 'logo'], ['bulwark-body-part-3', 'photo']]);
  });
});
