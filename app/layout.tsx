import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { TelegramProvider } from '@/components/tma/TelegramProvider';
import { shopConfig } from '@/config/shop.config';

export const metadata: Metadata = {
  title: shopConfig.brandName,
  description: shopConfig.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-base-100 text-base-content min-h-screen flex flex-col font-sans antialiased">
        <TelegramProvider>
          <header className="border-b border-base-300 bg-base-200/60 backdrop-blur sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
              <Link href="/" className="font-extrabold text-lg text-base-content tracking-tight flex items-center gap-2">
                <span>🛡️</span>
                <span>{shopConfig.brandName}</span>
              </Link>
              <nav className="text-sm font-medium flex items-center gap-4 text-base-content/80">
                <Link href="/" className="hover:text-base-content transition">Catalog</Link>
                <Link href="/book" className="hover:text-base-content transition">Book Slot</Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="border-t border-base-300 py-6 text-center text-xs text-base-content/50">
            © {new Date().getFullYear()} {shopConfig.brandName}. Powered by Sovereign Commerce Stack.
          </footer>
        </TelegramProvider>
      </body>
    </html>
  );
}
