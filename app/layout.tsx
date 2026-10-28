import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { TelegramProvider } from '@/components/tma/TelegramProvider';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { shopConfig } from '@/config/shop.config';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: shopConfig.brandName,
  description: shopConfig.tagline,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const tFooter = await getTranslations('web.footer');

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('undrlla_theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.dataset.theme='undrlla-dark';}else{document.documentElement.dataset.theme='undrlla';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} bg-base-100 text-base-content min-h-screen flex flex-col font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <TelegramProvider>
            <header className="border-b border-base-300 bg-base-100/80 backdrop-blur-md sticky top-0 z-50 transition-colors">
              <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link
                  href="/"
                  className="font-bold text-base sm:text-lg text-base-content tracking-tight flex items-center gap-2 hover:opacity-90 transition active:scale-[0.98]"
                >
                  <img
                    src="/favicon.ico"
                    alt={shopConfig.brandName}
                    className="w-5 h-5 rounded object-contain"
                  />
                  <span>{shopConfig.brandName}</span>
                </Link>
                <div className="flex items-center gap-2 sm:gap-3">
                  <ThemeSwitcher />
                  <LocaleSwitcher />
                </div>
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
