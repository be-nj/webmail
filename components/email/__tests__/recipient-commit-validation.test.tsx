import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { EmailComposer } from '../email-composer';

// ─── Heavy component mocks (mirrors recipient-paste.test.tsx) ─────────────────

vi.mock('@/components/email/rich-text-editor', () => ({
  RichTextEditor: ({ onChange }: { onChange?: (html: string) => void }) => (
    React.createElement('div', { 'data-testid': 'rich-text-editor', onClick: () => onChange?.('') })
  ),
}));

vi.mock('@/components/plugins/plugin-slot', () => ({ PluginSlot: () => null }));
vi.mock('@/components/identity/sub-address-helper', () => ({ SubAddressHelper: () => null }));
vi.mock('@/components/templates/template-picker', () => ({ TemplatePicker: () => null }));
vi.mock('@/components/templates/template-form', () => ({ TemplateForm: () => null }));
vi.mock('@/components/files/file-preview-modal', () => ({ FilePreviewModal: () => null }));
vi.mock('@/hooks/use-focus-trap', () => ({
  useFocusTrap: () => ({ ref: { current: null } }),
}));
vi.mock('@/hooks/use-pro-multi-account-identities', () => ({
  useProMultiAccountIdentities: () => ({ enabled: false, groups: [], allIdentities: [] }),
  stripCrossAccountIdentityPrefix: (id: string) => ({ localAccountId: null, rawId: id }),
}));

// ─── Store mocks ──────────────────────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => {
  const state = {
    client: null,
    identities: [],
    primaryIdentity: null,
    isAuthenticated: false,
    isDemoMode: false,
    activeAccountId: null,
    connectionLost: false,
    getClientForAccount: () => undefined,
    getAllConnectedClients: () => new Map(),
    syncIdentities: () => {},
    refreshIdentities: async () => {},
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useAuthStore: hook };
});

vi.mock('@/stores/identity-store', () => {
  const state = { identities: [], defaultIdentityId: null };
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
    sendDelaySeconds: 0,
    signaturePosition: 'above_quote',
    signatureSeparatorEnabled: false,
    requestReadReceiptDefault: false,
    addTrustedSender: () => {},
    trustedSendersAddressBook: null,
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
  toast: { info: () => {}, error: () => {}, success: () => {} },
}));

vi.mock('@/lib/plugin-hooks', () => ({
  emailHooks: {
    onComposerOpen: { call: async () => [] },
    onRecipientChange: { call: async () => [] },
    getRecipientSuggestions: { call: async () => [] },
    onSend: { call: async () => [] },
    beforeSend: { call: async () => [] },
    onRecipientChipsChange: { transform: async (chips: unknown) => chips },
  },
  contactHooks: {
    search: { call: async () => [] },
  },
}));

vi.mock('@/lib/email-sanitization', () => ({
  sanitizeSignatureHtml: (v: string) => v,
  sanitizeEmailHtml: (v: string) => v,
  parseHtmlSafely: (html: string) => new DOMParser().parseFromString(html, 'text/html'),
}));

vi.mock('@/lib/reply-identity', () => ({
  resolveReplyFrom: () => null,
  findComposeIdentityId: () => null,
}));
vi.mock('@/lib/email-threading', () => ({
  computeReplyThreadingHeaders: () => ({ inReplyTo: [], references: [] }),
}));
vi.mock('@/lib/signature-utils', () => ({
  appendPlainTextSignature: (body: string) => body,
  getPlainTextSignature: () => '',
}));
vi.mock('@/lib/sub-addressing', () => ({ generateSubAddress: () => '' }));
vi.mock('@/lib/debug', () => ({ debug: () => {} }));
vi.mock('@/components/email/quoted-html', () => ({
  buildQuotedHtmlBlock: () => '',
  serializeEditorContent: () => '',
}));
vi.mock('@/lib/template-utils', () => ({ substitutePlaceholders: (s: string) => s }));

// ─── Shared test data ─────────────────────────────────────────────────────────

const EMPTY_DATA = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
  showCc: true,
  showBcc: true,
  selectedIdentityId: null,
  subAddressTag: '',
  mode: 'compose' as const,
  draftId: null,
};

/** next-intl is mocked to return the key, so the To placeholder is "to_placeholder". */
const toInput = () => screen.getByPlaceholderText('to_placeholder') as HTMLInputElement;

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * #795: nothing between the recipient input and Email/set checked that a
 * committed recipient is an address, so Enter/Tab/blur turned any leftover
 * text into a chip that was sent verbatim - producing a To header the relay
 * rejects at DATA, bouncing every recipient of the message.
 */
describe('RecipientChipInput commit validation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const type = (input: HTMLInputElement, value: string) =>
    fireEvent.change(input, { target: { value } });

  it('chips a complete address on Enter', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, 'jane@x.com');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('jane@x.com')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('recovers a mailbox that lost its closing bracket', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, 'Jane Doe <jane@x.com');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Jane Doe (jane@x.com)')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('refuses to chip text that is not an address and flags the field', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, 'Jane Doe');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    expect(input.value).toBe('Jane Doe');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('validation.invalid_recipient')).toBeInTheDocument();
  });

  it('refuses the stray ">" an autocomplete pick leaves behind', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, '>');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input.value).toBe('>');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears the flag as soon as the user edits the entry', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, 'Jane Doe');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveAttribute('aria-invalid', 'true');

    type(input, 'Jane Doe <jane@x.com>');
    expect(input).not.toHaveAttribute('aria-invalid');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Jane Doe (jane@x.com)')).toBeInTheDocument();
  });

  it('leaves an unparseable entry in the input on blur instead of chipping it', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, 'Ap Reinders <ap@x.com, Erwin Beets');
    fireEvent.blur(input);

    expect(input.value).toBe('Ap Reinders <ap@x.com, Erwin Beets');
    expect(screen.queryByText(/Erwin Beets/)).not.toBeInTheDocument();
  });

  it('still accepts an RFC 5322 group entry', () => {
    render(<EmailComposer initialData={EMPTY_DATA} />);
    const input = toInput();
    type(input, 'Team: a@x.com, b@x.com;');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Team (2)')).toBeInTheDocument();
    expect(input.value).toBe('');
  });
});
