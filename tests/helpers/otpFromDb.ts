import { createHmac } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Test helper for e2e / integration tests (spec 008 T850):
 * recovers the 6-digit OTP code for a given intent by matching against
 * the context-bound HMAC digest stored in `booking_intents`.
 * Zero modifications to production code; uses test-environment PAYLOAD_SECRET.
 */
export async function getOtpCodeFromDb(payload: Payload, intentId: string | number): Promise<string> {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is required to derive OTP')

  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT email, code_hash FROM booking_intents WHERE id = ${Number(intentId)} LIMIT 1`,
  })
  const row = res.rows?.[0] as { email: string; code_hash: string } | undefined
  if (!row) throw new Error(`Intent #${intentId} not found in booking_intents`)

  for (let n = 0; n < 1_000_000; n++) {
    const code = String(n).padStart(6, '0')
    const hmac = createHmac('sha256', secret).update(`otp:${intentId}:${row.email}:${code}`).digest('hex')
    if (hmac === row.code_hash) {
      return code
    }
  }
  throw new Error(`Failed to derive OTP code for intent #${intentId}`)
}
