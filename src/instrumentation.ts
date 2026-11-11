/**
 * Next.js server instrumentation hook (spec 008 T840 / Antigravity F8):
 * register() is called once when the Next.js server starts up.
 * Validates single-instance invariant at runtime without crashing `next build`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertSingleInstance } = await import('@/lib/security/rateLimiter')
    assertSingleInstance()
  }
}
