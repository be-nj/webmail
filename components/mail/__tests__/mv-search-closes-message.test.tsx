import React, { Suspense, lazy } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email, Mailbox } from '@/lib/jmap/types';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailStore } from '@/stores/email-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useThemeStore } from '@/stores/theme-store';
import { DEFAULT_SEARCH_FILTERS } from '@/lib/jmap/search-utils';

// Mountain View reads a message in place of the list. A search started from
// the top bar while a message was open filled a list nobody could see, so the
// search field seemed to do nothing.
vi.mock('next/dynamic', () => ({ default: (load: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
  const Component = lazy(async () => ({ default: await load() }));
  return function Dynamic(props: Record<string, unknown>) {
    return <Suspense fallback={null}><Component {...props} /></Suspense>;
  };
} }));
vi.mock('@/components/email/email-viewer', () => ({ EmailViewer: () => <div>stub viewer</div> }));
vi.mock('@/components/layout/mv-top-bar', () => ({
  MvTopBar: ({ search }: { search?: { onSubmit: (q: string) => void; onClear: () => void; onSelectContact: (c: unknown, f: string) => void } }) => (
    <>
      <button onClick={() => search?.onSubmit('invoice')}>stub search</button>
      <button onClick={() => search?.onClear()}>stub clear</button>
      <button onClick={() => search?.onSelectContact({ email: 'bob@example.com' }, 'from')}>stub contact</button>
    </>
  ),
}));
vi.mock('@/components/layout/mv-side-panel', () => ({ MvSidePanel: () => null }));
vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/layout/navigation-rail', () => ({ NavigationRail: () => null }));
vi.mock('@/components/layout/calendar-event-notification-toaster', () => ({ CalendarEventNotificationToaster: () => null }));
vi.mock('@/components/layout/share-notification-toaster', () => ({ ShareNotificationToaster: () => null }));
vi.mock('@/components/layout/mobile-header', () => ({ MobileHeader: () => null }));
vi.mock('@/components/email/message-list-tabs', () => ({ MessageListTabs: () => null }));
vi.mock('@/components/search/search-box', () => ({ SearchBox: () => null }));
vi.mock('@/components/tour/tour-provider', () => ({ useTour: () => ({ activeTour: null, registerStep: vi.fn() }) }));
vi.mock('@/components/plugins/plugin-slot', () => ({ PluginSlot: () => null }));
vi.mock('@/hooks/use-plugin-slot-offers', () => ({ usePluginSlotOffers: () => [] }));
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ appName: 'Mail' }) }));
vi.mock('@/hooks/use-identity-sync', () => ({ useIdentitySync: () => {} }));
vi.mock('@/hooks/use-pro-multi-account-identities', () => ({ useProMultiAccountIdentities: () => [] }));
vi.mock('@/hooks/use-pro-multi-account-mailboxes', () => ({ useProMultiAccountMailboxes: () => {} }));
vi.mock('@/hooks/use-wopi-status', () => ({ useWopiStatus: () => null, canWopiOpen: () => false }));
vi.mock('@/hooks/use-browser-navigation', () => ({ useBrowserNavigation: () => {} }));
vi.mock('@/hooks/use-media-query', () => ({
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  useMediaQuery: () => true,
  useIsDesktop: () => true,
}));
vi.mock('@/lib/push-bindings', () => ({ reconcilePushBindings: () => {}, releasePushBindings: () => {} }));
vi.mock('@/components/email/email-list', () => ({ EmailList: () => <div>message list</div> }));

const { MailApp } = await import('../mail-app');

const inbox = { id: 'inbox', name: 'Inbox', role: 'inbox' } as Mailbox;
const openEmail = {
  id: 'm1', threadId: 't1', mailboxIds: { inbox: true }, keywords: { $seen: true },
  subject: 'Hello', from: [{ email: 'alice@example.com' }], receivedAt: '2026-10-01T10:00:00Z',
  bodyValues: {}, textBody: [], htmlBody: [],
} as unknown as Email;
const searchEmails = vi.fn();
const advancedSearch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  usePluginStore.setState({ initializePlugins: vi.fn().mockResolvedValue(undefined) });
  useThemeStore.setState({ syncServerThemes: vi.fn().mockResolvedValue(undefined) });
  const client = {
    getAccountId: () => 'acc', getUsername: () => 'me@example.com',
    getSieveAccountId: () => null, hasDelayedSend: () => false, getSession: () => null,
    getThread: vi.fn().mockResolvedValue({ emailIds: ['m1'] }),
  };
  useAuthStore.setState({
    isAuthenticated: true, isLoading: false, client: client as never, activeAccountId: 'login', identities: [],
    getClientForAccount: () => client as never,
    getAllConnectedClients: () => new Map([['login', client]]) as never,
  });
  useSettingsStore.setState({ enableUnifiedMailbox: false, interfaceLayout: 'mountain-view', mailLayout: 'split' } as never);
  searchEmails.mockReset().mockResolvedValue(undefined);
  advancedSearch.mockReset().mockResolvedValue(undefined);
  useEmailStore.setState({
    emails: [openEmail], selectedEmail: openEmail, selectedMailbox: inbox.id, mailboxes: [inbox],
    viewingAccountId: null, accountMailboxes: {}, isUnifiedView: false, unifiedRole: null,
    isScheduledView: false, isLoadingEmail: false, isLoading: false, searchQuery: '',
    searchFilters: { ...DEFAULT_SEARCH_FILTERS }, searchMailboxId: '', selectedKeyword: null,
    selectedEmailKeys: new Set(),
    fetchMailboxes: vi.fn().mockResolvedValue(undefined), fetchEmails: vi.fn().mockResolvedValue(undefined),
    fetchQuota: vi.fn().mockResolvedValue(undefined), fetchTagCounts: vi.fn().mockResolvedValue(undefined),
    refreshScheduledMetadata: vi.fn().mockResolvedValue(undefined),
    searchEmails, advancedSearch,
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('searching in Mountain View with a message open', () => {
  it('closes the message so the results show', async () => {
    render(<MailApp />);
    await screen.findByText('stub viewer', {}, { timeout: 5000 });

    fireEvent.click(screen.getByText('stub search'));

    await waitFor(() => expect(searchEmails).toHaveBeenCalledWith(expect.anything(), 'invoice'));
    expect(useEmailStore.getState().selectedEmail).toBeNull();
  });

  it('closes the message for a contact picked from the suggestions', async () => {
    render(<MailApp />);
    await screen.findByText('stub viewer', {}, { timeout: 5000 });

    fireEvent.click(screen.getByText('stub contact'));

    await waitFor(() => expect(advancedSearch).toHaveBeenCalled());
    expect(useEmailStore.getState().selectedEmail).toBeNull();
  });

  it('closes the message when the search is cleared', async () => {
    const fetchEmails = useEmailStore.getState().fetchEmails;
    useEmailStore.setState({ searchQuery: 'invoice' });
    render(<MailApp />);
    await screen.findByText('stub viewer', {}, { timeout: 5000 });

    fireEvent.click(screen.getByText('stub clear'));

    await waitFor(() => expect(fetchEmails).toHaveBeenCalledWith(expect.anything(), 'inbox'));
    expect(useEmailStore.getState().selectedEmail).toBeNull();
  });
});
