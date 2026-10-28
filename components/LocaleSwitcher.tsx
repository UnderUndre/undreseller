'use client';

/**
 * Locale switcher (T040, FR-411/412): Single-button dropdown picklist for web chrome.
 * Conforms to ai-design-skills (no flags, no emojis, clean SVGs, active checkmark,
 * keyboard accessible, click-outside handling).
 */

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition, useRef, useEffect } from 'react';
import { I18N_LOCALES } from '@/lib/i18n/config';

const LOCALE_METADATA: Record<string, { code: string; native: string }> = {
  ru: { code: 'RU', native: 'Русский' },
  en: { code: 'EN', native: 'English' },
  uk: { code: 'UK', native: 'Українська' },
};

export function LocaleSwitcher() {
  const t = useTranslations('web.localeSwitcher');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function switchTo(next: string) {
    if (next === current || busy) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/preferences/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef} data-testid="locale-switcher">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy || pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('label')}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-base-300 bg-base-200/70 hover:bg-base-200 text-xs font-semibold text-base-content/80 hover:text-base-content transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
      >
        <svg
          className="w-3.5 h-3.5 text-base-content/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a15.3 15.3 0 01-4-10 15.3 15.3 0 014-10 15.3 15.3 0 014 10 15.3 15.3 0 01-4 10zM3.6 9h16.8M3.6 15h16.8"
          />
        </svg>
        <span>{current === 'ru' ? t('ru') : t('en')}</span>
        <svg
          className={`w-3 h-3 text-base-content/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('label')}
          className="absolute right-0 mt-1.5 w-36 rounded-xl bg-base-100 border border-base-300 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          {I18N_LOCALES.map((l) => {
            const isSelected = current === l;
            const meta = LOCALE_METADATA[l] || { code: l.toUpperCase(), native: l };
            return (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => void switchTo(l)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-purple-500/10 text-purple-400 font-semibold'
                    : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
                }`}
              >
                <span>{meta.native}</span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
