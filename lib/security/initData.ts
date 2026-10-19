import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ValidatedInitData {
  valid: boolean;
  error?: string;
  telegramUserId?: string;
  authDate?: number;
  user?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export function verifyTelegramInitData(rawInitData: string): ValidatedInitData {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { valid: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  if (!rawInitData || rawInitData.trim() === '') {
    return { valid: false, error: 'Empty initData' };
  }

  const urlParams = new URLSearchParams(rawInitData);
  const hash = urlParams.get('hash');
  if (!hash) {
    return { valid: false, error: 'Missing hash parameter in initData' };
  }

  urlParams.delete('hash');

  // Sort keys alphabetically
  const pairs: string[] = [];
  const sortedKeys = Array.from(urlParams.keys()).sort();
  for (const key of sortedKeys) {
    pairs.push(`${key}=${urlParams.get(key)}`);
  }
  const dataCheckString = pairs.join('\n');

  // secret_key = HMAC_SHA256("WebAppData", botToken)
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

  // expected_hash = HMAC_SHA256(secretKey, dataCheckString)
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Constant-time comparison
  if (hash.length !== expectedHash.length) {
    return { valid: false, error: 'Invalid HMAC signature' };
  }

  const isValid = timingSafeEqual(Buffer.from(hash, 'utf-8'), Buffer.from(expectedHash, 'utf-8'));
  if (!isValid) {
    return { valid: false, error: 'Invalid HMAC signature' };
  }

  // Verify auth_date
  const authDateStr = urlParams.get('auth_date');
  if (!authDateStr) {
    return { valid: false, error: 'Missing auth_date' };
  }

  const authDate = parseInt(authDateStr, 10);
  if (isNaN(authDate)) {
    return { valid: false, error: 'Malformed auth_date' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  // Clock skew tolerance: auth_date <= now + 60s
  if (authDate > nowSeconds + 60) {
    return { valid: false, error: 'auth_date is too far in the future (clock skew breach)' };
  }

  // Max age: now - auth_date <= 3600s
  if (nowSeconds - authDate > 3600) {
    return { valid: false, error: 'initData has expired (> 3600s)' };
  }

  // Extract user info
  let userObj: { id: number; first_name?: string; last_name?: string; username?: string } | undefined;
  const userParam = urlParams.get('user');
  if (userParam) {
    try {
      userObj = JSON.parse(userParam);
    } catch {
      // Ignored malformed user json
    }
  }

  return {
    valid: true,
    telegramUserId: userObj?.id ? String(userObj.id) : undefined,
    authDate,
    user: userObj,
  };
}
