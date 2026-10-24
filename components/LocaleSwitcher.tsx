'use client';

/**
 * Locale switcher (T040, FR-411/412): ru/en toggle for the storefront chrome.
 * POSTs to /api/preferences/language (T043) which sets the NEXT_LOCALE cookie,
 * then refreshes so server components re-render in the new locale.
 */

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { I18N_LOCALES } from '@/lib/i18n/config';

const LOCALE_NAMES: Record<string, string> = {
  ru: 'ru',
  en: 'en',
};

export function LocaleSwitcher() {
  const t = useTranslations('web.localeSwitcher');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function switchTo(next: string) {
    if (next === current || busy) return;
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
    }
  }

  return (
    <div
      className="flex items-center gap-1 text-xs"
      role="group"
      aria-label={t('label')}
      data-testid="locale-switcher"
    >
      {I18N_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => void switchTo(l)}
          aria-pressed={current === l}
          disabled={busy || pending}
          className={`px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
            current === l
              ? 'bg-purple-600 border-purple-400 text-white'
              : 'bg-base-200 border-base-300 text-base-content/70 hover:text-base-content'
          }`}
        >
          {t(LOCALE_NAMES[l] === 'ru' ? 'ru' : 'en')}
        </button>
      ))}
    </div>
  );
}
