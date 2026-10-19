const DENYLIST_KEYS = new Set([
  'token',
  'bottoken',
  'bot_token',
  'admintoken',
  'admin_token',
  'initdata',
  'init_data',
  'secret',
  'password',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'signature',
  'x-nowpayments-sig',
  'x-hub-signature-256',
  'phone',
  'customerphone',
  'customer_phone',
  'email',
  'customeremail',
  'customer_email',
  'rawbody',
  'raw_body',
  'payload',
]);

function sanitizeValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
  for (const denied of DENYLIST_KEYS) {
    if (normalizedKey.includes(denied)) {
      return '[REDACTED]';
    }
  }

  if (typeof value === 'string') {
    // Basic regex checks for phone or email strings
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(value)) {
      return '[REDACTED_EMAIL]';
    }
    if (/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(value)) {
      return '[REDACTED_PHONE]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }

  if (value !== null && typeof value === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      sanitizedObj[k] = sanitizeValue(k, v);
    }
    return sanitizedObj;
  }

  return value;
}

export const logger = {
  info(event: string, fields?: Record<string, unknown>): void {
    const sanitized = fields ? (sanitizeValue('fields', fields) as Record<string, unknown>) : {};
    console.log(JSON.stringify({ level: 'INFO', event, timestamp: new Date().toISOString(), ...sanitized }));
  },

  warn(event: string, fields?: Record<string, unknown>): void {
    const sanitized = fields ? (sanitizeValue('fields', fields) as Record<string, unknown>) : {};
    console.warn(JSON.stringify({ level: 'WARN', event, timestamp: new Date().toISOString(), ...sanitized }));
  },

  error(event: string, fields?: Record<string, unknown>): void {
    const sanitized = fields ? (sanitizeValue('fields', fields) as Record<string, unknown>) : {};
    console.error(JSON.stringify({ level: 'ERROR', event, timestamp: new Date().toISOString(), ...sanitized }));
  },

  adminAction(action: string, method: string, targetId?: string, status = 200): void {
    console.log(
      `[ADMIN_ACTION] action=${action} method=${method} targetId=${targetId || 'none'} status=${status}`
    );
  },

  counter(name: 'inbox_send_fail' | 'hold_expired' | 'webhook_rejected'): void {
    console.log(`[COUNTER] name=${name} timestamp=${new Date().toISOString()}`);
  },
};
