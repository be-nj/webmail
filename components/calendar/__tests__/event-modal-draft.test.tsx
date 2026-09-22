import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EventModal } from '../event-modal';
import type { Calendar, CalendarEvent } from '@/lib/jmap/types';

// "Create event from message": the mail says what, not when, so the form opens
// with the subject filled in and the date blank (and unsavable until picked).

const calendars = [{ id: 'cal-1', name: 'Calendar', isShared: false }] as unknown as Calendar[];
const draft = {
  title: 'Quectel RM520N module',
  description: 'From the message from Kleinanzeigen, 17 Sept 2026',
  links: {
    message: { '@type': 'Link', href: 'https://mail.example/mail/message/m1', rel: 'enclosure', cid: null, contentType: 'message/rfc822', size: null, display: null, title: 'Open message' },
    eml: { '@type': 'Link', href: 'data:message/rfc822;base64,Rk9P', rel: 'enclosure', cid: null, contentType: 'message/rfc822', size: 3, display: null, title: 'mail.eml' },
  },
} as const;

const renderModal = (onSave = vi.fn().mockResolvedValue(undefined)) => {
  const view = render(
    <EventModal calendars={calendars} draft={{ ...draft, datesUnset: true }} onSave={onSave} onClose={vi.fn()} />,
  );
  const dateInputs = view.container.querySelectorAll('input[type="date"]');
  return { onSave, view, startDate: dateInputs[0] as HTMLInputElement, endDate: dateInputs[1] as HTMLInputElement };
};

describe('EventModal with a draft from a message', () => {
  it('prefills title and description and leaves the dates blank', () => {
    const { startDate, endDate } = renderModal();
    expect(screen.getByDisplayValue(draft.title)).toBeTruthy();
    expect(screen.getByDisplayValue(draft.description)).toBeTruthy();
    expect(startDate.value).toBe('');
    expect(endDate.value).toBe('');
  });

  it('focuses the start date, since that is what the message does not say', () => {
    const { startDate } = renderModal();
    expect(document.activeElement).toBe(startDate);
  });

  it('cannot be saved before a date is picked', () => {
    renderModal();
    expect((screen.getByText('form.save').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('fills the end from the picked start, an hour later', () => {
    const { startDate, endDate, view } = renderModal();
    fireEvent.change(startDate, { target: { value: '2026-10-05' } });
    expect(endDate.value).toBe('2026-10-05');
    const times = view.container.querySelectorAll('input[type="time"]');
    const start = (times[0] as HTMLInputElement).value;
    const end = (times[1] as HTMLInputElement).value;
    expect(start).toMatch(/^\d{2}:\d{2}$/);
    expect(Number(end.slice(0, 2))).toBe((Number(start.slice(0, 2)) + 1) % 24);
  });

  it('saves the message links with the new event', async () => {
    const { onSave, startDate } = renderModal();
    fireEvent.change(startDate, { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByText('form.save'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const data = onSave.mock.calls[0][0] as Partial<CalendarEvent>;
    expect(data.title).toBe(draft.title);
    expect(data.description).toBe(draft.description);
    expect(data.start?.startsWith('2026-10-05T')).toBe(true);
    expect(Object.keys(data.links ?? {})).toEqual(['message', 'eml']);
    expect(data.links?.eml.href).toBe('data:message/rfc822;base64,Rk9P');
  });
});
