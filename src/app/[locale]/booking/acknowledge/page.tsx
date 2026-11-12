import { AcknowledgeClient } from '@/components/booking/AcknowledgeClient'

/** Reminder acknowledgement landing (spec 003 US3): GET renders a static page
 * (scanner-safe); the CAS bump happens from the client POST on view. */
export default async function AcknowledgePage(props: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await props.searchParams
  if (!token) return <p>Invalid link: token is required.</p>
  return <AcknowledgeClient accessToken={token} />
}
