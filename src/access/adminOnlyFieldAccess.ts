import type { FieldAccess } from 'payload'

import { hasMinimumRole } from '@/access/roles'

export const adminOnlyFieldAccess: FieldAccess = ({ req: { user } }) => {
  if (user) return hasMinimumRole(user?.roles, 'OWNER')

  return false
}
