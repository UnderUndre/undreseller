'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Mobile-first staff login page (T018, FR-427).
 * OWNER / OPERATOR / PERFORMER sign in against POST /api/auth/sign-in (T017);
 * on success the session cookie is set server-side and the user is redirected
 * to the 3-tab admin scaffold (/admin/catalog).
 */
export default function AdminLoginPage() {
  const router = useRouter();
  // T040 (FR-411): admin chrome i18n.
  const t = useTranslations('admin.login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLockedUntil(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setLockedUntil(Date.now() + (data.retryAfterSeconds ?? 900) * 1000);
        setErrorMsg(data.error ?? t('locked'));
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? t('failed'));
        return;
      }
      router.push('/admin/catalog');
    } catch {
      setErrorMsg(t('networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 bg-base-200/80 border border-base-300 rounded-2xl p-6"
      >
        <h1 className="text-xl font-bold text-base-content text-center">{t('title')}</h1>

        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={t('email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-base-300 bg-base-300 px-4 py-3 text-base-content text-base"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder={t('password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-base-300 bg-base-300 px-4 py-3 text-base-content text-base"
        />

        {errorMsg && (
          <p className="text-sm text-red-400" role="alert">
            {lockedUntil
              ? t('retryAfter', { error: errorMsg ?? '', time: new Date(lockedUntil).toLocaleTimeString() })
              : errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-3 font-semibold text-white text-base"
        >
          {loading ? t('signingIn') : t('signIn')}
        </button>
      </form>
    </main>
  );
}
