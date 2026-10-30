import type { Calendar, CalendarEvent } from "@/lib/jmap/types";

/**
 * Fork: moving an event into a calendar of another account.
 *
 * A JMAP calendarIds patch only reaches calendars of the account the event
 * lives in. A calendar shared from another account (a group's family
 * calendar, say) has to receive a copy of the event, and the original goes.
 * Upstream does the same for tasks (#1204, moveCalendarTaskToAccount).
 */

/** Where an edit's calendarIds send the event, when that is another account. */
export interface AccountMove {
  /** The account to create the event in; undefined for the user's own one. */
  accountId: string | undefined;
}

/**
 * The account move an edit asks for, or null when the event stays in its
 * account. `calendarIds` are the store's ids as the editor sends them.
 */
export function accountMoveFor(
  calendars: Calendar[],
  storeEvent: Pick<CalendarEvent, "isShared" | "accountId" | "localAccountId"> | undefined,
  calendarIds: Record<string, boolean> | undefined,
): AccountMove | null {
  if (!storeEvent || !calendarIds) return null;
  const destId = Object.keys(calendarIds).find((id) => calendarIds[id]);
  const dest = destId ? calendars.find((c) => c.id === destId) : undefined;
  if (!dest) return null;
  // Own calendars count as one account, whatever id they carry.
  const from = storeEvent.isShared ? storeEvent.accountId : undefined;
  const to = dest.isShared ? dest.accountId : undefined;
  if (from === to) return null;
  // Another connected server (Pro) is not another JMAP account of this login.
  if ((dest.localAccountId ?? null) !== (storeEvent.localAccountId ?? null)) {
    throw new Error("Events can't move to a calendar on another server.");
  }
  return { accountId: to };
}

/**
 * The event as created in the other account: what the server holds now, minus
 * what the server sets itself, with the edit on top. The uid stays, so it is
 * still the same event for its participants.
 */
export function eventCopyForAccount(original: CalendarEvent, patch: Partial<CalendarEvent>): Partial<CalendarEvent> {
  const {
    id: _id, created: _created, updated: _updated, sequence: _sequence,
    isDraft: _isDraft, isOrigin: _isOrigin, baseEventId: _baseEventId, blobId: _blobId,
    utcStart: _utcStart, utcEnd: _utcEnd,
    ...rest
  } = original as CalendarEvent & Record<string, unknown>;
  return { ...rest, ...patch } as Partial<CalendarEvent>;
}
