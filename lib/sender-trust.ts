import type { AuthenticationResults } from '@/lib/jmap/types';
import { getSenderVerification, hasAlignedDmarcPass, isAuthenticationSpoofed } from '@/lib/email-headers';

/**
 * What a message says about a Trusted Sender (see CONTEXT.md).
 *
 * - `trusted`: the From address is a Trusted Sender and the message passed
 *   its Sender Check (DMARC pass for that From domain). Shown as the check
 *   badge on the avatar.
 * - `impersonated`: the From address is a Trusted Sender, but the message
 *   failed its check, or passed neither SPF nor DKIM. Someone put a trusted address into From without owning
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
  if (failsSenderCheck(email)) return 'impersonated';
  if (hasAlignedDmarcPass(email)) return 'trusted';
  return null;
}

/**
 * Whether the receiving server's checks speak against the visible From: a
 * failed check (isAuthenticationSpoofed), or results in which neither SPF
 * nor DKIM passed, so nothing ties the message to the From domain. A Trusted
 * Sender loses its trust on such a message. Messages without
 * Authentication-Results (old archives, own submissions, imports) give no
 * verdict and keep it.
 */
export function failsSenderCheck(email: {
  from?: Array<{ email?: string | null }> | null;
  authenticationResults?: AuthenticationResults;
}): boolean {
  return isAuthenticationSpoofed(email.authenticationResults)
    || getSenderVerification(email.authenticationResults, email.from?.[0]?.email ?? undefined) !== null;
}
