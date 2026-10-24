/**
 * Transactional Email Adapter (T015, FR-409 fallback readiness, research D5)
 * Provider-isolated SaaS adapter behind an interface — self-hosted SMTP is
 * blacklisted by the business plan. Recommended provider: Resend (HTTP API).
 * Zero-email-channel mode (no API key) = graceful degradation: adapter reports
 * NO_EMAIL_CHANNEL and the dispatcher surfaces it to staff (T032).
 */

import { logger } from '@/lib/telemetry/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  status: 'ACCEPTED' | 'FAILED' | 'NO_EMAIL_CHANNEL';
  providerRef?: string;
  errorCode?: string;
}

export interface EmailProvider {
  readonly id: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Resend HTTP API adapter. Depends only on fetch — no new runtime dependency. */
export class ResendEmailProvider implements EmailProvider {
  readonly id = 'RESEND';
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly apiBaseUrl: string;

  constructor(opts?: { apiKey?: string; fromAddress?: string; apiBaseUrl?: string }) {
    this.apiKey = opts?.apiKey || process.env.RESEND_API_KEY || '';
    this.fromAddress = opts?.fromAddress || process.env.EMAIL_FROM || 'noreply@localhost';
    this.apiBaseUrl = opts?.apiBaseUrl || 'https://api.resend.com';
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.configured) {
      logger.warn('[EMAIL_NO_CHANNEL]', { provider: this.id });
      return { status: 'NO_EMAIL_CHANNEL', errorCode: 'NO_API_KEY' };
    }

    const startedAt = Date.now();
    try {
      const res = await fetch(`${this.apiBaseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to,
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });

      if (!res.ok) {
        const errorCode = `HTTP_${res.status}`;
        logger.warn('[EMAIL_SEND_FAILED]', { provider: this.id, errorCode });
        return { status: 'FAILED', errorCode };
      }

      const body = (await res.json()) as { id?: string };
      return {
        status: 'ACCEPTED',
        providerRef: body.id,
        ...(process.env.NODE_ENV === 'test'
          ? { errorCode: `latencyMs=${Date.now() - startedAt}` }
          : {}),
      };
    } catch (err: unknown) {
      const errorCode = err instanceof Error ? err.message : 'UNKNOWN';
      logger.warn('[EMAIL_SEND_FAILED]', { provider: this.id, errorCode });
      return { status: 'FAILED', errorCode };
    }
  }
}

/** Registry: deployment config selects the provider (EMAIL_PROVIDER env). */
export function resolveEmailProvider(config?: string): EmailProvider {
  const id = config || process.env.EMAIL_PROVIDER || 'RESEND';
  if (id === 'RESEND') return new ResendEmailProvider();
  throw new Error(`Unknown email provider id: ${id}`);
}
