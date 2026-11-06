import type { Access } from 'payload'

import { hasMinimumRole } from '@/access/roles'

/**
 * Atomic access checker that verifies if the user has OWNER rank
 * (template role `admin` collapsed into OWNER, spec 001-reinit US4).
 *
 * @returns true if user is OWNER, false otherwise
 */
export const isAdmin: Access = ({ req }) => {
  if (req.user) {
    return hasMinimumRole(req.user?.roles, 'OWNER')
  }

  return false
}
