'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * T053 / FR-418: Book CTA with tg:// deep link back into the bot.
 * Inside Telegram Mini App → `tg://resolve?domain=<bot>&startapp=<context>`;
 * plain web → normal /book navigation.
 */
export function TgDeepLinkBook({
  serviceId,
  performerSlug,
  children,
  className,
}: {
  serviceId: string;
  performerSlug: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [isTma, setIsTma] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    const tg = (
      window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string }; init?: () => void }; };
      }
    ).Telegram;
    const webApp = tg?.WebApp;
    if (webApp) {
      try {
        webApp.init?.();
      } catch {
        // non-fatal
      }
      setIsTma(true);
    }
    setBotUsername(process.env.NEXT_PUBLIC_BOT_USERNAME ?? null);
  }, []);

  if (isTma && botUsername) {
    const startapp = encodeURIComponent(`book:${serviceId}:${performerSlug}`);
    return (
      <a
        href={`tg://resolve?domain=${botUsername}&startapp=${startapp}`}
        className={className}
        data-testid="tg-deep-link-book"
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={`/book?serviceId=${serviceId}&performerSlug=${performerSlug}`} className={className}>
      {children}
    </Link>
  );
}
