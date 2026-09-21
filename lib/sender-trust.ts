import type { AuthenticationResults } from '@/lib/jmap/types';
import { hasAlignedDmarcPass, isAuthenticationSpoofed } from '@/lib/email-headers';

/**
 * What a message says about a Trusted Sender (see CONTEXT.md).
 *
 * - `trusted`: the From address is a Trusted Sender and the message passed
 *   its Sender Check (DMARC pass for that From domain). Shown as the check
 *   badge on the avatar.
 * - `impersonated`: the From address is a Trusted Sender, but the message
 *   failed its check. Someone put a trusted address into From without owning
 *   it; shown as a red warning.
 * - `null`: not a Trusted Sender, or no verdict either way (no
 *   Authentication-Results, dmarc=none). No signal.
 *
 * Trust is per exact address. A look-alike (`MaxMusterI@` for `Max.Musterl@`)
 * is simply not a Trusted Sender and gets nothing.
 */
export type SenderTrustSignal = 'trusted' | 'impersonated' | null;

export function senderTrustSignal(
  email: {
    from?: Array<{ email?: string | null }> | null;
    authenticationResults?: AuthenticationResults;
  },
  isTrustedSender: (address: string) => boolean,
): SenderTrustSignal {
  const address = email.from?.[0]?.email?.trim().toLowerCase();
  if (!address || !isTrustedSender(address)) return null;
  if (isAuthenticationSpoofed(email.authenticationResults)) return 'impersonated';
  if (hasAlignedDmarcPass(email)) return 'trusted';
  return null;
}
