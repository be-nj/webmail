import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mailbox } from '@/lib/jmap/types';

// Under Mountain View the sidebar is laid out the way Gmail's is: inbox, sent
// and drafts, a "More" that reveals the other system folders, then a
// "Labels" list of the folders you made and your tags. Outside Mountain View
// the "Folders" / "Tags" sections stay as they are, headings and all.

vi.mock('@/components/plugins/plugin-slot', () => ({ PluginSlot: () => null }));
vi.mock('@/components/tour/tour-provider', () => ({
  useTour: () => ({ startTour: vi.fn(), resetTourCompletion: vi.fn(), activeTour: null, endTour: vi.fn(), registerStep: vi.fn() }),
}));
vi.mock('@/contexts/drag-drop-context', () => ({
  useDragDropContext: () => ({ isDragging: false }),
}));
vi.mock('@/hooks/use-mailbox-drop', () => ({
  useMailboxDrop: () => ({ dropHandlers: {}, isValidDropTarget: false, isInvalidDropTarget: false }),
}));
vi.mock('@/hooks/use-tag-drop', () => ({
  useTagDrop: () => ({ dropHandlers: {}, isValidDropTarget: false }),
}));
vi.mock('../account-switcher', () => ({ AccountSwitcher: () => null }));

const { Sidebar } = await import('../sidebar');
const { useSettingsStore } = await import('@/stores/settings-store');
const { useUIStore } = await import('@/stores/ui-store');
const { useEmailStore } = await import('@/stores/email-store');
const { DEFAULT_SEARCH_FILTERS } = await import('@/lib/jmap/search-utils');

const mailboxes: Mailbox[] = [
  { id: 'inbox', name: 'Inbox', role: 'inbox', parentId: null, totalEmails: 0, unreadEmails: 0, sortOrder: 0, myRights: { mayAddItems: true } },
  { id: 'sent', name: 'Sent', role: 'sent', parentId: null, totalEmails: 0, unreadEmails: 0, sortOrder: 1, myRights: { mayAddItems: true } },
  { id: 'drafts', name: 'Drafts', role: 'drafts', parentId: null, totalEmails: 0, unreadEmails: 0, sortOrder: 2, myRights: { mayAddItems: true } },
  { id: 'trash', name: 'Trash', role: 'trash', parentId: null, totalEmails: 0, unreadEmails: 0, sortOrder: 3, myRights: { mayAddItems: true } },
  { id: 'receipts', name: 'Receipts', parentId: null, totalEmails: 0, unreadEmails: 0, sortOrder: 4, myRights: { mayAddItems: true } },
] as unknown as Mailbox[];

/** Rows carry their untranslated folder name; the visible label is localised. */
const folderRow = (name: string) => document.querySelector(`[data-folder-name="${name}"]`);

