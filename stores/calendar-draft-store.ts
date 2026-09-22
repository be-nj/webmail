import { create } from 'zustand';
import type { EventDraftPrefill } from '@/components/calendar/event-modal';

/**
 * Hand-off for "create event from message": the mail view fills the draft and
 * navigates to the calendar, which takes it and opens the event form on it.
 *
 * Deliberately not persisted. The draft carries the message embedded as a
 * data: URI, it is only meaningful for the navigation that follows, and a
 * stale one reopening a form on the next visit would be a surprise.
 */
interface CalendarDraftStore {
  draft: EventDraftPrefill | null;
  setDraft: (draft: EventDraftPrefill | null) => void;
  /** The pending draft, cleared in the same step so it opens exactly once. */
  takeDraft: () => EventDraftPrefill | null;
}

export const useCalendarDraftStore = create<CalendarDraftStore>((set, get) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  takeDraft: () => {
    const { draft } = get();
    if (draft) set({ draft: null });
    return draft;
  },
}));
