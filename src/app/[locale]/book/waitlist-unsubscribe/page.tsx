import { UnsubscribeClient } from '@/components/booking/UnsubscribeClient'

/** Unsubscribe landing (spec 006 FR-605): GET renders the confirm form —
 * scanner-safe (the DELETE mutation happens only from the explicit click). */
export default async function WaitlistUnsubscribePage(props: {
  searchParams: Promise<{ entry?: string; token?: string }>
}) {
  const { entry = '', token = '' } = await props.searchParams
  if (!entry || !token) return <p>Invalid link: entry and token are required.</p>
  return <UnsubscribeClient entryId={entry} token={token} />
}
