/**
 * Staff role hierarchy on Payload access control (spec 001-reinit US4, research D1).
 * Roles are stored as a hasMany set; access decisions use max-rank semantics:
 * `hasMinimumRole(roles, min) === (max(rank(r) for r in roles) >= rank(min))`.
 * The template role `admin` is collapsed into OWNER per business plan v2.5.0 §2.1
 * ("ровно 3 роли") — the first-user bootstrap hook assigns OWNER (Users collection hook).
 */

export type StaffRole = 'OWNER' | 'OPERATOR' | 'PERFORMER'
export type UserRole = StaffRole | 'customer'

export const ROLE_RANK: Record<UserRole, number> = {
  OWNER: 3,
  OPERATOR: 2,
  PERFORMER: 1,
  customer: 0,
}

/**
 * Max-hierarchy check over a role set. Unknown/stale role strings (e.g. legacy
 * 'admin' rows in an existing dev DB) rank -1 and never satisfy any minimum —
 * they must be migrated to OWNER manually (dev-only concern; production starts
 * on an empty database).
 */
export function hasMinimumRole(
  roles: readonly (string | undefined | null)[] | null | undefined,
  minimum: UserRole
): boolean {
  if (!roles || !Array.isArray(roles)) return false
  let maxRank = -1
  for (const role of roles) {
    if (role && role in ROLE_RANK) {
      const rank = ROLE_RANK[role as UserRole]
      if (rank > maxRank) maxRank = rank
    }
  }
  return maxRank >= ROLE_RANK[minimum]
}
