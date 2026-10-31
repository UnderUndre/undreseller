/**
 * T011: secret vault unit tests (AES-256-GCM, NFR-603).
 */

const ORIGINAL_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;

import {
  encryptSecret,
  decryptSecret,
  resetSecretVaultCacheForTests,
} from '@/lib/integrations/secretVault';

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = ORIGINAL_KEY;
  resetSecretVaultCacheForTests();
});

describe('T011: secretVault roundtrip and tamper detection', () => {
  beforeEach(() => resetSecretVaultCacheForTests());

  it('roundtrips plaintext (unicode, newlines, json payloads)', () => {
    const samples = [
      'simple-token',
      'ya29.a0Af-пример-unicode',
      '{"refreshToken":"1//abc","calendarId":"primary"}',
      'line1\nline2\r\n\t tabs',
    ];
    for (const s of samples) {
      expect(decryptSecret(encryptSecret(s))).toBe(s);
    }
  });

  it('emits v1:<iv>:<tag>:<ct> format with unique IV per call', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b); // random IV → different ciphertext for same plaintext
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });

  it('throws on tampered ciphertext (auth-tag mismatch)', () => {
    const encoded = encryptSecret('secret-value');
    const [v, iv, tag, ct] = encoded.split(':');
    const tampered = Buffer.from(ct, 'base64');
    tampered[0] ^= 0xff;
    const forged = [v, iv, tag, tampered.toString('base64')].join(':');
    expect(() => decryptSecret(forged)).toThrow();
  });

  it('throws on tampered tag', () => {
    const encoded = encryptSecret('secret-value');
    const [v, iv, tag, ct] = encoded.split(':');
    const tamperedTag = Buffer.from(tag, 'base64');
    tamperedTag[0] ^= 0xff;
    const forged = [v, iv, tamperedTag.toString('base64'), ct].join(':');
    expect(() => decryptSecret(forged)).toThrow();
  });

  it('throws on missing key', () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    resetSecretVaultCacheForTests();
    expect(() => encryptSecret('x')).toThrow('INTEGRATION_ENCRYPTION_KEY is not set');
  });

  it('throws on short key', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    resetSecretVaultCacheForTests();
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
  });

  it('throws on wrong format (plaintext passed as encoded)', () => {
    expect(() => decryptSecret('plaintext-not-encoded')).toThrow('Invalid secret format');
    expect(() => decryptSecret('v2:aaa:bbb:ccc')).toThrow('Invalid secret format');
  });
});
