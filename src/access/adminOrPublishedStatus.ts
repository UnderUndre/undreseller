import type { Access } from 'payload'

import { hasMinimumRole } from '@/access/roles'

export const adminOrPublishedStatus: Access = ({ req: { user } }) => {
  if (user && hasMinimumRole(user?.roles, 'OWNER')) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
