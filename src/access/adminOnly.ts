import type { Access } from 'payload'

import { hasMinimumRole } from '@/access/roles'

// OWNER-only: the only role with access to the Payload admin panel (spec 001-reinit
// research D7). Template role `admin` collapsed into OWNER (business plan v2.5.0 §2.1).
export const adminOnly: Access = ({ req: { user } }) => {
  if (user) return hasMinimumRole(user?.roles, 'OWNER')

  return false
}
