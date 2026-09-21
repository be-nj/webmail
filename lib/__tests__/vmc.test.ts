import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIMI_KEY_PURPOSE, embeddedLogo, namesVouchedFor, parseCertificates, verifiedLogo } from '../vmc';
import { VMC_ROOTS_PEM } from '../vmc-roots';

// The fixtures are the marks DHL, Commerzbank and Lieferando published on
// 21.09.2026 (fetched from the a= URL of their BIMI records), plus the roots.
// Every check names its own clock: a mark is valid for about a year.
const pem = (name: string) => readFileSync(join(__dirname, 'fixtures/vmc', `${name}.pem`), 'utf8');
const roots = parseCertificates(VMC_ROOTS_PEM);
const DURING_VALIDITY = new Date('2026-09-21T00:00:00Z');
const leaf = (name: string) => parseCertificates(pem(name))[0];

describe('verifiedLogo', () => {
  it('ships the two roots, comments and all', () => {
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => r.subject)).toEqual(parseCertificates(pem('roots')).map((r) => r.subject));
  });

  it('proves the logo of a real DigiCert mark', () => {
    const svg = verifiedLogo(pem('dhl'), ['dhl.de'], roots, DURING_VALIDITY);
    expect(svg).not.toBeNull();
    expect(svg!.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
  });

  it('works for the GlobalSign chain layout too', () => {
    expect(verifiedLogo(pem('commerzbank'), ['commerzbank.de'], roots, DURING_VALIDITY)).not.toBeNull();
  });

  it('accepts the mark when the org domain is the one it names', () => {
    expect(verifiedLogo(pem('dhl'), ['mail.dhl.de', 'dhl.de'], roots, DURING_VALIDITY)).not.toBeNull();
  });

  it('proves nothing when the root is not ours (Entrust)', () => {
    expect(verifiedLogo(pem('lieferando'), ['lieferando.de'], roots, new Date('2025-06-01T00:00:00Z'))).toBeNull();
  });

  it('is only good for the names it lists', () => {
    expect(verifiedLogo(pem('dhl'), ['dh1-versand.de'], roots, DURING_VALIDITY)).toBeNull();
    expect(namesVouchedFor(leaf('dhl'))).toContain('dhl.de');
  });

  it('verifies nothing without roots of our own, even though the bundle carries one', () => {
    expect(parseCertificates(pem('dhl')).some((c) => c.subject === c.issuer)).toBe(true);
    expect(verifiedLogo(pem('dhl'), ['dhl.de'], [], DURING_VALIDITY)).toBeNull();
  });

  it('refuses an expired or not yet valid mark', () => {
    expect(verifiedLogo(pem('dhl'), ['dhl.de'], roots, new Date('2030-01-01T00:00:00Z'))).toBeNull();
    expect(verifiedLogo(pem('dhl'), ['dhl.de'], roots, new Date('2020-01-01T00:00:00Z'))).toBeNull();
  });

  it('reads a mark issued for message identification', () => {
    expect(leaf('dhl').keyUsage).toEqual([BIMI_KEY_PURPOSE]);
  });

  it('extracts the same logo the domain publishes at its l= URL', () => {
    expect(Buffer.byteLength(embeddedLogo(leaf('dhl'))!, 'utf8')).toBe(2706);
  });

  it('turns junk into nothing', () => {
    for (const junk of ['', 'not a certificate', '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----']) {
      expect(verifiedLogo(junk, ['dhl.de'], roots, DURING_VALIDITY)).toBeNull();
    }
    expect(parseCertificates('nonsense')).toEqual([]);
  });
});
