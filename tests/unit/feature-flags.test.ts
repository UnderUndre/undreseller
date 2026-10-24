import {
  getReleaseReadinessFlags,
  RELEASE_READINESS_FLAG_ENV_MAP,
} from '@/lib/config/integrationProfile';

describe('Release Readiness Feature Flags & Killswitch (T016)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to safe/legacy values: all flags off when no env vars set', () => {
    const flags = getReleaseReadinessFlags();
    expect(flags).toEqual({
      fsmCutover: false,
      paymentProviderCutover: false,
      waitlistEnabled: false,
      i18nCutover: false,
      emailFallbackEnabled: false,
    });
  });

  it('cutover flags flip reads to the new paths when enabled', () => {
    process.env.RELEASE_READINESS_FLAG_ENV_MAP_fsmCutover = 'true'; // must NOT matter
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.fsmCutover] = 'true';
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.paymentProviderCutover] = 'true';
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.waitlistEnabled] = 'true';
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.i18nCutover] = 'true';
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.emailFallbackEnabled] = 'true';

    const flags = getReleaseReadinessFlags();
    expect(flags.fsmCutover).toBe(true);
    expect(flags.paymentProviderCutover).toBe(true);
    expect(flags.waitlistEnabled).toBe(true);
    expect(flags.i18nCutover).toBe(true);
    expect(flags.emailFallbackEnabled).toBe(true);
  });

  it('killswitch: env var "false"/absent restores legacy read paths without DDL', () => {
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.fsmCutover] = 'false';
    process.env[RELEASE_READINESS_FLAG_ENV_MAP.waitlistEnabled] = '0';
    const flags = getReleaseReadinessFlags();
    expect(flags.fsmCutover).toBe(false);
    expect(flags.waitlistEnabled).toBe(false);
  });

  it('killswitch is immediate: unsetting a previously-set flag reverts reads in the same process', () => {
    const envName = RELEASE_READINESS_FLAG_ENV_MAP.i18nCutover;
    process.env[envName] = 'true';
    expect(getReleaseReadinessFlags().i18nCutover).toBe(true);

    delete process.env[envName];
    expect(getReleaseReadinessFlags().i18nCutover).toBe(false);
  });
});
