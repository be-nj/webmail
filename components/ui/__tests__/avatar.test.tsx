import { render, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Avatar } from '../avatar';
import { useSettingsStore } from '@/stores/settings-store';

describe('Avatar', () => {
  it('renders initials from full name', () => {
    const { container } = render(<Avatar name="Alice Smith" />);
    expect(container.textContent).toBe('AS');
  });

  it('renders two letters from single-word name', () => {
    const { container } = render(<Avatar name="Alice" />);
    expect(container.textContent).toBe('AL');
  });

  it('renders single letter from email when no name', () => {
    const { container } = render(<Avatar email="bob@example.com" />);
    expect(container.textContent).toBe('B');
  });

  it('renders "?" when no name or email', () => {
    const { container } = render(<Avatar />);
    expect(container.textContent).toBe('?');
  });

  it('produces consistent background color for same input', () => {
    const { container: a } = render(<Avatar name="Alice" />);
    const { container: b } = render(<Avatar name="Alice" />);
    const colorA = (a.firstChild as HTMLElement).style.backgroundColor;
    const colorB = (b.firstChild as HTMLElement).style.backgroundColor;
    expect(colorA).toBe(colorB);
  });
});

describe('Avatar Brand Logo', () => {
  const imgSrc = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src') ?? null;
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const bimiCalls = () =>
    (fetchSpy.mock.calls as unknown[][]).map((call) => String(call[0])).filter((url) => url.includes('/api/bimi'));

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const domain = new URL(String(input), 'http://x').searchParams.get('domain');
      const body = domain?.startsWith('none.')
        ? { svg: null, verified: false }
        : { svg: LOGO, verified: !domain?.startsWith('plain.') };
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('uses the Brand Logo when the message passed DMARC, without a badge', async () => {
    const { container } = render(<Avatar name="Brand" email="news@mail.brand.example" dmarcPass />);
    await waitFor(() => expect(imgSrc(container)).toMatch(/^data:image\/svg\+xml/));
    expect(bimiCalls()).toEqual([expect.stringContaining('/api/bimi?domain=mail.brand.example')]);
    expect(container.querySelector('[data-testid="trusted-mark"]')).toBeNull();
  });

  it('never asks without a DMARC pass, and never shows a favicon', () => {
    const { container } = render(<Avatar name="Brand" email="news@mail.brand2.example" />);
    expect(imgSrc(container)).toBeNull();
    expect(container.textContent).toBe('BR');
    expect(bimiCalls()).toEqual([]);
  });

  it('falls back to initials when the domain has no verified mark', async () => {
    const { container } = render(<Avatar name="Shop" email="a@none.example" dmarcPass />);
    await waitFor(() => expect(bimiCalls()).toHaveLength(1));
    await waitFor(() => expect(container.textContent).toBe('SH'));
    expect(imgSrc(container)).toBeNull();
  });

  it('hides a certificate-less logo from a sender the reader does not trust', async () => {
    const { container } = render(<Avatar name="Shop" email="noreply@plain.example" dmarcPass />);
    await waitFor(() => expect(bimiCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(imgSrc(container)).toBeNull();
    expect(container.textContent).toBe('SH');
  });

  it('shows a certificate-less logo for a trusted sender', async () => {
    const { container } = render(<Avatar name="Shop" email="noreply@plain2.example" dmarcPass senderTrust="trusted" />);
    await waitFor(() => expect(imgSrc(container)).toMatch(/^data:image\/svg\+xml/));
  });

  it.each(['someone@gmail.com', 'max.musterl@web.de', 'a@mail.gmx.net', 'x@t-online.de'])(
    'never asks for a freemail domain (%s)',
    (address) => {
      render(<Avatar name="Someone" email={address} dmarcPass />);
      expect(bimiCalls()).toEqual([]);
    },
  );

  it('falls back to initials when the logo fails to draw', async () => {
    const { container } = render(<Avatar name="Brand" email="news@other.example" dmarcPass />);
    await waitFor(() => expect(imgSrc(container)).toMatch(/^data:/));
    fireEvent.error(container.querySelector('img')!);
    expect(imgSrc(container)).toBeNull();
    expect(container.textContent).toBe('BR');
  });

  it('respects the setting', () => {
    useSettingsStore.setState({ senderBimiLogos: false });
    try {
      render(<Avatar name="Brand" email="news@third.example" dmarcPass />);
      expect(bimiCalls()).toEqual([]);
    } finally {
      useSettingsStore.setState({ senderBimiLogos: true });
    }
  });
});

describe('Avatar sender trust badges', () => {
  it('shows the Trusted Mark for a trusted sender', () => {
    const { container } = render(<Avatar name="Max" email="max.musterl@web.de" senderTrust="trusted" senderTrustLabel="Trusted sender" />);
    const mark = container.querySelector('[data-testid="trusted-mark"]');
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute('title')).toBe('Trusted sender');
    expect(mark!.querySelector('.lucide-handshake')).not.toBeNull();
    expect(container.querySelector('[data-testid="impersonation-mark"]')).toBeNull();
  });

  it('shows the warning mark for an impersonated trusted sender', () => {
    const { container } = render(<Avatar name="Max" email="max.musterl@web.de" senderTrust="impersonated" />);
    expect(container.querySelector('[data-testid="impersonation-mark"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="trusted-mark"]')).toBeNull();
  });

  it('shows nothing without a signal', () => {
    const { container } = render(<Avatar name="Max" email="max.musterl@web.de" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
