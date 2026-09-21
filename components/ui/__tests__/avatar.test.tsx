import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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

  it('uses the BIMI logo when the message passed DMARC', () => {
    const { container } = render(<Avatar name="Brand" email="news@mail.brand.example" dmarcPass />);
    expect(imgSrc(container)).toContain('/api/bimi?domain=mail.brand.example');
  });

  it('falls back to the favicon without a DMARC pass', () => {
    const { container } = render(<Avatar name="Brand" email="news@mail.brand.example" />);
    expect(imgSrc(container)).toContain('/api/favicon?domain=brand.example');
  });

  it('skips BIMI for personal mail domains', () => {
    const { container } = render(<Avatar name="Someone" email="someone@gmail.com" dmarcPass />);
    expect(imgSrc(container)).toBeNull();
  });

  it('falls through to the favicon when the logo fails to load', () => {
    const { container } = render(<Avatar name="Brand" email="news@other.example" dmarcPass />);
    fireEvent.error(container.querySelector('img')!);
    expect(imgSrc(container)).toContain('/api/favicon?domain=other.example');
  });

  it('respects the setting', () => {
    useSettingsStore.setState({ senderBimiLogos: false });
    try {
      const { container } = render(<Avatar name="Brand" email="news@third.example" dmarcPass />);
      expect(imgSrc(container)).toContain('/api/favicon');
    } finally {
      useSettingsStore.setState({ senderBimiLogos: true });
    }
  });
});
