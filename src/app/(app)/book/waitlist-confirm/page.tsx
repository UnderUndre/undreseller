import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { ConfirmOptinClient } from '@/components/booking/ConfirmOptinClient'

/**
 * Double-opt-in landing (spec 007 FR-704, review F9): scanner-safe — GET only
 * RENDERS; confirmation happens exclusively through the explicit POST button
 * below. Email scanners (SafeLinks) that pre-fetch the link can never activate
 * the subscription.
 */
export default async function WaitlistConfirmPage(props: {
  searchParams: Promise<{ entry?: string; token?: string }>
}) {
  const { entry = '', token = '' } = await props.searchParams
  if (!entry || !token) {
    return <p>Некорректная ссылка: нужны параметры entry и token.</p>
  }

  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT status FROM waitlist_entries WHERE id = ${entry} LIMIT 1`,
  })
  const row = res.rows?.[0] as { status: string } | undefined
  if (!row) return <p>Запись в листе ожидания не найдена.</p>
  if (row.status === 'waiting') {
    return (
      <div>
        <h1>Подписка уже подтверждена</h1>
        <p>Мы сообщим, когда появится свободный слот.</p>
      </div>
    )
  }
  if (row.status !== 'pending') {
    return <p>Эта ссылка больше не действует — оставьте заявку на брони заново.</p>
  }

  return (
    <div>
      <h1>Подтвердите подписку</h1>
      <p>Нажмите кнопку ниже, чтобы получать уведомления о свободных слотах.</p>
      <ConfirmOptinClient entryId={entry} token={token} />
    </div>
  )
}
