import { describe, it, expect } from 'vitest';
import { failsSenderCheck, senderTrustSignal } from '../sender-trust';
import { parseAuthenticationResults } from '../email-headers';
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
    expect(senderTrustSignal(message('max.musterl@web.de', { iprev: { result: 'pass' } }), isTrusted)).toBeNull();
  });

  it('gives nothing for a pass recorded for another domain', () => {
    expect(senderTrustSignal(message('max.musterl@web.de', { dmarc: { result: 'pass', domain: 'evil.example' } }), isTrusted)).toBeNull();
  });
});

describe('a trusted address that passes neither SPF nor DKIM', () => {
  // Stalwart reports dmarc=none when neither SPF nor DKIM passed, so the
  // DMARC verdict alone would call this message "no verdict".
  const forged = parseAuthenticationResults(
    'mx.example; spf=none smtp.mailfrom=www-data@web1.hoster.example; dkim=none; dmarc=none header.from=web.de policy.dmarc=none',
  );

  it('is impersonated, not merely without a verdict', () => {
    expect(senderTrustSignal(message('max.musterl@web.de', forged), isTrusted)).toBe('impersonated');
  });

  it('fails the sender check, so the address loses its trust', () => {
    expect(failsSenderCheck(message('max.musterl@web.de', forged))).toBe(true);
  });

  it('keeps trust when SPF or a DKIM signature passes', () => {
    const spfPass = parseAuthenticationResults('mx; spf=pass smtp.mailfrom=bounce.web.de; dmarc=none header.from=web.de');
    const dkimPass = parseAuthenticationResults('mx; spf=none smtp.mailfrom=x.example; dkim=pass header.d=esp.example; dmarc=none header.from=web.de');
    expect(failsSenderCheck(message('max.musterl@web.de', spfPass))).toBe(false);
    expect(failsSenderCheck(message('max.musterl@web.de', dkimPass))).toBe(false);
    expect(senderTrustSignal(message('max.musterl@web.de', spfPass), isTrusted)).toBeNull();
  });

  it('treats a bare dmarc=none, with no SPF or DKIM pass, the same way', () => {
    expect(senderTrustSignal(message('max.musterl@web.de', { dmarc: { result: 'none', domain: 'web.de' } }), isTrusted)).toBe('impersonated');
  });

  it('keeps trust on a message without Authentication-Results', () => {
    expect(failsSenderCheck(message('max.musterl@web.de'))).toBe(false);
  });
});
