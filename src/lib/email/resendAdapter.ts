import { createHash, randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

/**
 * Resend REST adapter (spec 003 FR-305, research D3): pure `fetch`, 0 deps.
 * RESEND_API_KEY is validated LAZILY at send time (review F11) — a missing key
 * never breaks boot, tests, or `next build`; in prod it fails the send, which
 * the Payload Jobs retry policy (≤5, exponential backoff) then re-attempts.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FETCH_TIMEOUT_MS = 10_000

export class EmailError extends Error {
  constructor(
    public readonly code: 'NO_API_KEY' | 'SEND_FAILED',
    message: string,
  ) {
    super(message)
  }
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
}

export type FetchImpl = typeof fetch

/** Salted hash of the recipient (PII-redact canon INV-010) for the delivery log. */
export function recipientHash(email: string): string {
  const salt = process.env.PAYLOAD_SECRET ?? 'no-secret'
  return createHash('sha256').update(`${salt}:${email}`).digest('hex')
}

async function resolveFromEmail(payload: Payload): Promise<string> {
  if (process.env.RESEND_FROM_EMAIL) return process.env.RESEND_FROM_EMAIL
  try {
    const settings = await payload.findGlobal({ slug: 'shop-settings', depth: 0 })
    if (settings && typeof settings.fromEmail === 'string' && settings.fromEmail) {
      return settings.fromEmail
    }
  } catch {
    // global missing — fall through to the local default
  }
  return 'booking@undreseller.local'
}

export async function sendEmail(
  payload: Payload,
  message: EmailMessage,
  opts: { fetchImpl?: FetchImpl } = {},
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new EmailError('NO_API_KEY', 'RESEND_API_KEY is not set (lazy fail-closed)')
  }
  const from = await resolveFromEmail(payload)
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new EmailError('SEND_FAILED', `Resend responded ${res.status}`)
  }
  const body = (await res.json()) as { id?: string }
  return { id: body.id ?? randomUUID() }
}

/** Delivery-log write (best-effort — logging must never break the caller). */
export async function logDelivery(
  payload: Payload,
  entry: {
    kind: 'confirmation' | 'reminder' | 'waitlist' | 'intent' | 'waitlist-optin'
    status: 'sent' | 'failed'
    bookingId?: number
    email: string
    errorDetail?: string
  },
): Promise<void> {
  try {
    await payload.create({
      collection: 'email-delivery-log',
      data: {
        kind: entry.kind,
        status: entry.status,
        bookingId: entry.bookingId ?? null,
        recipientHash: recipientHash(entry.email),
        errorDetail: entry.errorDetail ?? null,
      },
      overrideAccess: true,
    })
  } catch (err: unknown) {
    payload.logger.error({ err, message: 'email-delivery-log write failed' })
  }
}
