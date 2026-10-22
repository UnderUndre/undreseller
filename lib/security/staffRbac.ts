/**
 * Static 3-Role Authorization Matrix (FR-325a, FR-325b)
 * Policy Guard: OWNER > OPERATOR > PERFORMER
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

export type StaffRole = 'OWNER' | 'OPERATOR' | 'PERFORMER';

export interface StaffActorContext {
  actorId: string; // StaffMember.id or "BREAK_GLASS_ADMIN_TOKEN"
  actorRole: StaffRole;
  displayName: string;
  resourceId?: string | null;
  sessionId?: string;
  isBreakGlass: boolean;
}

export const ROLE_RANK: Record<StaffRole, number> = {
  PERFORMER: 1,
  OPERATOR: 2,
  OWNER: 3,
};

/**
 * Checks whether an actor role satisfies the required minimum role rank.
 */
export function hasMinimumRole(actorRole: StaffRole, requiredRole: StaffRole): boolean {
  return ROLE_RANK[actorRole] >= ROLE_RANK[requiredRole];
}

/**
 * Asserts role requirement, throwing 403 Forbidden error if insufficient.
 */
export function assertStaffRole(
  actor: StaffActorContext,
  requiredRole: StaffRole
): void {
  if (!hasMinimumRole(actor.actorRole, requiredRole)) {
    const error = new Error(`Forbidden: requires role ${requiredRole}, actor has ${actor.actorRole}`);
    (error as any).statusCode = 403;
    throw error;
  }
}
