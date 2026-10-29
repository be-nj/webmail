import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JMAPClient, CATCH_ALL_SENDER_CAPABILITY } from '../jmap/client';

// Fork issue #1: an address on a group's catch-all domain is sent through the
// group's shared account, so its copy is filed in the group's Sent folder.

type MethodCall = [string, Record<string, unknown>, string];

const SUBMISSION = 'urn:ietf:params:jmap:submission';

function createClient(): JMAPClient {
  const client = new JMAPClient('https://jmap.example.com', 'b@benj.de', 'pass');
  const accounts = {
    own: {
      name: 'b@benj.de',
      accountCapabilities: {
        [SUBMISSION]: {},
        [CATCH_ALL_SENDER_CAPABILITY]: { catchAllDomains: ['benj.email', 'bmn.email'] },
      },
    },
    group: {
      name: 'mb@beck.ma',
      accountCapabilities: {
        [SUBMISSION]: {},
        [CATCH_ALL_SENDER_CAPABILITY]: { catchAllDomains: ['BMN.email'] },
      },
    },
  };
  Object.assign(client, {
    apiUrl: 'https://jmap.example.com/api',
    accountId: 'own',
    username: 'b@benj.de',
    accounts,
    session: { primaryAccounts: { [SUBMISSION]: 'own' }, accounts },
  });
  return client;
}

/**
 * A server with an identity list per account; records every call. An account
 * holds at most `maxIdentities` identities, like Stalwart's object quota.
 */
function mockServer(identities: Record<string, Array<{ id: string; email: string }>>, maxIdentities = Infinity) {
  const calls: MethodCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { methodCalls } = JSON.parse((init as { body: string }).body) as { methodCalls: MethodCall[] };
    calls.push(...methodCalls);
    const methodResponses = methodCalls.map(([name, args, callId]) => {
      const accountId = args.accountId as string;
      if (name === 'Mailbox/get') {
        return [name, { list: [
          { id: `${accountId}-drafts`, name: 'Drafts', role: 'drafts' },
          { id: `${accountId}-sent`, name: 'Sent', role: 'sent' },
        ] }, callId];
      }
      if (name === 'Identity/get') return [name, { list: identities[accountId] ?? [] }, callId];
      if (name === 'Identity/set' && args.destroy) {
        const destroy = args.destroy as string[];
        identities[accountId] = (identities[accountId] ?? []).filter((identity) => !destroy.includes(identity.id));
        return [name, { destroyed: destroy }, callId];
      }
      if (name === 'Identity/set') {
        const create = (args.create as Record<string, { email: string }>)['new-identity'];
        if ((identities[accountId] ?? []).length >= maxIdentities) {
          return [name, { notCreated: { 'new-identity': { type: 'overQuota', description: 'There are too many identities' } } }, callId];
        }
        const id = `${accountId}-id-${Date.now()}-${(identities[accountId] ?? []).length + 1}`;
        identities[accountId] = [...(identities[accountId] ?? []), { id, email: create.email }];
        return [name, { created: { 'new-identity': { id } } }, callId];
      }
      if (name === 'Email/set') {
        const created = Object.keys((args.create ?? {}) as object);
        return [name, { created: Object.fromEntries(created.map((id) => [id, { id: 'email-9' }])) }, callId];
      }
      if (name === 'EmailSubmission/set') return [name, { created: { '1': { id: 'sub-1' } } }, callId];
      return ['error', { type: 'unknownMethod' }, callId];
    });
    const payload = { methodResponses };
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(payload)),
      json: () => Promise.resolve(payload),
    } as Response;
  });
  return calls;
}

const send = (client: JMAPClient, from: string) => client.sendEmail(
  ['rcpt@example.net'], 'Subject', 'body',
  undefined, undefined, 'own-id-1', from,
  undefined, 'B', undefined, undefined, undefined, undefined, undefined,
  from,
);

