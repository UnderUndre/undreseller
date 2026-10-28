'use client';

/**
 * Admin bottom navigation (T061, contract admin-content-uploads.md)
 * Mobile-first 4-tab nav: Catalog | Team | Waitlist | Settings.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const TABS = [
  { href: '/admin/catalog', key: 'catalog' },
  { href: '/admin/fields', key: 'fields' },
  { href: '/admin/team', key: 'team' },
  { href: '/admin/waitlist', key: 'waitlist' },
  { href: '/admin/settings', key: 'settings' },
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  // T040 (FR-411): admin chrome i18n via messages/admin namespace.
  const t = useTranslations('admin.nav');

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed bottom-0 inset-x-0 z-40 bg-base-100 border-t border-base-300 flex justify-around pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 text-center py-3 text-xs font-medium transition-colors ${
              active ? 'text-purple-400' : 'text-base-content/60 hover:text-base-content'
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
