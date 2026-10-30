import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCalendarStore } from '../calendar-store';
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { Calendar, CalendarEvent } from '@/lib/jmap/types';

// Fork: an event edited into a calendar of another account (the family
// calendar of a group account) moves there. A calendarIds patch alone never
// reached it: the server only knows the calendars of the event's account.

const calendars = [
  { id: 'own', originalId: 'own', name: 'Benjamin', accountId: 'c' },
  { id: 'fch', originalId: 'fch', name: 'FCH', accountId: 'c' },
  { id: 'd:fam', originalId: 'fam', name: 'Familie', accountId: 'd', isShared: true },
] as unknown as Calendar[];

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    originalId: 'e1',
    uid: 'dinner@example.com',
    title: 'Dinner',
    start: '2026-11-02T19:00:00',
    duration: 'PT2H',
    timeZone: 'Europe/Berlin',
    showWithoutTime: false,
    calendarIds: { own: true },
    accountId: 'c',
    ...overrides,
  } as CalendarEvent;
}

const server = {
  id: 'e1',
  uid: 'dinner@example.com',
  title: 'Dinner',
  start: '2026-11-02T19:00:00',
  duration: 'PT2H',
  timeZone: 'Europe/Berlin',
  calendarIds: { own: true },
  created: '2026-10-01T10:00:00Z',
  updated: '2026-10-01T10:00:00Z',
  sequence: 2,
  utcStart: '2026-11-02T18:00:00Z',
  utcEnd: '2026-11-02T20:00:00Z',
} as unknown as CalendarEvent;

function fakeClient(original: CalendarEvent = server) {
  return {
    getCalendarEvent: vi.fn().mockResolvedValue(original),
    createCalendarEvent: vi.fn(async (data: Partial<CalendarEvent>) => ({ ...data, id: 'new1' })),
    deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
    updateCalendarEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as IJMAPClient & Record<'getCalendarEvent' | 'createCalendarEvent' | 'deleteCalendarEvent' | 'updateCalendarEvent', ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  useCalendarStore.getState().clearState();
  useCalendarStore.setState({ events: [], calendars, error: null });
});

describe('moving an event to a calendar of another account', () => {
  it('saves the rest of the edit where it is, then moves it quietly into the group account', async () => {
    useCalendarStore.setState({ events: [event()] });
    const client = fakeClient();

    const ok = await useCalendarStore.getState().updateEvent(client, 'e1', { calendarIds: { 'd:fam': true }, title: 'Family dinner' }, true);

    expect(ok).toBe(true);
    // The edit as an ordinary update, with the scheduling the user chose.
    const [updatedId, patch, send] = client.updateCalendarEvent.mock.calls[0];
    expect(updatedId).toBe('e1');
    expect(patch).toMatchObject({ title: 'Family dinner' });
    expect(patch).not.toHaveProperty('calendarIds');
    expect(send).toBe(true);
    expect(client.getCalendarEvent).toHaveBeenCalledWith('e1', 'c');
    const [data, quiet, accountId] = client.createCalendarEvent.mock.calls[0];
    expect(accountId).toBe('d');
    expect(quiet).toBe(false);
    expect(data).toMatchObject({ uid: 'dinner@example.com', calendarIds: { fam: true } });
    for (const key of ['id', 'created', 'updated', 'sequence', 'utcStart', 'utcEnd']) expect(data).not.toHaveProperty(key);
    expect(client.deleteCalendarEvent).toHaveBeenCalledWith('e1', false, 'c');

    const events = useCalendarStore.getState().events;
    expect(events.map((e) => e.id)).toEqual(['d:new1']);
    expect(events[0].calendarIds).toEqual({ 'd:fam': true });
  });

  it('takes the copy back when the original cannot be removed', async () => {
    useCalendarStore.setState({ events: [event()] });
    const client = fakeClient();
    client.deleteCalendarEvent.mockRejectedValueOnce(new Error('forbidden')).mockResolvedValue(undefined);

    await expect(useCalendarStore.getState().updateEvent(client, 'e1', { calendarIds: { 'd:fam': true } })).rejects.toThrow();

    expect(client.deleteCalendarEvent).toHaveBeenLastCalledWith('new1', false, 'd');
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual(['e1']);
  });

  it('moves a group event back into an own calendar', async () => {
    useCalendarStore.setState({
      events: [event({ id: 'd:e1', calendarIds: { 'd:fam': true }, accountId: 'd', isShared: true })],
    });
    const client = fakeClient({ ...server, calendarIds: { fam: true } } as CalendarEvent);

    await useCalendarStore.getState().updateEvent(client, 'd:e1', { calendarIds: { own: true } });

    expect(client.getCalendarEvent).toHaveBeenCalledWith('e1', 'd');
    const [data, , accountId] = client.createCalendarEvent.mock.calls[0];
    expect(accountId).toBeUndefined();
    expect(data).toMatchObject({ calendarIds: { own: true } });
    expect(client.deleteCalendarEvent).toHaveBeenCalledWith('e1', false, 'd');
  });

  it('keeps a change between calendars of the same account a plain update', async () => {
    useCalendarStore.setState({ events: [event()] });
    const client = fakeClient();

    await useCalendarStore.getState().updateEvent(client, 'e1', { calendarIds: { fch: true } });

    expect(client.updateCalendarEvent).toHaveBeenCalled();
    expect(client.createCalendarEvent).not.toHaveBeenCalled();
    expect(client.deleteCalendarEvent).not.toHaveBeenCalled();
  });
});
