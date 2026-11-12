import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider, hasLocale } from 'next-intl'

import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { ensureStartsWith } from '@/utilities/ensureStartsWith'
import { Providers } from '@/providers'
import { InitTheme } from '@/providers/Theme/InitTheme'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import React from 'react'
import { locales, type Locale } from '@/i18n/request'
import './globals.css'

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(locales, locale)) {
    notFound()
  }

  return (
    <html
      lang={locale}
      className={[GeistSans.variable, GeistMono.variable].filter(Boolean).join(' ')}
      suppressHydrationWarning
    >
      <head>
        <noscript><style dangerouslySetInnerHTML={{ __html: 'html { opacity: 1 !important; }' }} /></noscript>
        <InitTheme />
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>
            <AdminBar />
            <LivePreviewListener />
            <Header />
            <main>{children}</main>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
