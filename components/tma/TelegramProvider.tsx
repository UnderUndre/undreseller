'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: TelegramUser };
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number };
  HapticFeedback?: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
  };
}

interface TelegramContextValue {
  isTma: boolean;
  initDataRaw: string;
  user: TelegramUser | null;
  hapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
}

const TelegramContext = createContext<TelegramContextValue>({
  isTma: false,
  initDataRaw: '',
  user: null,
  hapticFeedback: {
    impactOccurred: () => {},
    notificationOccurred: () => {},
  },
});

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [isTma, setIsTma] = useState(false);
  const [initDataRaw, setInitDataRaw] = useState('');
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    if (tg && tg.initData) {
      setIsTma(true);
      setInitDataRaw(tg.initData);

      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }

      try {
        tg.ready();
        tg.expand();
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }

        const vh = tg.viewportStableHeight || window.innerHeight;
        document.documentElement.style.setProperty('--tg-viewport-stable-height', `${vh}px`);

        if (tg.safeAreaInset) {
          document.documentElement.style.setProperty(
            '--tg-safe-area-top',
            `${tg.safeAreaInset.top || 0}px`
          );
          document.documentElement.style.setProperty(
            '--tg-safe-area-bottom',
            `${tg.safeAreaInset.bottom || 0}px`
          );
        }
      } catch (err) {
        console.warn('[TelegramProvider] Error initializing TMA SDK:', err);
      }
    }
  }, []);

  const hapticFeedback = {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
      const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      tg?.HapticFeedback?.impactOccurred(style);
    },
    notificationOccurred: (type: 'error' | 'success' | 'warning') => {
      const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred(type);
    },
  };

  return (
    <TelegramContext.Provider value={{ isTma, initDataRaw, user, hapticFeedback }}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram() {
  return useContext(TelegramContext);
}
