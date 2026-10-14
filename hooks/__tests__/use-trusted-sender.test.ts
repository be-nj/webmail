import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useIsTrustedSender } from '@/hooks/use-trusted-sender';
import { useSettingsStore } from '@/stores/settings-store';
import { useContactStore } from '@/stores/contact-store';

// The image allow-list fills itself: "Always load images from this sender"
// and every reply add to it. A sender landing there must not get the Trusted
// Mark, which only the reader's own marking hands out.
describe('useIsTrustedSender', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      trustedSenders: ['no-reply@messaging.metamail.com'],
      trustedSendersAddressBook: true,
      markedTrustedSenders: ['anna@example.com'],
    });
    useContactStore.setState({ trustedSenderEmails: ['replied-to@example.com'] });
  });

  it('trusts an address the reader marked', () => {
    const { result } = renderHook(() => useIsTrustedSender());
    expect(result.current('Anna@Example.com ')).toBe(true);
  });

  it('does not trust an address that is only allowed to load images', () => {
    const { result } = renderHook(() => useIsTrustedSender());
    expect(result.current('no-reply@messaging.metamail.com')).toBe(false);
    expect(result.current('replied-to@example.com')).toBe(false);
  });
});

describe('marking a Trusted Sender', () => {
  beforeEach(() => {
    useSettingsStore.setState({ trustedSenders: [], markedTrustedSenders: [] });
  });

  it('keeps the mark apart from the image allow-list', () => {
    useSettingsStore.getState().markTrustedSender('Anna <Anna@Example.com>');
    expect(useSettingsStore.getState().markedTrustedSenders).toEqual(['anna@example.com']);
    expect(useSettingsStore.getState().trustedSenders).toEqual([]);

    useSettingsStore.getState().addTrustedSender('bob@example.com');
    expect(useSettingsStore.getState().markedTrustedSenders).toEqual(['anna@example.com']);

    useSettingsStore.getState().unmarkTrustedSender('anna@example.com');
    expect(useSettingsStore.getState().markedTrustedSenders).toEqual([]);
  });
});
