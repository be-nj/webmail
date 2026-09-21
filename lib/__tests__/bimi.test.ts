import { describe, it, expect } from 'vitest';
import { BIMI_MAX_SVG_BYTES, isPublicAddress, parseBimiRecord, validateBimiSvg } from '../bimi';

const svg = (inner = '<path d="M0 0h10v10H0z" fill="#f00"/>') =>
  new TextEncoder().encode(
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 10 10"><title>Brand</title>${inner}</svg>\n`,
  );

describe('parseBimiRecord', () => {
  it('reads the logo and evidence URLs', () => {
    expect(parseBimiRecord([['v=BIMI1; l=https://brand.example/logo.svg; a=https://brand.example/vmc.pem']]))
      .toEqual({ logoUrl: 'https://brand.example/logo.svg', evidenceUrl: 'https://brand.example/vmc.pem' });
  });

  it('joins a record split into several character-strings', () => {
    expect(parseBimiRecord([['v=BIMI1; l=https://brand.exa', 'mple/logo.svg;']]))
      .toEqual({ logoUrl: 'https://brand.example/logo.svg', evidenceUrl: undefined });
  });

  it('ignores TXT records that are not BIMI', () => {
    expect(parseBimiRecord([['google-site-verification=abc'], ['v=BIMI1; l=https://b.example/l.svg']])?.valueOf())
      .toEqual({ logoUrl: 'https://b.example/l.svg', evidenceUrl: undefined });
  });

  it('returns null when there is no record, so the caller tries the org domain', () => {
    expect(parseBimiRecord([])).toBeNull();
    expect(parseBimiRecord([['v=spf1 -all']])).toBeNull();
  });

  it('treats a declination record as declined', () => {
    expect(parseBimiRecord([['v=BIMI1; l=; a=;']])).toBe('declined');
    expect(parseBimiRecord([['v=BIMI1;']])).toBe('declined');
  });

  it('declines non-HTTPS logos and logos with credentials or odd ports', () => {
    expect(parseBimiRecord([['v=BIMI1; l=http://b.example/l.svg']])).toBe('declined');
    expect(parseBimiRecord([['v=BIMI1; l=https://u:p@b.example/l.svg']])).toBe('declined');
    expect(parseBimiRecord([['v=BIMI1; l=https://b.example:8443/l.svg']])).toBe('declined');
    expect(parseBimiRecord([['v=BIMI1; l=javascript:alert(1)']])).toBe('declined');
  });

  it('declines when there is more than one BIMI record', () => {
    expect(parseBimiRecord([
      ['v=BIMI1; l=https://a.example/l.svg'],
      ['v=BIMI1; l=https://b.example/l.svg'],
    ])).toBe('declined');
  });
});

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '151.101.1.69', '2a00:1450:4001:80b::200e'])('accepts %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.1',
    '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '2001:db8::1', '64:ff9b::a00:1', 'not-an-ip',
  ])('refuses %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('validateBimiSvg', () => {
  it('accepts a plain SVG Tiny PS logo', () => {
    expect(validateBimiSvg(svg())).toContain('<svg');
  });

  it('accepts same-document references', () => {
    expect(validateBimiSvg(svg('<defs><linearGradient id="g"/></defs><use xlink:href="#p"/><rect fill="url(#g)"/>'))).not.toBeNull();
  });

  it('accepts a DOCTYPE without internal subset', () => {
    const text = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(validateBimiSvg(new TextEncoder().encode(text))).not.toBeNull();
  });

  it.each([
    ['script', '<script>alert(1)</script>'],
    ['event handler', '<rect onload="alert(1)"/>'],
    ['foreignObject', '<foreignObject><div/></foreignObject>'],
    ['external href', '<use href="https://evil.example/x.svg#a"/>'],
    ['data href', '<a xlink:href="data:text/html,x"/>'],
    ['javascript href', '<a href="javascript:alert(1)"/>'],
    ['external url()', '<rect style="fill:url(https://evil.example/p)"/>'],
    ['raster image', '<image href="#x"/>'],
    ['animation', '<animate attributeName="href" to="https://evil.example"/>'],
    ['css import', '<style>@import "https://evil.example/a.css";</style>'],
  ])('refuses %s', (_, inner) => {
    expect(validateBimiSvg(svg(inner))).toBeNull();
  });

  it('refuses entity declarations', () => {
    const text = '<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>';
    expect(validateBimiSvg(new TextEncoder().encode(text))).toBeNull();
  });

  it('refuses documents that are not SVG', () => {
    expect(validateBimiSvg(new TextEncoder().encode('<html><body/></html>'))).toBeNull();
    expect(validateBimiSvg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(validateBimiSvg(new Uint8Array())).toBeNull();
  });

  it('refuses logos over the size cap', () => {
    const padding = '<!--' + 'x'.repeat(BIMI_MAX_SVG_BYTES) + '-->';
    expect(validateBimiSvg(svg(padding))).toBeNull();
  });
});
