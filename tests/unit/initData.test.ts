import { createHmac } from 'node:crypto';
import { verifyTelegramInitData } from '@/lib/security/initData';

function buildInitData(
  params: Record<string, string>,
  botToken = 'test_bot_token_12345'
): string {
  const pairs: string[] = [];
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    pairs.push(`${key}=${params[key]}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const searchParams = new URLSearchParams(params);
  searchParams.set('hash', hash);
  return searchParams.toString();
}

describe('verifyTelegramInitData', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TELEGRAM_BOT_TOKEN: 'test_bot_token_12345' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('validates a correct HMAC signature with fresh auth_date', () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = buildInitData({
      auth_date: String(now - 10),
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: JSON.stringify({ id: 987654321, first_name: 'Alex' }),
    });

    const result = verifyTelegramInitData(raw);
    expect(result.valid).toBe(true);
    expect(result.telegramUserId).toBe('987654321');
    expect(result.user?.first_name).toBe('Alex');
  });

  it('rejects tampered query parameters (bad HMAC)', () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = buildInitData({
      auth_date: String(now),
      user: JSON.stringify({ id: 11111 }),
    });

    // Tamper with user parameter
    const tampered = raw.replace('11111', '99999');
    const result = verifyTelegramInitData(tampered);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid HMAC signature/);
  });

  it('rejects expired initData (> 3600 seconds)', () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = buildInitData({
      auth_date: String(now - 3601),
      user: JSON.stringify({ id: 123 }),
    });

    const result = verifyTelegramInitData(raw);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/);
  });

  it('allows clock skew within +60 seconds', () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = buildInitData({
      auth_date: String(now + 30),
      user: JSON.stringify({ id: 123 }),
    });

    const result = verifyTelegramInitData(raw);
    expect(result.valid).toBe(true);
  });

  it('rejects clock skew exceeding +60 seconds', () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = buildInitData({
      auth_date: String(now + 65),
      user: JSON.stringify({ id: 123 }),
    });

    const result = verifyTelegramInitData(raw);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/clock skew/);
  });
});
