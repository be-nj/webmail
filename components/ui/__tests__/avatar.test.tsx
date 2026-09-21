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

describe('Avatar BIMI logo', () => {
  const imgSrc = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src') ?? null;
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const bimiCalls = () =>
    (fetchSpy.mock.calls as unknown[][]).map((call) => String(call[0])).filter((url) => url.includes('/api/bimi'));

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const domain = new URL(String(input), 'http://x').searchParams.get('domain');
      const body = domain?.startsWith('verified.')
        ? { svg: LOGO, verified: true }
        : domain?.startsWith('none.')
          ? { svg: null, verified: false }
          : { svg: LOGO, verified: false };
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('uses the BIMI logo when the message passed DMARC', async () => {
    const { container } = render(<Avatar name="Brand" email="news@mail.brand.example" dmarcPass />);
    await waitFor(() => expect(imgSrc(container)).toMatch(/^data:image\/svg\+xml/));
    expect(bimiCalls()).toEqual([expect.stringContaining('/api/bimi?domain=mail.brand.example')]);
    expect(container.querySelector('[data-testid="bimi-verified-mark"]')).toBeNull();
  });

  it('marks a logo that came out of a verified mark', async () => {
    const { container } = render(<Avatar name="Bank" email="info@verified.example" dmarcPass />);
    await waitFor(() => expect(container.querySelector('[data-testid="bimi-verified-mark"]')).not.toBeNull());
  });

  it('never asks without a DMARC pass', () => {
    const { container } = render(<Avatar name="Brand" email="news@mail.brand2.example" />);
    expect(imgSrc(container)).toContain('/api/favicon?domain=brand2.example');
    expect(bimiCalls()).toEqual([]);
  });

  it('falls back to the favicon when the domain has no logo', async () => {
    const { container } = render(<Avatar name="Shop" email="a@none.example" dmarcPass />);
    await waitFor(() => expect(imgSrc(container)).toContain('/api/favicon?domain=none.example'));
  });

  it('skips BIMI for personal mail domains', () => {
    render(<Avatar name="Someone" email="someone@gmail.com" dmarcPass />);
    expect(bimiCalls()).toEqual([]);
  });

  it('falls through to the favicon when the logo fails to draw', async () => {
    const { container } = render(<Avatar name="Brand" email="news@other.example" dmarcPass />);
    await waitFor(() => expect(imgSrc(container)).toMatch(/^data:/));
    fireEvent.error(container.querySelector('img')!);
    expect(imgSrc(container)).toContain('/api/favicon?domain=other.example');
  });

  it('respects the setting', () => {
    useSettingsStore.setState({ senderBimiLogos: false });
    try {
      const { container } = render(<Avatar name="Brand" email="news@third.example" dmarcPass />);
      expect(imgSrc(container)).toContain('/api/favicon');
      expect(bimiCalls()).toEqual([]);
    } finally {
      useSettingsStore.setState({ senderBimiLogos: true });
    }
  });
});
