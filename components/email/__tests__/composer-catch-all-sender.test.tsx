import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { EmailComposer } from '../email-composer';

// ─── Heavy component mocks (mirrors composer-reopened-draft-signature.test.tsx) ─

vi.mock('@/components/email/rich-text-editor', () => ({
  RichTextEditor: () => React.createElement('div', { 'data-testid': 'rich-text-editor' }),
}));

vi.mock('@/components/plugins/plugin-slot', () => ({ PluginSlot: () => null }));
vi.mock('@/components/identity/sub-address-helper', () => ({ SubAddressHelper: () => null }));
vi.mock('@/components/templates/template-picker', () => ({ TemplatePicker: () => null }));
vi.mock('@/components/templates/template-form', () => ({ TemplateForm: () => null }));
vi.mock('@/components/files/file-preview-modal', () => ({ FilePreviewModal: () => null }));
vi.mock('@/hooks/use-focus-trap', () => ({
  useFocusTrap: () => ({ current: null }),
}));
vi.mock('@/hooks/use-pro-multi-account-identities', () => ({
  useProMultiAccountIdentities: () => ({ enabled: false, groups: [], allIdentities: [] }),
  stripCrossAccountIdentityPrefix: (id: string) => ({ localAccountId: null, rawId: id }),
}));

// ─── Store mocks ──────────────────────────────────────────────────────────────

const catchAll = vi.hoisted(() => ({
  ensureCatchAllIdentity: vi.fn(),
  refreshIdentities: vi.fn(async () => {}),
  updateSetting: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/stores/auth-store', () => {
  const state = {
    client: {
      getCatchAllDomains: () => ['benj.email', 'bmn.email'],
      ensureCatchAllIdentity: catchAll.ensureCatchAllIdentity,
      getSharedCatchAllAccount: (email: string) =>
        (email.endsWith('@bmn.email') ? { id: 'acc-group', name: 'mb@beck.ma' } : undefined),
      createDraft: async () => 'draft-1',
      hasDelayedSend: () => false,
      getMaxDelayedSend: () => 0,
      supportsFiles: () => false,
      getMaxSizeAttachmentsPerEmail: () => 0,
    },
    identities: [],
    primaryIdentity: null,
    isAuthenticated: false,
    isDemoMode: false,
    activeAccountId: 'acc-1',
    connectionLost: false,
    getClientForAccount: () => undefined,
    getAllConnectedClients: () => new Map(),
    syncIdentities: () => {},
    refreshIdentities: catchAll.refreshIdentities,
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useAuthStore: hook };
});

vi.mock('@/stores/identity-store', () => {
  const state = {
    identities: [
      { id: 'id-me', email: 'b@benj.de', name: 'Me' },
      { id: 'id-old', email: 'old@benj.email', name: 'Me' },
    ] as Array<Record<string, unknown>>,
    defaultIdentityId: 'id-me',
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useIdentityStore: hook };
});

vi.mock('@/stores/account-store', () => {
  const state = { accounts: [], getAccountById: () => undefined };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useAccountStore: hook };
});

vi.mock('@/stores/email-store', () => {
  const state = {
    draftSaveEnabled: false,
    sendRawEmail: async () => ({ sent: true }),
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useEmailStore: hook };
});

vi.mock('@/stores/settings-store', () => {
  const state = {
    timeFormat: '24h',
    plainTextMode: false,
    subAddressDelimiter: '+',
    autoSelectReplyIdentity: true,
    attachmentReminderEnabled: false,
    attachmentReminderKeywords: [],
    emptySubjectWarningEnabled: true,
    sendDelaySeconds: 0,
    // The default position: replies/forwards get the signature appended at
    // send time rather than embedded above the quote.
    signaturePosition: 'below_quote',
    signatureSeparatorEnabled: true,
    requestReadReceiptDefault: false,
    addTrustedSender: () => {},
    trustedSendersAddressBook: null,
    updateSetting: catchAll.updateSetting,
    catchAllSenders: {} as Record<string, Record<string, number>>,
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useSettingsStore: hook };
});

vi.mock('@/stores/contact-store', () => {
  const state = {
    contacts: [],
    getAutocomplete: async () => [],
    addToTrustedSendersBook: async () => {},
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useContactStore: hook };
});

vi.mock('@/stores/template-store', () => {
  const state = { templates: [], addTemplate: async () => {} };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useTemplateStore: hook };
});

// ─── Misc dependency mocks ────────────────────────────────────────────────────

vi.mock('@/stores/toast-store', () => ({
  toast: { info: catchAll.toastInfo, error: catchAll.toastError, success: () => {} },
}));

