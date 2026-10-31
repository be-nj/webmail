import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Email, Mailbox } from '@/lib/jmap/types';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';

// Every unfolded message of a Mountain View conversation has a ⋮ menu with
// the open message's actions for that one message, not only Reply.

vi.mock('@/hooks/use-media-query', () => ({
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  useMediaQuery: () => false,
}));

vi.mock('@/components/tour/tour-provider', () => ({
  useTour: () => ({ activeTour: null, startTour: vi.fn(), endTour: vi.fn(), registerStep: vi.fn() }),
}));

vi.mock('@/components/plugins/plugin-slot', () => ({
  PluginSlot: () => null,
}));

vi.mock('@/hooks/use-plugin-slot-offers', () => ({
  usePluginSlotOffers: () => [],
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

const { EmailViewer } = await import('../email-viewer');

const mailboxes: Mailbox[] = [
  { id: 'inbox', name: 'Inbox', role: 'inbox', parentId: null, myRights: { mayAddItems: true } },
] as unknown as Mailbox[];

function mail(n: number, overrides: Partial<Email> = {}): Email {
  return {
    id: `m${n}`,
    blobId: `b${n}`,
    threadId: 't1',
    mailboxIds: { inbox: true },
    keywords: { $seen: true },
    from: [{ name: `Sender ${n}`, email: `s${n}@example.com` }],
    to: [{ name: 'Me', email: 'me@example.com' }],
    subject: 'Subject',
    receivedAt: `2026-01-0${n}T10:00:00Z`,
    preview: `Preview ${n}`,
    hasAttachment: false,
    size: 100,
    ...overrides,
  } as unknown as Email;
}

function withBody(e: Email, text: string): Email {
  return {
    ...e,
    textBody: [{ partId: '1', type: 'text/plain' }],
    htmlBody: [],
    attachments: [],
    bodyValues: { '1': { value: text, isTruncated: false } },
  } as unknown as Email;
}

const card = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-mv-conversation-expanded][data-email-id="${id}"]`)!;
const expandedIds = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-mv-conversation-expanded]')].map((e) => e.getAttribute('data-email-id'));

function openMenu(c: HTMLElement, id: string) {
  fireEvent.click(within(card(c, id)).getByRole('button', { name: 'more_actions' }));
  return within(card(c, id)).getByRole('menu');
}

function renderViewer(conversation: Email[], open: Email, props: Partial<Parameters<typeof EmailViewer>[0]> = {}) {
  return render(
    <EmailViewer
      email={open}
      mailboxes={mailboxes}
      selectedMailbox="inbox"
      currentMailboxRole="inbox"
      mvConversation={conversation}
      {...props}
    />,
  );
}

describe('Mountain View conversation message menu', () => {
  beforeEach(() => {
    useSettingsStore.setState({ interfaceLayout: 'mountain-view', markAsReadDelay: -1 });
  });

  it('hands Forward and Forward as attachment of that message to the mail view', () => {
    const open = withBody(mail(3), 'Open body');
    const conversation = [withBody(mail(1, { keywords: {} }), 'First body'), mail(2), open];
    const onAction = vi.fn();
    const { container } = renderViewer(conversation, open, { onConversationEmailAction: onAction });

    for (const [label, action] of [['forward', 'forward'], ['forward_as_attachment', 'forwardAsAttachment']]) {
      fireEvent.click(within(openMenu(container, 'm1')).getByRole('menuitem', { name: label }));
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'm1' }), action);
    }
    expect(expandedIds(container)).toEqual(['m1']);
  });

  it('folds a message it marks unread, so showing it does not read it again', () => {
    const open = withBody(mail(3), 'Open body');
    const conversation = [withBody(mail(1, { keywords: {} }), 'First body'), mail(2), open];
    const onAction = vi.fn();
    const { container } = renderViewer(conversation, open, { onConversationEmailAction: onAction });

    fireEvent.click(within(openMenu(container, 'm1')).getByRole('menuitem', { name: 'mark_unread' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'markUnread');
    expect(expandedIds(container)).toEqual([]);
  });

  it("shows that message's source, not the open message's", async () => {
    const fetchBlob = vi.fn(async (blobId: string) => new Blob([`Subject: source of ${blobId}`]));
    const open = withBody(mail(3), 'Open body');
    const conversation = [withBody(mail(1, { keywords: {} }), 'First body'), mail(2), open];
    const { container } = renderViewer(conversation, open, { onConversationEmailAction: vi.fn() });
    // Only now: the viewer itself would ask this stand-in for more.
    // Every other method answers nothing.
    const client = new Proxy({ fetchBlob } as Record<string, unknown>, {
      get: (target, key) => (key in target ? target[key as string] : () => undefined),
    });
    useAuthStore.setState({ client: client as never });

    try {
      fireEvent.click(within(openMenu(container, 'm1')).getByRole('menuitem', { name: 'view_source' }));
      await waitFor(() => expect(screen.getByText(/Subject: source of b1/)).toBeTruthy());
      expect(fetchBlob).toHaveBeenCalledTimes(1);
      expect(fetchBlob.mock.calls[0][0]).toBe('b1');
    } finally {
      useAuthStore.setState({ client: null });
    }
  });

  it('keeps Print off until the body is there; View source needs only the message', () => {
    const open = withBody(mail(3), 'Open body');
    const conversation = [mail(1, { keywords: {} }), mail(2), open];
    const { container } = renderViewer(conversation, open, { onConversationEmailAction: vi.fn() });

    const menu = openMenu(container, 'm1');
    expect(within(menu).getByRole('menuitem', { name: 'print' })).toBeDisabled();
    expect(within(menu).getByRole('menuitem', { name: 'view_source' })).toBeEnabled();
    expect(within(menu).getByRole('menuitem', { name: 'forward' })).toBeEnabled();
  });

  it('has no menu where the mail view takes no actions', () => {
    const open = withBody(mail(3), 'Open body');
    const conversation = [withBody(mail(1, { keywords: {} }), 'First body'), mail(2), open];
    const { container } = renderViewer(conversation, open);
    expect(within(card(container, 'm1')).queryByRole('button', { name: 'more_actions' })).toBeNull();
  });
});
