import { logger } from '@/lib/telemetry/logger';

export interface SendTemplateParams {
  toPhone: string;
  templateName: string;
  languageCode?: string;
}

export async function sendWhatsAppTemplate(params: SendTemplateParams): Promise<{ success: boolean; messageId?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    logger.warn('WhatsApp credentials unconfigured');
    return { success: false };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: params.toPhone,
    type: 'template',
    template: {
      name: params.templateName,
      language: {
        code: params.languageCode || 'en_US',
      },
    },
  };

  let attempt = 0;
  let delay = 500;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return { success: true, messageId: data.messages?.[0]?.id };
      }

      // Handle rate limit (429) or graph errors
      attempt++;
      const resBody = await res.json().catch(() => ({}));
      const errorCode = resBody?.error?.code || res.status;

      // SPEC REQUIREMENT: Graph error logs the code, not the phone
      logger.error('[WHATSAPP_GRAPH_ERROR]', { code: errorCode, attempt });

      if (attempt >= maxRetries) {
        return { success: false };
      }

      const retryAfterSec = res.headers.get('retry-after');
      const waitMs = retryAfterSec ? parseInt(retryAfterSec, 10) * 1000 : delay;
      await new Promise((r) => setTimeout(r, waitMs));
      delay *= 2;
    } catch (err: unknown) {
      attempt++;
      logger.error('[WHATSAPP_NETWORK_ERROR]', { error: String(err), attempt });
      if (attempt >= maxRetries) {
        return { success: false };
      }
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }

  return { success: false };
}
