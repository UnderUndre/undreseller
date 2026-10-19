import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) {
    return false;
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedHash = signatureHeader.slice(7);
  const calculatedHash = createHmac('sha256', secret).update(rawBody).digest('hex');

  if (expectedHash.length !== calculatedHash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHash, 'utf-8'), Buffer.from(calculatedHash, 'utf-8'));
}
