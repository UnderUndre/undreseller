import type { Access } from 'payload'

import { hasMinimumRole } from '@/access/roles'

/**
 * The ID of the document matches that of the user or the user is OWNER.
 *
 * Useful to allow users to manage their own account, but not others.
 */
export const adminOrSelf: Access = ({ req: { user } }) => {
  if (user) {
    if (hasMinimumRole(user?.roles, 'OWNER')) {
      return true
    }

    return {
      id: {
        equals: user.id,
      },
    }
  }

  return false
}
