import type { Access } from 'payload'

import { hasMinimumRole } from '@/access/roles'

export const adminOrCustomerOwner: Access = ({ req: { user } }) => {
  if (user && hasMinimumRole(user?.roles, 'OWNER')) {
    return true
  }

  if (user?.id) {
    return {
      customer: {
        equals: user.id,
      },
    }
  }

  return false
}
