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

  it('shows what the event will carry', () => {
    renderModal();
    expect(screen.getByText('Open message')).toBeTruthy();
    expect(screen.getByText('mail.eml')).toBeTruthy();
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
    // 10:15 now: the event starts at the next full hour, as a new one does.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 10, 15));
    try {
      const { startDate, endDate, view } = renderModal();
      fireEvent.change(startDate, { target: { value: '2026-10-05' } });
      expect(endDate.value).toBe('2026-10-05');
      const times = view.container.querySelectorAll('input[type="time"]');
      expect((times[0] as HTMLInputElement).value).toBe('11:00');
      expect((times[1] as HTMLInputElement).value).toBe('12:00');
    } finally {
      vi.useRealTimers();
    }
  });

  const timeInputs = (view: ReturnType<typeof renderModal>['view']) =>
    [...view.container.querySelectorAll('input[type="time"]')] as HTMLInputElement[];
  const saveButton = () => screen.getByText('form.save').closest('button') as HTMLButtonElement;

  it('moves the end to the next day when the hour passes midnight', () => {
    const { view, startDate, endDate } = renderModal();
    fireEvent.change(timeInputs(view)[0], { target: { value: '23:30' } });
    fireEvent.change(startDate, { target: { value: '2026-10-05' } });
    expect(endDate.value).toBe('2026-10-06');
    expect(timeInputs(view)[1].value).toBe('00:30');
  });

  it('gives times when "all day" is turned off after picking a date', async () => {
    const { onSave, view, startDate } = renderModal();
    const allDay = view.container.querySelector('#allDay') as HTMLInputElement;
    fireEvent.click(allDay);
    fireEvent.change(startDate, { target: { value: '2026-10-05' } });
    fireEvent.click(allDay);
    const [start, end] = timeInputs(view);
    expect(start.value).toMatch(/^\d{2}:\d{2}$/);
    expect(end.value).toMatch(/^\d{2}:\d{2}$/);
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0][0] as Partial<CalendarEvent>).start).toMatch(/^2026-10-05T\d{2}:\d{2}:00$/);
  });

  it('gives times when the end date was picked first', () => {
    const { view, startDate, endDate } = renderModal();
    fireEvent.change(endDate, { target: { value: '2026-10-07' } });
    fireEvent.change(startDate, { target: { value: '2026-10-05' } });
    const [start, end] = timeInputs(view);
    expect(start.value).toMatch(/^\d{2}:\d{2}$/);
    expect(end.value).toMatch(/^\d{2}:\d{2}$/);
    expect(endDate.value).toBe('2026-10-07');
  });

  it('cannot be saved without a start time', () => {
    const { view, startDate } = renderModal();
    fireEvent.change(startDate, { target: { value: '2026-10-05' } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.change(timeInputs(view)[0], { target: { value: '' } });
    expect(saveButton().disabled).toBe(true);
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
