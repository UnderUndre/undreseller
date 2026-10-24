'use client';

/**
 * Admin bottom navigation (T061, contract admin-content-uploads.md)
 * Mobile-first 4-tab nav: Catalog | Team | Waitlist | Settings.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/catalog', label: 'Catalog' },
  { href: '/admin/fields', label: 'Fields' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/waitlist', label: 'Waitlist' },
  { href: '/admin/settings', label: 'Settings' },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="fixed bottom-0 inset-x-0 z-40 bg-gray-950 border-t border-gray-800 flex justify-around pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 text-center py-3 text-xs font-medium transition-colors ${
              active ? 'text-purple-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
