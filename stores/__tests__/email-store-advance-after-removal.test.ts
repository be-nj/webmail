import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmailStore } from '../email-store';
import type { Email, Mailbox } from '@/lib/jmap/types';
import type { IJMAPClient } from '@/lib/jmap/client-interface';

// Where the open message takes the list's place, archiving it must bring the
// list back (as in Gmail) rather than open the next message.

const inbox = { id: 'inbox', name: 'Inbox', role: 'inbox', totalEmails: 2, unreadEmails: 0, totalThreads: 2, unreadThreads: 0 } as Mailbox;
const archive = { id: 'archive', name: 'Archive', role: 'archive', totalEmails: 0, unreadEmails: 0, totalThreads: 0, unreadThreads: 0 } as Mailbox;
const email = (id: string) => ({
  id, threadId: `t-${id}`, mailboxIds: { inbox: true }, keywords: { $seen: true },
  subject: id, receivedAt: '2026-10-01T10:00:00Z',
}) as unknown as Email;

describe('removing the open email', () => {
  let client: IJMAPClient;

  beforeEach(() => {
    client = { moveEmail: vi.fn().mockResolvedValue(undefined) } as unknown as IJMAPClient;
    const [first, second] = [email('m1'), email('m2')];
    useEmailStore.setState({
      emails: [first, second], selectedEmail: first, mailboxes: [inbox, archive], selectedMailbox: 'inbox',
      isUnifiedView: false, unifiedRole: null, viewingAccountId: null, accountMailboxes: {},
    } as never);
  });

  it('opens the next email by default', async () => {
    useEmailStore.getState().setAdvanceAfterRemoval(true);
    await useEmailStore.getState().moveToMailbox(client, 'm1', 'archive');
    expect(useEmailStore.getState().selectedEmail?.id).toBe('m2');
  });

  it('goes back to the list when advancing is off', async () => {
    useEmailStore.getState().setAdvanceAfterRemoval(false);
    await useEmailStore.getState().moveToMailbox(client, 'm1', 'archive');
    expect(useEmailStore.getState().selectedEmail).toBeNull();
    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(['m2']);
  });
});
