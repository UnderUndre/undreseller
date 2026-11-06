import type { FieldHook } from 'payload'

import type { User } from '@/payload-types'

// ensure the first user created is an OWNER
// 1. lookup a single user on create as succinctly as possible
// 2. if there are no users found, append `OWNER` to the roles array
// access control is already handled by this fields `access` property
// it ensures that only OWNERs can create and update the `roles` field
// (spec 001-reinit US4: template role `admin` collapsed into OWNER)
export const ensureFirstUserIsAdmin: FieldHook<User> = async ({ operation, req, value }) => {
  if (operation === 'create') {
    const users = await req.payload.find({ collection: 'users', depth: 0, limit: 0 })
    if (users.totalDocs === 0) {
      // if `OWNER` not in array of values, add it
      if (!(value || []).includes('OWNER')) {
        return [...(value || []), 'OWNER']
      }
    }
  }

  return value
}
