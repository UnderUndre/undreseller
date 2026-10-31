/**
 * Secret vault (T011): AES-256-GCM encrypt/decrypt on node:crypto.
 *
 * Stores OAuth refresh tokens and webhook secrets encrypted at rest
 * (NFR-603, PCI DSS Req 10 / ISO 27001). Format: `v1:<iv_b64>:<tag_b64>:<ct_b64>`
 * — versioned prefix for future key rotation. Key: `INTEGRATION_ENCRYPTION_KEY`
 * env (32 bytes base64). Zero third-party crypto dependencies (research D2).
 */

import crypto from 'node:crypto';

const FORMAT_VERSION = 'v1';
const IV_BYTES = 12; // GCM recommended nonce size
const KEY_BYTES = 32; // AES-256

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (base64), got ${key.length}`
    );
  }
  cachedKey = key;
  return key;
}

/** Encrypt plaintext into `v1:<iv>:<tag>:<ct>` (all base64). Throws on missing/short key. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

/** Decrypt `v1:<iv>:<tag>:<ct>`. Throws on missing key, wrong version, or tampered ciphertext (auth-tag mismatch). */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Invalid secret format: expected v1:<iv>:<tag>:<ct>');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

/** Reset the cached key (test hook only). */
export function resetSecretVaultCacheForTests(): void {
  cachedKey = null;
}
