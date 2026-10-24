import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { TelegramProvider } from '@/components/tma/TelegramProvider';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { shopConfig } from '@/config/shop.config';

export const metadata: Metadata = {
  title: shopConfig.brandName,
  description: shopConfig.tagline,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // T101 (US8-SC3): light theme is first-class — no forced dark class here.
  // The active theme resolves at runtime: TMA follows the Telegram client
  // theme (TelegramProvider, FR-417); plain browsers default to light.
  // T040 (FR-411): chrome i18n — locale + messages from the resolveLocale
  // chain (lib/i18n/request.ts); nav labels via getTranslations.
  const locale = await getLocale();
  const messages = await getMessages();
  const tNav = await getTranslations('web.nav');
  const tHeader = await getTranslations('web.header');
  const tFooter = await getTranslations('web.footer');

  return (
    <html lang={locale}>
      <body className="bg-base-100 text-base-content min-h-screen flex flex-col font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <TelegramProvider>
            <header className="border-b border-base-300 bg-base-200/60 backdrop-blur sticky top-0 z-50">
              <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link href="/" className="font-extrabold text-lg text-base-content tracking-tight flex items-center gap-2">
                  <span>🛡️</span>
                  <span>{shopConfig.brandName}</span>
                </Link>
                <nav className="text-sm font-medium flex items-center gap-4 text-base-content/80">
                  <Link href="/" className="hover:text-base-content transition">{tNav('catalog')}</Link>
                  <Link href="/book" className="hover:text-base-content transition">{tHeader('bookSlot')}</Link>
                  <LocaleSwitcher />
                </nav>
              </div>
            </header>
            <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
              {children}
            </main>
            <footer className="border-t border-base-300 py-6 text-center text-xs text-base-content/50">
              © {new Date().getFullYear()} {shopConfig.brandName}. {tFooter('poweredBy')}
            </footer>
          </TelegramProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