vi.mock('@/lib/plugin-hooks', () => ({
  emailHooks: {
    onComposerOpen: { call: async () => [] },
    onRecipientChange: { call: async () => [] },
    getRecipientSuggestions: { call: async () => [] },
    onRecipientChipsChange: { transform: async (chips: unknown) => chips },
    onDraftChange: { emit: () => {} },
    onBeforeDraftAutoSave: { transform: async (draft: unknown) => draft },
    onBeforeEmailSend: { intercept: async () => true, interceptOutcome: async () => 'allowed' },
    onComposeSend: { takeOver: async () => 'default' },
    onTransformOutgoingEmail: { transform: async (email: unknown) => email },
  },
  identityHooks: {
    onIdentitiesLoaded: { size: 0, emit: () => {} },
    onBeforeIdentityChange: { intercept: async () => true },
    onIdentityCreate: { emit: () => {} },
    onIdentitySelected: { emit: () => {} },
    onSignatureRender: { size: 0, transform: async (v: unknown) => v },
  },
  contactHooks: {
    search: { call: async () => [] },
    onProvideRecipientSuggestions: { transform: async (initial: unknown) => initial },
  },
}));

vi.mock('@/lib/email-sanitization', () => ({
  sanitizeSignatureHtml: (v: string) => v,
  sanitizeSignatureHtmlForDisplay: (v: string) => v,
  sanitizeEmailHtml: (v: string) => v,
  sanitizePluginBodyHtml: (v: string) => v,
  escapeHtml: (v: string) => v,
  parseHtmlSafely: (html: string) => new DOMParser().parseFromString(html, 'text/html'),
}));

vi.mock('@/lib/email-threading', () => ({
  computeReplyThreadingHeaders: () => ({ inReplyTo: [], references: [] }),
}));
vi.mock('@/lib/sub-addressing', () => ({ generateSubAddress: () => '' }));
vi.mock('@/lib/debug', () => ({ debug: { log: () => {}, warn: () => {}, error: () => {} } }));
vi.mock('@/components/email/quoted-html', () => ({
  buildQuotedHtmlBlock: () => '',
  serializeEditorContent: () => '',
}));
vi.mock('@/lib/template-utils', () => ({ substitutePlaceholders: (s: string) => s }));

// ─── Tests ────────────────────────────────────────────────────────────────────

// Fork issue #1: the server (beckm4nn Stalwart build) lets the account send
// from any address on its catch-all domains, but EmailSubmission only takes an
// identity's own address as envelope sender. So the first send from such an
// address creates its identity, and the client then sends through it.

const { useSettingsStore } = await import('@/stores/settings-store');

const DRAFT = {
  to: 'bob@other.com',
  cc: '',
  bcc: '',
  subject: 'Hello',
  body: '<p>Hi</p>',
  showCc: false,
  showBcc: false,
  selectedIdentityId: 'id-me',
  subAddressTag: '',
  mode: 'compose' as const,
  draftId: null,
  fromOverrideEnabled: true,
  fromOverrideName: 'Shop',
};

async function send(onSend: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getAllByTestId('composer-send')[0]);
  await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  return onSend.mock.calls[0][0] as { fromEmail?: string; envelopeMailFrom?: string };
}

