import type { FieldHook } from 'payload'

import type { User } from '@/payload-types'

import { bootstrapTokenMatches } from '@/access/bootstrapToken'

/**
 * OWNER bootstrap (spec 002-booking-domain US1, research D5, fail-closed канон):
 * the FIRST user becomes OWNER only when the create carries a valid
 * `X-Bootstrap-Token` header AND no OWNER exists yet. Access-control layer
 * (Users.access.create) already 403s tokenless creates on an empty instance —
 * this hook is the second lock on the same door.
 */
export const ensureFirstUserIsOwner: FieldHook<User> = async ({ operation, req, value }) => {
  if (operation !== 'create') return value

  const owners = await req.payload.count({
    collection: 'users',
    where: { roles: { contains: 'OWNER' } },
  })

  if (owners.totalDocs === 0) {
    const token = req.headers?.get?.('x-bootstrap-token') ?? null
    if (bootstrapTokenMatches(token)) {
      const current = (value || []) as NonNullable<User['roles']>
      return [...current.filter((r) => r !== 'OWNER'), 'OWNER']
    }
  }

  return value
}
