import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { ClaimWaitlistClient } from '@/components/booking/ClaimWaitlistClient'

import configPromise from '@payload-config'

import { computeClaimToken } from '@/lib/waitlist/claimToken'

/**
 * Claim page (spec 006 US3, T622): shows the freed slot explicitly; the
 * Confirm button posts to the claim endpoint (review F9 — no auto-book on
 * view; 409 renders an honest refusal). Scanner-safe: GET never mutates.
 */
function campaignExpired(activeCampaignAt: string): boolean {
  // Campaign TTL canon: 30 minutes (waitlistService CAMPAIGN_TTL_MIN).
  return Date.now() - new Date(activeCampaignAt).getTime() > 30 * 60 * 1000
}

export default async function WaitlistClaimPage(props: {
  searchParams: Promise<{ entry?: string; token?: string }>
}) {
  const { entry = '', token = '' } = await props.searchParams
  if (!entry || !token) return <p>Invalid link: entry and token are required.</p>

  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT w.status, w.campaign_count, w.active_campaign_at,
                    w.notified_slot_start, w.notified_slot_end,
                    p.title AS service_title
             FROM waitlist_entries w
             LEFT JOIN products p ON p.id::text = w.service_id::text
             WHERE w.id = ${entry} LIMIT 1`,
  })
  const row = res.rows?.[0] as
    | {
        status: string
        campaign_count: number
        active_campaign_at: string | null
        notified_slot_start: string | null
        notified_slot_end: string | null
        service_title: string | null
      }
    | undefined

  if (!row) return <p>Запись в листе ожидания не найдена.</p>
  if (!row.notified_slot_start || !row.notified_slot_end || !row.active_campaign_at) {
    return <p>Активной кампании нет — ссылка недействительна.</p>
  }
  if (row.status === 'converted') return <p>Слот уже закреплён за вами.</p>
  if (row.status !== 'notified') return <p>Эта ссылка больше не действует.</p>
  if (campaignExpired(row.active_campaign_at)) {
    return <p>Срок ссылки истёк — следите за следующими уведомлениями.</p>
  }

  return (
    <div>
      <h1>Освободился слот</h1>
      <p>
        <strong>{row.service_title ?? 'Запись'}</strong>
        <br />
        {new Date(row.notified_slot_start).toLocaleString()} — {new Date(row.notified_slot_end).toLocaleTimeString()}
      </p>
      <ClaimWaitlistClient entryId={entry} token={token} />
    </div>
  )
}