describe('Sidebar under Mountain View', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false } as never);
    useSettingsStore.setState({
      emailKeywords: [{ id: 'work', label: 'Work', color: 'blue' }],
      enableUnifiedMailbox: false,
      hideAccountSwitcher: true,
    } as never);
  });

  it('drops the Folders heading and holds the system folders behind More', () => {
    render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" mvShell />);

    expect(screen.queryByText('folders')).toBeNull();
    expect(screen.getByText('show_more')).toBeInTheDocument();
    expect(folderRow('Trash')).toBeNull();
  });

  it('lists your folders and tags under Labels, outside More', () => {
    const onCreateFolder = vi.fn();
    const { container } = render(
      <Sidebar mailboxes={mailboxes} selectedMailbox="inbox" mvShell onCreateFolder={onCreateFolder} />,
    );

    expect(screen.getByText('labels')).toBeInTheDocument();
    expect(screen.queryByText('tags')).toBeNull();
    expect(container.querySelector('[data-mv-labels] [data-folder-name="Receipts"]')).not.toBeNull();
    expect(screen.getByText('Work')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('create_label'));
    expect(onCreateFolder).toHaveBeenCalledTimes(1);
  });

  it('keeps the places mail actually goes in view', () => {
    render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" mvShell />);

    expect(folderRow('Inbox')).not.toBeNull();
    expect(folderRow('Sent')).not.toBeNull();
    expect(folderRow('Drafts')).not.toBeNull();
  });

  it('lists Starred right under the Inbox, and opens it', () => {
    const onOpenStarred = vi.fn();
    const { container } = render(
      <Sidebar mailboxes={mailboxes} selectedMailbox="inbox" mvShell onOpenStarred={onOpenStarred} />,
    );

    const rows = [...container.querySelectorAll('[data-folder-name]')].map((r) => r.getAttribute('data-folder-name'));
    expect(rows.indexOf('mv-starred')).toBe(rows.indexOf('Inbox') + 1);
    fireEvent.click(container.querySelector('[data-folder-name="mv-starred"] button:last-of-type')!);
    expect(onOpenStarred).toHaveBeenCalledTimes(1);
  });

  it('marks only the Starred row while its search runs, whichever folder was open', () => {
    useEmailStore.setState({ searchQuery: '', searchFilters: { ...DEFAULT_SEARCH_FILTERS, isStarred: true } } as never);
    try {
      const { container } = render(
        <Sidebar mailboxes={mailboxes} selectedMailbox="receipts" mvShell onOpenStarred={vi.fn()} />,
      );
      const selected = [...container.querySelectorAll('[data-folder-name]')]
        .filter((row) => row.querySelector('[data-selected="true"]') || row.getAttribute('data-selected') === 'true')
        .map((row) => row.getAttribute('data-folder-name'));
      expect(selected).toEqual(['mv-starred']);
    } finally {
      useEmailStore.setState({ searchFilters: { ...DEFAULT_SEARCH_FILTERS } } as never);
    }
  });

  it('has no Starred row outside Mountain View', () => {
    const { container } = render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" onOpenStarred={vi.fn()} />);
    expect(container.querySelector('[data-folder-name="mv-starred"]')).toBeNull();
  });

  it('reveals the system folders under More, and takes them back', () => {
    render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" mvShell />);

    fireEvent.click(screen.getByText('show_more'));
    expect(folderRow('Trash')).not.toBeNull();

    fireEvent.click(screen.getByText('show_fewer'));
    expect(folderRow('Trash')).toBeNull();
  });

  it('keeps a shared mailbox in view under its own heading, and opens its folders', () => {
    localStorage.removeItem('sidebarExpandedSharedAccounts');
    const shared = [
      { id: 'g-inbox', name: 'Inbox', role: 'inbox', parentId: null, totalEmails: 4, unreadEmails: 2, sortOrder: 0, myRights: { mayAddItems: true }, isShared: true, accountId: 'd', accountName: 'mb@beck.ma' },
      { id: 'g-sent', name: 'Sent', role: 'sent', parentId: null, totalEmails: 0, unreadEmails: 0, sortOrder: 1, myRights: { mayAddItems: true }, isShared: true, accountId: 'd', accountName: 'mb@beck.ma' },
    ] as unknown as Mailbox[];
    const onMailboxSelect = vi.fn();
    const { container } = render(
      <Sidebar mailboxes={[...mailboxes, ...shared]} selectedMailbox="inbox" mvShell onMailboxSelect={onMailboxSelect} />,
    );

    // Visible without opening More, ahead of the labels.
    const section = container.querySelector('[data-mv-shared]')!;
    expect(section).not.toBeNull();
    expect(section.compareDocumentPosition(container.querySelector('[data-mv-labels]')!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const accountRow = section.querySelector('[data-folder-name="mb@beck.ma"]')!;
    expect(accountRow).toHaveTextContent('2');
    expect(section.querySelector('[data-mailbox-id="g-inbox"]')).toBeNull();

    fireEvent.click(accountRow.querySelector('button:last-of-type')!);
    const groupInbox = section.querySelector('[data-mailbox-id="g-inbox"]')!;
    expect(groupInbox).not.toBeNull();
    fireEvent.click(groupInbox.querySelector('button:last-of-type')!);
    expect(onMailboxSelect).toHaveBeenCalledWith('g-inbox');

    // The old "Shared" section under More is gone.
    fireEvent.click(screen.getByText('show_more'));
    expect(screen.queryByTestId('section-shared')).toBeNull();
    localStorage.removeItem('sidebarExpandedSharedAccounts');
  });

  it('leaves the default layout its sections and every folder', () => {
    render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" />);

    expect(screen.getByText('folders')).toBeInTheDocument();
    expect(screen.queryByText('show_more')).toBeNull();
    expect(folderRow('Receipts')).not.toBeNull();
    expect(screen.getByText('tags')).toBeInTheDocument();
  });
});

describe('Sidebar collapsed rail under Mountain View', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: true } as never);
    useSettingsStore.setState({ emailKeywords: [], hideAccountSwitcher: true } as never);
  });

  it('peeks the full list out on hover and puts it away again', () => {
    const { container } = render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" mvShell />);
    const rail = container.firstElementChild as HTMLElement;

    expect(rail).not.toHaveAttribute('data-mv-rail-peek');

    fireEvent.mouseEnter(rail);
    expect(rail).toHaveAttribute('data-mv-rail-peek');
    // Peeking means the list is legible, i.e. no longer icon-only.
    expect(screen.getByText('show_more')).toBeInTheDocument();

    fireEvent.mouseLeave(rail);
    expect(rail).not.toHaveAttribute('data-mv-rail-peek');
  });

  it('does not peek outside Mountain View', () => {
    const { container } = render(<Sidebar mailboxes={mailboxes} selectedMailbox="inbox" />);
    const rail = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(rail);
    expect(rail).not.toHaveAttribute('data-mv-rail-peek');
  });
});