describe('composer sending from a catch-all address', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ catchAllSenders: {} });
  });

  it('creates the identity on first send, then sends from the address', async () => {
    catchAll.ensureCatchAllIdentity.mockResolvedValue({ accountId: 'acc-own', created: true });
    const onSend = vi.fn();
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEmail: 'Firma@benj.email' }} onSend={onSend} />);

    // Says what will happen instead of the Return-Path warning.
    expect(screen.getByText('catch_all.pending')).toBeInTheDocument();
    expect(screen.queryByText('from_override.envelope_notice')).not.toBeInTheDocument();

    const sent = await send(onSend);
    expect(catchAll.ensureCatchAllIdentity).toHaveBeenCalledWith('firma@benj.email', 'Shop', undefined);
    expect(catchAll.ensureCatchAllIdentity.mock.invocationCallOrder[0]).toBeLessThan(onSend.mock.invocationCallOrder[0]);
    expect(sent.envelopeMailFrom?.toLowerCase()).toBe('firma@benj.email');
    expect(catchAll.refreshIdentities).toHaveBeenCalled();
    expect(catchAll.updateSetting).toHaveBeenCalledWith('catchAllSenders', {
      'acc-1': { 'firma@benj.email': expect.any(Number) },
    });
  });

  it('forgets the address the client removed to make room', async () => {
    useSettingsStore.setState({ catchAllSenders: { 'acc-1': { 'old@benj.email': 1_000, 'gone@benj.email': 500 } } });
    catchAll.ensureCatchAllIdentity.mockResolvedValue({ accountId: 'acc-own', created: true, removed: 'gone@benj.email' });
    const onSend = vi.fn();
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEmail: 'firma@benj.email' }} onSend={onSend} />);

    await send(onSend);
    expect(catchAll.ensureCatchAllIdentity).toHaveBeenCalledWith('firma@benj.email', 'Shop', {
      'old@benj.email': 1_000, 'gone@benj.email': 500,
    });
    expect(catchAll.toastInfo).toHaveBeenCalledWith('catch_all.removed_unused');
    expect(catchAll.updateSetting).toHaveBeenCalledWith('catchAllSenders', {
      'acc-1': { 'old@benj.email': 1_000, 'firma@benj.email': expect.any(Number) },
    });
  });

  it('does not send when the server refuses the address', async () => {
    catchAll.ensureCatchAllIdentity.mockRejectedValue(new Error('invalidProperties'));
    const onSend = vi.fn();
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEmail: 'taken@bmn.email' }} onSend={onSend} />);

    fireEvent.click(screen.getAllByTestId('composer-send')[0]);
    await waitFor(() => expect(catchAll.toastError).toHaveBeenCalledWith('catch_all.create_failed'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('reuses an identity that already exists for the address', async () => {
    const onSend = vi.fn();
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEmail: 'old@benj.email' }} onSend={onSend} />);
    expect(screen.queryByText('catch_all.pending')).not.toBeInTheDocument();

    await send(onSend);
    expect(catchAll.ensureCatchAllIdentity).not.toHaveBeenCalled();
  });

  it("names the group account a group's catch-all address is sent through", async () => {
    catchAll.ensureCatchAllIdentity.mockResolvedValue({ accountId: 'acc-group', created: true });
    const onSend = vi.fn();
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEmail: 'xyz@bmn.email' }} onSend={onSend} />);

    expect(screen.getByText('catch_all.via_shared')).toBeInTheDocument();
    expect(screen.queryByText('catch_all.pending')).not.toBeInTheDocument();

    await send(onSend);
    expect(catchAll.ensureCatchAllIdentity).toHaveBeenCalledWith('xyz@bmn.email', 'Shop', undefined);
    // The new identity lives in the group's account, not in this one's list.
    expect(catchAll.refreshIdentities).not.toHaveBeenCalled();
  });

  it('leaves addresses outside the catch-all domains alone', async () => {
    const onSend = vi.fn();
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEmail: 'shop@example.com' }} onSend={onSend} />);
    expect(screen.getByText('from_override.envelope_notice')).toBeInTheDocument();

    await send(onSend);
    expect(catchAll.ensureCatchAllIdentity).not.toHaveBeenCalled();
  });

  it('replies from the catch-all address the message was sent to', async () => {
    const onSend = vi.fn();
    render(
      <EmailComposer
        mode="reply"
        replyTo={{
          from: [{ email: 'bob@other.com', name: 'Bob' }],
          to: [{ email: 'firma@benj.email', name: 'Firma' }],
          subject: 'Anfrage',
        } as never}
        onSend={onSend}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('from_override.email_label')).toHaveValue('firma@benj.email'));
    expect(screen.getByLabelText('from_override.name_label')).toHaveValue('Me');
  });

  it('leaves the catch-all address it replies from out of reply-all', async () => {
    render(
      <EmailComposer
        mode="replyAll"
        replyTo={{
          from: [{ email: 'bob@other.com', name: 'Bob' }],
          to: [{ email: 'dies-ist-ein-test@bmn.email' }, { email: 'carol@other.com', name: 'Carol' }],
          subject: 'Test',
        } as never}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('from_override.email_label')).toHaveValue('dies-ist-ein-test@bmn.email'));
    const chips = Array.from(screen.getByTestId('composer-to').querySelectorAll('[draggable]')).map((el) => el.textContent?.trim());
    expect(chips.join(' ')).not.toContain('bmn.email');
    expect(chips.join(' ')).toContain('Bob');
  });

  it('keeps an old catch-all identity out of the From list, but not a recent one', () => {
    useSettingsStore.setState({ catchAllSenders: { 'acc-1': { 'old@benj.email': 0 } } });
    const { unmount } = render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEnabled: false }} />);
    const options = () => [...screen.getByTestId('composer-from').querySelectorAll('option')].map((o) => o.value);
    expect(options()).toEqual(['id-me']);
    unmount();

    useSettingsStore.setState({ catchAllSenders: { 'acc-1': { 'old@benj.email': Date.now() } } });
    render(<EmailComposer initialData={{ ...DRAFT, fromOverrideEnabled: false }} />);
    expect(options()).toEqual(['id-me', 'id-old']);
  });
});
