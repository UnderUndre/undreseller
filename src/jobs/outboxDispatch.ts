import type { Payload } from 'payload'

import { dispatchBatch } from '@/lib/telegram/outbox'

/**
 * Outbox dispatch job (spec 004 FR-408, research D2): runs every 30 seconds
 * (6-field cron, antigravity F6) and drains up to `batchSize` messages.
 */
export const outboxDispatchTask = {
  slug: 'outbox-dispatch',
  label: 'Telegram outbox dispatch — CTE SKIP LOCKED claim, batch ≤25 (spec 004 FR-401/408)',
  schedule: [{ cron: '*/30 * * * * *', queue: 'default' }],
  retries: 3,
  handler: async ({ req }: { req: { payload: Payload } }) => {
    const result = await dispatchBatch(req.payload, 25)
    return { output: result, state: 'succeeded' as const }
  },
}
