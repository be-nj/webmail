// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const resolveTxt = vi.fn();
vi.mock('node:dns/promises', () => ({
  Resolver: class { resolveTxt = resolveTxt; },
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const SVG = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 10 10"><title>Brand</title><path d="M0 0h10v10H0z" fill="#f00"/></svg>\n';

const ask = async (GET: (r: NextRequest) => Promise<Response>, domain: string, ip = '198.51.100.7') =>
  GET(new NextRequest(`https://webmail.example/api/bimi?domain=${domain}`, { headers: { 'x-forwarded-for': ip } }));

describe('/api/bimi', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    resolveTxt.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('falls back to the l= logo when the mark is gone for good (404)', async () => {
    const { GET } = await import('../route');
    resolveTxt.mockResolvedValue([['v=BIMI1; l=https://brand.example/logo.svg; a=https://brand.example/vmc.pem']]);
    fetchSpy.mockImplementation(async (input: string | URL | Request) => String(input).endsWith('.pem')
      ? new Response('gone', { status: 404 })
      : new Response(SVG, { headers: { 'Content-Type': 'image/svg+xml' } }));
    const body = await (await ask(GET, 'brand.example')).json();
    expect(body.verified).toBe(false);
    expect(body.svg).toContain('<svg');
  });

  it('limits the fresh lookups one client may start, but not cached answers', async () => {
    const { GET } = await import('../route');
    resolveTxt.mockResolvedValue([]);
    for (let i = 0; i < 300; i++) {
      expect((await ask(GET, `d${i}.example`)).status).toBe(200);
    }
    expect((await ask(GET, 'one-more.example')).status).toBe(429);
    // Already answered: served from the cache, no lookup to count.
    expect((await ask(GET, 'd1.example')).status).toBe(200);
    // Another client has its own allowance.
    expect((await ask(GET, 'one-more.example', '203.0.113.9')).status).toBe(200);
  });
});
