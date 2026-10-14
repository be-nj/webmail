import { useCallback } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Whether an address is a Trusted Sender: one the reader marked by hand.
 * The image allow-list (trustedSenders and the trusted-senders address book)
 * is not enough - "Always load images" and every reply add to it without the
 * reader ever saying they trust the person. Re-renders when the marks change.
 */
export function useIsTrustedSender(): (address: string) => boolean {
  const markedTrustedSenders = useSettingsStore((s) => s.markedTrustedSenders);

  return useCallback(
    (address: string) => markedTrustedSenders.includes(address.trim().toLowerCase()),
    [markedTrustedSenders],
  );
}
