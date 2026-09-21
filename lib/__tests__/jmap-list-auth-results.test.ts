import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JMAPClient } from '../jmap/client';

const AUTH = 'header:Authentication-Results:asText:all';

function makeSession() {
  return {
    capabilities: { 'urn:ietf:params:jmap:core': {} },
    accounts: { 'acct-1': { name: 'test', isPersonal: true, accountCapabilities: {} } },
    primaryAccounts: { 'urn:ietf:params:jmap:mail': 'acct-1' },
    apiUrl: 'https://mail.example.com/jmap/api',
    downloadUrl: 'https://mail.example.com/jmap/download/{accountId}/{blobId}/{name}',
    uploadUrl: 'https://mail.example.com/jmap/upload/{accountId}/',
    eventSourceUrl: 'https://mail.example.com/jmap/eventsource',
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('list rows carry the DMARC verdict', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('asks for Authentication-Results and parses it into authenticationResults', async () => {
    fetchSpy.mockResolvedValueOnce(json(makeSession()));
    const client = new JMAPClient('https://mail.example.com', 'user@test.com', 'pass123');
    await client.connect();
    fetchSpy.mockReset();

    fetchSpy.mockResolvedValueOnce(json({
      methodResponses: [
        ['Email/get', {
          list: [
            {
              id: 'e1', threadId: 't1', mailboxIds: { mb1: true }, keywords: {}, receivedAt: '2026-09-01T00:00:00Z',
              from: [{ email: 'news@brand.example' }],
              [AUTH]: [
                'mx.test; dkim=pass header.d=brand.example; spf=pass smtp.mailfrom=brand.example; dmarc=pass header.from=brand.example policy.dmarc=reject',
                'forged.example; dmarc=fail header.from=brand.example',
              ],
            },
            { id: 'e2', threadId: 't2', mailboxIds: { mb1: true }, keywords: {}, receivedAt: '2026-09-01T00:00:00Z', [AUTH]: [] },
          ],
        }, '0'],
      ],
    }));

    const emails = await client.getSomeEmails(['e1', 'e2']);

    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request.methodCalls[0][1].properties).toContain(AUTH);

    const e1 = emails.find((e) => e.id === 'e1')!;
    expect(e1.authenticationResults?.dmarc).toEqual({ result: 'pass', domain: 'brand.example', policy: 'reject' });
    expect(e1).not.toHaveProperty(AUTH);

    const e2 = emails.find((e) => e.id === 'e2')!;
    expect(e2.authenticationResults).toBeUndefined();
    expect(e2).not.toHaveProperty(AUTH);
  });
});
