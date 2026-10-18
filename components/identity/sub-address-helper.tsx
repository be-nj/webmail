'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Tag, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIdentityStore } from '@/stores/identity-store';
import { useSettingsStore } from '@/stores/settings-store';
import {
  generateSubAddress,
  extractDomain,
  suggestTagsForDomain,
  getTagValidationError,
  MAX_TAG_LENGTH,
} from '@/lib/sub-addressing';
import { getLocalPartValidationError } from '@/lib/catch-all-sender';

interface SubAddressHelperProps {
  baseEmail: string;
  recipientEmails: string[];
  onSelectTag: (tag: string) => void;
  /** Domains whose catch-all reaches the account; empty hides that tab. */
  catchAllDomains?: string[];
  /** Catch-all addresses sent from lately, newest first. */
  recentCatchAllAddresses?: string[];
  onSelectAddress?: (email: string) => void;
  disabled?: boolean;
}

type HelperMode = 'tag' | 'catch_all';

export function SubAddressHelper({
  baseEmail,
  recipientEmails,
  onSelectTag,
  catchAllDomains = [],
  recentCatchAllAddresses = [],
  onSelectAddress,
  disabled = false,
}: SubAddressHelperProps) {
  const t = useTranslations('identities.sub_address');
  const [isOpen, setIsOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const catchAllAvailable = catchAllDomains.length > 0 && !!onSelectAddress;
  const [mode, setMode] = useState<HelperMode>('tag');
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const showCatchAll = catchAllAvailable && mode === 'catch_all';
  // The base address's own domain when it is one of them, else the first.
  const baseDomain = baseEmail.split('@')[1]?.toLowerCase() ?? '';
  const effectiveDomain = catchAllDomains.includes(domain)
    ? domain
    : catchAllDomains.includes(baseDomain) ? baseDomain : (catchAllDomains[0] ?? '');

  const { subAddress, addRecentTag, addTagSuggestion } = useIdentityStore();
  const subAddressDelimiter = useSettingsStore((state) => state.subAddressDelimiter);

  // Get suggestions based on recipient (memoized for performance)
  const suggestions = useMemo(() => {
    return recipientEmails
      .map(extractDomain)
      .filter(Boolean)
      .flatMap((domain) => suggestTagsForDomain(domain!))
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .slice(0, 5);
  }, [recipientEmails]);

  // Generate preview
  const preview = showCatchAll
    ? `${localPart || '…'}@${effectiveDomain}`
    : tag ? generateSubAddress(baseEmail, tag, subAddressDelimiter) : baseEmail;

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleTagChange = (value: string) => {
    setTag(value);
    const errorCode = getTagValidationError(value);

    // Translate error code to localized message
    let errorMessage: string | null = null;
    if (errorCode === 'EMPTY') {
      errorMessage = t('validation.empty');
    } else if (errorCode === 'TOO_LONG') {
      errorMessage = t('validation.too_long', { max: MAX_TAG_LENGTH });
    } else if (errorCode === 'INVALID_CHARS') {
      errorMessage = t('validation.invalid_chars');
    }

    setError(errorMessage);
  };

  const handleSelectTag = (selectedTag: string) => {
    const errorCode = getTagValidationError(selectedTag);
    if (errorCode) {
      // Translate error code to localized message
      let errorMessage: string | null = null;
      if (errorCode === 'EMPTY') {
        errorMessage = t('validation.empty');
      } else if (errorCode === 'TOO_LONG') {
        errorMessage = t('validation.too_long', { max: MAX_TAG_LENGTH });
      } else if (errorCode === 'INVALID_CHARS') {
        errorMessage = t('validation.invalid_chars');
      }
      setError(errorMessage);
      return;
    }

    // Add to recent tags and suggestions
    addRecentTag(selectedTag);
    const domain = recipientEmails.map(extractDomain).find(Boolean);
    if (domain) {
      addTagSuggestion(domain, selectedTag);
    }

    onSelectTag(selectedTag);
    setIsOpen(false);
    setTag('');
    setError(null);
  };

  const localPartError = (value: string): string | null => {
    const code = getLocalPartValidationError(value);
    if (code === 'EMPTY') return t('validation.local_part_empty');
    if (code === 'TOO_LONG') return t('validation.local_part_too_long', { max: 64 });
    if (code === 'INVALID_CHARS') return t('validation.local_part_invalid');
    return null;
  };

  const handleLocalPartChange = (value: string) => {
    // A pasted full address splits into its two halves.
    const at = value.lastIndexOf('@');
    if (at >= 0) {
      const pastedDomain = value.slice(at + 1).trim().toLowerCase();
      if (catchAllDomains.includes(pastedDomain)) setDomain(pastedDomain);
      value = value.slice(0, at);
    }
    setLocalPart(value);
    setError(localPartError(value));
  };

  const selectAddress = (email: string) => {
    onSelectAddress?.(email.toLowerCase());
    setIsOpen(false);
    setLocalPart('');
    setError(null);
  };

  const handleUseAddress = () => {
    if (showCatchAll) {
      const problem = localPartError(localPart);
      if (problem) {
        setError(problem);
        return;
      }
      selectAddress(`${localPart}@${effectiveDomain}`);
      return;
    }
    if (!tag) return;
    handleSelectTag(tag);
  };

  const switchMode = (next: HelperMode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={t('button_tooltip')}
        className="h-8 px-2"
      >
        <Plus className="w-4 h-4 me-1" />
        <Tag className="w-4 h-4" />
      </Button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className={cn(
            'absolute top-full end-0 mt-1 z-50',
            'bg-background border border-border rounded-lg shadow-lg',
            'w-80 p-4 animate-in fade-in zoom-in-95 duration-150'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              {showCatchAll ? t('catch_all_title') : t('popover_title')}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {catchAllAvailable && (
            <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 p-0.5 rounded-md bg-muted text-xs">
              {(['tag', 'catch_all'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    'py-1 rounded transition-colors',
                    mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'tag' ? t('tab_tag') : t('tab_catch_all')}
                </button>
              ))}
            </div>
          )}

          {showCatchAll ? (
            <>
              <div className="mb-3">
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    value={localPart}
                    onChange={(e) => handleLocalPartChange(e.target.value)}
                    placeholder={t('local_part_placeholder')}
                    aria-label={t('local_part_placeholder')}
                    className={cn('flex-1 min-w-0', error && 'border-destructive')}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && localPart && !error) {
                        e.preventDefault();
                        handleUseAddress();
                      }
                    }}
                  />
                  <span className="text-sm text-muted-foreground">@</span>
                  {catchAllDomains.length > 1 ? (
                    <select
                      value={effectiveDomain}
                      onChange={(e) => setDomain(e.target.value)}
                      aria-label={t('domain_label')}
                      className="h-9 max-w-[45%] rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {catchAllDomains.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-foreground truncate">{effectiveDomain}</span>
                  )}
                </div>
                {error && (
                  <p className="text-xs text-destructive mt-1">{error}</p>
                )}
              </div>

              <div className="mb-3 p-2 bg-muted rounded text-sm">
                <div className="text-xs text-muted-foreground mb-1">
                  {t('preview_label')}
                </div>
                <div className="font-mono text-foreground break-all">
                  {preview}
                </div>
              </div>

              {recentCatchAllAddresses.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    {t('recent_addresses')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recentCatchAllAddresses.map((address) => (
                      <button
                        key={address}
                        type="button"
                        onClick={() => selectAddress(address)}
                        className="px-2 py-1 text-xs rounded bg-secondary hover:bg-accent text-foreground transition-colors font-mono"
                      >
                        {address}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    {t('suggested_tags')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleLocalPartChange(suggestion)}
                        className="px-2 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-3 text-xs text-muted-foreground">
                {t('catch_all_help')}
              </div>

              <Button
                onClick={handleUseAddress}
                disabled={!localPart || !!error}
                className="w-full"
                size="sm"
              >
                {t('use_address')}
              </Button>
            </>
          ) : (
            <>
              {/* Tag Input */}
              <div className="mb-3">
                <Input
                  type="text"
                  value={tag}
                  onChange={(e) => handleTagChange(e.target.value)}
                  placeholder={t('tag_input_placeholder')}
                  className={cn(error && 'border-destructive')}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tag && !error) {
                      e.preventDefault();
                      handleUseAddress();
                    }
                  }}
                />
                {error && (
                  <p className="text-xs text-destructive mt-1">{error}</p>
                )}
              </div>

              {/* Preview */}
              <div className="mb-3 p-2 bg-muted rounded text-sm">
                <div className="text-xs text-muted-foreground mb-1">
                  {t('preview_label')}
                </div>
                <div className="font-mono text-foreground break-all">
                  {preview}
                </div>
              </div>

              {/* Recent Tags */}
              {subAddress.recentTags.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    {t('recent_tags')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {subAddress.recentTags.slice(0, 5).map((recentTag) => (
                      <button
                        key={recentTag}
                        onClick={() => handleSelectTag(recentTag)}
                        className="px-2 py-1 text-xs rounded bg-secondary hover:bg-accent text-foreground transition-colors"
                      >
                        {recentTag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Tags */}
              {suggestions.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    {t('suggested_tags')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSelectTag(suggestion)}
                        className="px-2 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Help Text */}
              <div className="mb-3 text-xs text-muted-foreground">
                {t('help_text', { delimiter: subAddressDelimiter })}
              </div>

              {/* Use Address Button */}
              <Button
                onClick={handleUseAddress}
                disabled={!tag || !!error}
                className="w-full"
                size="sm"
              >
                {t('use_address')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
