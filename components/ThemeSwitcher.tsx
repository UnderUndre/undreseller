'use client';

import { useState, useEffect, useRef } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync state from localStorage / DOM on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('undrlla_theme') as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setTheme(stored);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  function applyTheme(mode: ThemeMode) {
    setTheme(mode);
    setOpen(false);

    try {
      localStorage.setItem('undrlla_theme', mode);
    } catch {
      // Ignore
    }

    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.dataset.theme = 'undrlla-dark';
    } else {
      document.documentElement.dataset.theme = 'undrlla';
    }
  }

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function handleChange() {
      if (theme === 'system') {
        document.documentElement.dataset.theme = media.matches ? 'undrlla-dark' : 'undrlla';
      }
    }
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [theme]);

  // Click outside and Esc handling
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
    <div className="relative inline-block text-left" ref={dropdownRef} data-testid="theme-switcher">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Toggle theme"
        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-base-300 bg-base-200/70 hover:bg-base-200 text-base-content/80 hover:text-base-content transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
      >
        {theme === 'dark' ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        ) : theme === 'light' ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Theme selection"
          className="absolute right-0 mt-1.5 w-36 rounded-xl bg-base-100 border border-base-300 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          <button
            type="button"
            role="option"
            aria-selected={theme === 'light'}
            onClick={() => applyTheme('light')}
            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
              theme === 'light'
                ? 'bg-purple-500/10 text-purple-400 font-semibold'
                : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Light
            </span>
            {theme === 'light' && (
              <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          <button
            type="button"
            role="option"
            aria-selected={theme === 'dark'}
            onClick={() => applyTheme('dark')}
            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
              theme === 'dark'
                ? 'bg-purple-500/10 text-purple-400 font-semibold'
                : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              Dark
            </span>
            {theme === 'dark' && (
              <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          <button
            type="button"
            role="option"
            aria-selected={theme === 'system'}
            onClick={() => applyTheme('system')}
            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
              theme === 'system'
                ? 'bg-purple-500/10 text-purple-400 font-semibold'
                : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              System
            </span>
            {theme === 'system' && (
              <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
