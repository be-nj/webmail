import { useCallback } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useContactStore } from '@/stores/contact-store';

/**
 * Whether an address is a Trusted Sender: in the local list, or in the
 * trusted-senders address book when that mode is on. Re-renders when either
 * list changes.
 */
export function useIsTrustedSender(): (address: string) => boolean {
  const trustedSenders = useSettingsStore((s) => s.trustedSenders);
  const useAddressBook = useSettingsStore((s) => s.trustedSendersAddressBook);
  const addressBookEmails = useContactStore((s) => s.trustedSenderEmails);

  return useCallback(
    (address: string) => {
      const normalized = address.trim().toLowerCase();
      return trustedSenders.includes(normalized) || (!!useAddressBook && addressBookEmails.includes(normalized));
    },
    [trustedSenders, useAddressBook, addressBookEmails],
  );
}
