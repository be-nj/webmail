import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventAttachments, attachmentKind, dataUriToBlob } from '../event-attachments';
import type { CalendarLink } from '@/lib/jmap/types';

const link = (over: Partial<CalendarLink> & { href: string }): CalendarLink => ({
  '@type': 'Link', cid: null, contentType: null, size: null, rel: 'enclosure', display: null, title: null, ...over,
});

describe('attachmentKind', () => {
  const origin = 'https://webmail.example';
  it('downloads base64 data: URIs', () => {
    expect(attachmentKind('data:message/rfc822;base64,Rk9P', origin)).toBe('download');
  });
  it('opens links on this origin in place, others in a new tab', () => {
    expect(attachmentKind('https://webmail.example/mail/message/m1', origin)).toBe('internal');
    expect(attachmentKind('https://evil.example/x', origin)).toBe('external');
  });
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>x</script>', 'not a url'])(
    'never makes %s clickable', (href) => {
      expect(attachmentKind(href, origin)).toBe('none');
    },
  );
});

describe('dataUriToBlob', () => {
  it('decodes the bytes and keeps the media type', async () => {
    const blob = dataUriToBlob('data:message/rfc822;base64,Rk9P', null)!;
    expect(blob.type).toBe('message/rfc822');
    expect(await blob.text()).toBe('FOO');
  });
  it('rejects garbage', () => {
    expect(dataUriToBlob('data:message/rfc822;base64,%%%', null)).toBeNull();
  });
});

describe('EventAttachments', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing without links', () => {
    const { container } = render(<EventAttachments links={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the message link and the embedded message', () => {
    render(<EventAttachments links={{
      message: link({ href: `${window.location.origin}/mail/message/m1`, contentType: 'message/rfc822', title: 'Open message' }),
      eml: link({ href: 'data:message/rfc822;base64,Rk9P', contentType: 'message/rfc822', title: 'mail.eml' }),
    }} />);
    const open = screen.getByText('Open message').closest('a')!;
    expect(open.getAttribute('href')).toBe(`${window.location.origin}/mail/message/m1`);
    expect(open.getAttribute('target')).toBeNull();
    expect(screen.getByText('mail.eml').closest('button')).not.toBeNull();
  });

  it('saves the embedded message as a file instead of navigating to it', () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<EventAttachments links={{ eml: link({ href: 'data:message/rfc822;base64,Rk9P', title: 'mail.eml' }) }} />);
    fireEvent.click(screen.getByText('mail.eml'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('mail.eml');
  });

  it('opens external links in a new tab without referrer', () => {
    render(<EventAttachments links={{ a: link({ href: 'https://example.org/doc', title: 'Doc' }) }} />);
    const a = screen.getByText('Doc').closest('a')!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noreferrer');
  });
});
