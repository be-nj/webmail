import { describe, it, expect } from 'vitest';
import {
  CATCH_ALL_SENDER_RECENT_MS,
  getLocalPartValidationError,
  isCatchAllAddress,
  isDormantCatchAllSender,
  recentCatchAllSenders,
  withCatchAllSenderUse,
} from '../catch-all-sender';

describe('catch-all sender helpers', () => {
  it('checks the local part as a dot-atom', () => {
    expect(getLocalPartValidationError('')).toBe('EMPTY');
    expect(getLocalPartValidationError('a'.repeat(65))).toBe('TOO_LONG');
    expect(getLocalPartValidationError('firma')).toBeNull();
    expect(getLocalPartValidationError('first.last+tag')).toBeNull();
    expect(getLocalPartValidationError('.firma')).toBe('INVALID_CHARS');
    expect(getLocalPartValidationError('fir..ma')).toBe('INVALID_CHARS');
    expect(getLocalPartValidationError('fir ma')).toBe('INVALID_CHARS');
    expect(getLocalPartValidationError('a@b')).toBe('INVALID_CHARS');
  });

  it('matches the domain regardless of case', () => {
    expect(isCatchAllAddress('Firma@Benj.Email', ['benj.email'])).toBe(true);
    expect(isCatchAllAddress('b@benj.de', ['benj.email'])).toBe(false);
    expect(isCatchAllAddress('no-domain', ['benj.email'])).toBe(false);
  });

  it('hides only identities Bulwark created that went unused for a while', () => {
    const now = 10 * CATCH_ALL_SENDER_RECENT_MS;
    const senders = { 'old@benj.email': now - CATCH_ALL_SENDER_RECENT_MS - 1, 'new@benj.email': now - 1000 };
    expect(isDormantCatchAllSender('Old@benj.email', senders, now)).toBe(true);
    expect(isDormantCatchAllSender('new@benj.email', senders, now)).toBe(false);
    // Made by hand, so never recorded: always shown.
    expect(isDormantCatchAllSender('b@benj.de', senders, now)).toBe(false);
    expect(isDormantCatchAllSender('b@benj.de', undefined, now)).toBe(false);
  });

  it('records a use under the lowercased address', () => {
    expect(withCatchAllSenderUse({ 'a@benj.email': 1 }, ' Firma@Benj.Email ', 5)).toEqual({
      'a@benj.email': 1,
      'firma@benj.email': 5,
    });
  });

  it('lists the newest addresses on the given domains first', () => {
    const senders = { 'a@benj.email': 1, 'b@bmn.email': 3, 'c@benj.email': 2, 'd@gone.example': 9 };
    expect(recentCatchAllSenders(senders, ['benj.email', 'bmn.email'])).toEqual(['b@bmn.email', 'c@benj.email', 'a@benj.email']);
    expect(recentCatchAllSenders(senders, ['benj.email'], 1)).toEqual(['c@benj.email']);
  });
});