describe('catch-all sender routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("finds the group whose catch-all takes the address's domain", () => {
    const client = createClient();
    expect(client.getSharedCatchAllAccount('xyz@bmn.email')).toEqual({ id: 'group', name: 'mb@beck.ma' });
    expect(client.getSharedCatchAllAccount('firma@benj.email')).toBeUndefined();
    expect(client.getCatchAllDomains('group')).toEqual(['bmn.email']);
  });

  it("creates a group catch-all address's identity in the group account", async () => {
    const identities = { own: [{ id: 'own-id-1', email: 'b@benj.de' }], group: [] };
    mockServer(identities);

    await expect(createClient().ensureCatchAllIdentity('xyz@bmn.email', 'B'))
      .resolves.toEqual({ accountId: 'group', created: true });
    expect(identities.group).toEqual([{ id: expect.stringMatching(/^group-id-/), email: 'xyz@bmn.email' }]);
    expect(identities.own).toHaveLength(1);

    await expect(createClient().ensureCatchAllIdentity('xyz@bmn.email', 'B'))
      .resolves.toEqual({ accountId: 'group', created: false });
  });

  it('keeps your own catch-all addresses in your account', async () => {
    const identities = { own: [{ id: 'own-id-1', email: 'b@benj.de' }], group: [] };
    mockServer(identities);

    await expect(createClient().ensureCatchAllIdentity('firma@benj.email', 'B'))
      .resolves.toEqual({ accountId: 'own', created: true });
    expect(identities.own.map((i) => i.email)).toContain('firma@benj.email');
  });

  it('deletes the longest unused address Bulwark created when the account is full', async () => {
    const identities = {
      own: [
        { id: 'own-id-1', email: 'b@benj.de' },
        { id: 'own-id-2', email: 'shop@benj.email' },
        { id: 'own-id-3', email: 'old@benj.email' },
      ],
      group: [],
    };
    const calls = mockServer(identities, 3);

    await expect(createClient().ensureCatchAllIdentity('new@benj.email', 'B', {
      'shop@benj.email': 2_000,
      'old@benj.email': 1_000,
      'gone@benj.email': 500,
    })).resolves.toEqual({ accountId: 'own', created: true, removed: 'old@benj.email' });
    expect(identities.own.map((i) => i.email)).toEqual(['b@benj.de', 'shop@benj.email', 'new@benj.email']);
    expect(calls.find(([name, args]) => name === 'Identity/set' && args.destroy)![1])
      .toMatchObject({ accountId: 'own', destroy: ['own-id-3'] });
  });

  it('leaves identities Bulwark did not create alone when the account is full', async () => {
    const identities = { own: [{ id: 'own-id-1', email: 'b@benj.de' }, { id: 'own-id-2', email: 'hand@benj.email' }], group: [] };
    mockServer(identities, 2);

    await expect(createClient().ensureCatchAllIdentity('new@benj.email', 'B', { 'other@benj.email': 1_000 }))
      .rejects.toThrow('There are too many identities');
    expect(identities.own).toHaveLength(2);
  });

  it("sends a group catch-all address through the group and files it in the group's Sent", async () => {
    const calls = mockServer({ own: [{ id: 'own-id-1', email: 'b@benj.de' }], group: [{ id: 'group-id-1', email: 'xyz@bmn.email' }] });

    await send(createClient(), 'xyz@bmn.email');

    const emailSet = calls.find(([name]) => name === 'Email/set')!;
    expect(emailSet[1].accountId).toBe('group');
    const submission = calls.find(([name]) => name === 'EmailSubmission/set')!;
    expect(submission[1]).toMatchObject({
      accountId: 'group',
      create: { '1': { identityId: 'group-id-1' } },
      onSuccessUpdateEmail: { '#1': { mailboxIds: { 'group-sent': true } } },
    });
  });

  it('keeps an address of your own on the group domain in your account', async () => {
    const calls = mockServer({ own: [{ id: 'own-id-1', email: 'b@benj.de' }, { id: 'own-id-2', email: 'b@bmn.email' }], group: [] });

    await send(createClient(), 'b@bmn.email');

    const submission = calls.find(([name]) => name === 'EmailSubmission/set')!;
    expect(submission[1]).toMatchObject({ accountId: 'own', create: { '1': { identityId: 'own-id-2' } } });
  });
});
