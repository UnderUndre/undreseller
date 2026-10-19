import { z } from 'zod';
import { InboxEventKind } from '@prisma/client';

export const RAW_BODY_CAP_BYTES = 64 * 1024; // 64 KB
export const CANONICAL_PAYLOAD_CAP_BYTES = 16 * 1024; // 16 KB
export const MAX_MESSAGE_TEXT_LENGTH = 2000;

export const telegramUpdatePayloadSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.literal(InboxEventKind.TELEGRAM_UPDATE),
  chatId: z.string().trim().min(1),
  updateType: z.string().trim().min(1),
  text: z.string().max(MAX_MESSAGE_TEXT_LENGTH).optional(),
});

export const whatsappMessagePayloadSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.literal(InboxEventKind.WHATSAPP_MESSAGE),
  messageId: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  text: z.string().max(MAX_MESSAGE_TEXT_LENGTH).optional(),
});

export const nowpaymentsWebhookPayloadSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.literal(InboxEventKind.NOWPAYMENTS_WEBHOOK),
  providerRef: z.string().trim().min(1),
  orderId: z.string().trim().min(1),
  paidAmount: z.number().positive(),
  quotedAmount: z.number().positive(),
  currency: z.string().trim().length(3).toUpperCase(),
});

export const systemAlertPayloadSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.literal(InboxEventKind.SYSTEM_ALERT),
  orderId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  timestamp: z.string().datetime(),
});

export const canonicalPayloadSchema = z.discriminatedUnion('kind', [
  telegramUpdatePayloadSchema,
  whatsappMessagePayloadSchema,
  nowpaymentsWebhookPayloadSchema,
  systemAlertPayloadSchema,
]);

export type CanonicalPayload = z.infer<typeof canonicalPayloadSchema>;

export function validateCanonicalPayload(data: unknown): {
  success: boolean;
  data?: CanonicalPayload;
  error?: string;
} {
  const result = canonicalPayloadSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.errors[0]?.message || 'Invalid payload schema' };
  }

  const jsonBytes = Buffer.byteLength(JSON.stringify(result.data), 'utf-8');
  if (jsonBytes > CANONICAL_PAYLOAD_CAP_BYTES) {
    return {
      success: false,
      error: `Canonical payload size (${jsonBytes} bytes) exceeds limit of ${CANONICAL_PAYLOAD_CAP_BYTES} bytes`,
    };
  }

  return { success: true, data: result.data };
}
