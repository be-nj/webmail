import { describe, it, expect } from 'vitest';
import { senderTrustSignal } from '../sender-trust';
import type { AuthenticationResults } from '../jmap/types';

const trusted = new Set(['max.musterl@web.de']);
const isTrusted = (address: string) => trusted.has(address);
const message = (from: string, auth?: AuthenticationResults) => ({ from: [{ email: from }], authenticationResults: auth });
const pass: AuthenticationResults = { dmarc: { result: 'pass', domain: 'web.de' } };
const fail: AuthenticationResults = { dmarc: { result: 'fail', domain: 'web.de' } };

describe('senderTrustSignal', () => {
  it('is trusted for a trusted address that passed its check', () => {
    expect(senderTrustSignal(message('Max.Musterl@web.de', pass), isTrusted)).toBe('trusted');
  });

  it('is impersonated for a trusted address that failed its check', () => {
    expect(senderTrustSignal(message('max.musterl@web.de', fail), isTrusted)).toBe('impersonated');
    const spfOnly: AuthenticationResults = { spf: { result: 'fail' }, dkim: { result: 'none' as never } };
    expect(senderTrustSignal(message('max.musterl@web.de', spfOnly), isTrusted)).toBe('impersonated');
  });

  it('gives nothing to a look-alike address, however clean its check', () => {
    expect(senderTrustSignal(message('maxmusteri@web.de', pass), isTrusted)).toBeNull();
    expect(senderTrustSignal(message('MaxMusterI@web.de', pass), isTrusted)).toBeNull();
  });

  it('gives nothing without a verdict', () => {
    expect(senderTrustSignal(message('max.musterl@web.de'), isTrusted)).toBeNull();
    expect(senderTrustSignal(message('max.musterl@web.de', { dmarc: { result: 'none', domain: 'web.de' } }), isTrusted)).toBeNull();
  });

  it('gives nothing for a pass recorded for another domain', () => {
    expect(senderTrustSignal(message('max.musterl@web.de', { dmarc: { result: 'pass', domain: 'evil.example' } }), isTrusted)).toBeNull();
  });
});
