/**
 * Sending from any address of a domain whose catch-all delivers to the
 * account. The server lists those domains per account (see
 * `JMAPClient.getCatchAllDomains`) and accepts any local part on them in
 * `Identity/set`. `EmailSubmission` still wants the envelope sender to be an
 * identity's own address, so Bulwark creates the identity before the first
 * send from such an address and keeps it, out of the From dropdown's way.
 */

/** How long an address Bulwark created stays in the From dropdown after use. */
export const CATCH_ALL_SENDER_RECENT_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_LOCAL_PART_LENGTH = 64;
// RFC 5322 dot-atom: atext runs separated by single dots.
const LOCAL_PART_REGEX = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;

export type LocalPartValidationErrorCode = 'EMPTY' | 'TOO_LONG' | 'INVALID_CHARS' | null;

export function getLocalPartValidationError(localPart: string): LocalPartValidationErrorCode {
  if (!localPart) return 'EMPTY';
  if (localPart.length > MAX_LOCAL_PART_LENGTH) return 'TOO_LONG';
  if (!LOCAL_PART_REGEX.test(localPart)) return 'INVALID_CHARS';
  return null;
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

/** Whether `email` lies on one of the account's catch-all domains. */
export function isCatchAllAddress(email: string, catchAllDomains: string[]): boolean {
  const domain = domainOf(email);
  return !!domain && catchAllDomains.includes(domain);
}

/**
 * Whether the From dropdown should leave an identity out: one Bulwark created
 * for a catch-all address (it has an entry in `senders`) and that has not been
 * used within `CATCH_ALL_SENDER_RECENT_MS`. Identities the user made by hand
 * never have an entry, so they always show.
 */
export function isDormantCatchAllSender(
  email: string,
  senders: Record<string, number> | undefined,
  now: number = Date.now(),
): boolean {
  const lastUsed = senders?.[email.trim().toLowerCase()];
  return lastUsed !== undefined && now - lastUsed > CATCH_ALL_SENDER_RECENT_MS;
}

/** `senders` with `email` marked as used at `now`. */
export function withCatchAllSenderUse(
  senders: Record<string, number> | undefined,
  email: string,
  now: number = Date.now(),
): Record<string, number> {
  return { ...(senders ?? {}), [email.trim().toLowerCase()]: now };
}

/** The most recently used addresses on the given domains, newest first. */
export function recentCatchAllSenders(
  senders: Record<string, number> | undefined,
  catchAllDomains: string[],
  limit = 5,
): string[] {
  return Object.entries(senders ?? {})
    .filter(([email]) => isCatchAllAddress(email, catchAllDomains))
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([email]) => email);
}
