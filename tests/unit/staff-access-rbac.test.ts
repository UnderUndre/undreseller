import { ROLE_RANK, hasMinimumRole, assertStaffRole, StaffActorContext } from '@/lib/security/staffRbac';
import { sanitizeMetadata } from '@/lib/security/staffAuth';

describe('Staff RBAC & Security Boundaries (T034, US5, FR-325a, FR-325b, INV-010)', () => {
  it('enforces fixed role hierarchy rank: OWNER (3) > OPERATOR (2) > PERFORMER (1)', () => {
    expect(ROLE_RANK.PERFORMER).toBe(1);
    expect(ROLE_RANK.OPERATOR).toBe(2);
    expect(ROLE_RANK.OWNER).toBe(3);

    expect(hasMinimumRole('OWNER', 'OPERATOR')).toBe(true);
    expect(hasMinimumRole('OWNER', 'PERFORMER')).toBe(true);
    expect(hasMinimumRole('OPERATOR', 'PERFORMER')).toBe(true);

    expect(hasMinimumRole('PERFORMER', 'OPERATOR')).toBe(false);
    expect(hasMinimumRole('PERFORMER', 'OWNER')).toBe(false);
    expect(hasMinimumRole('OPERATOR', 'OWNER')).toBe(false);
  });

  it('assertStaffRole throws 403 Forbidden when role is insufficient', () => {
    const performerActor: StaffActorContext = {
      actorId: 'perf-1',
      actorRole: 'PERFORMER',
      displayName: 'Performer 1',
      isBreakGlass: false,
    };

    expect(() => assertStaffRole(performerActor, 'PERFORMER')).not.toThrow();
    expect(() => assertStaffRole(performerActor, 'OPERATOR')).toThrow('Forbidden');
    expect(() => assertStaffRole(performerActor, 'OWNER')).toThrow('Forbidden');
  });

  it('strictly sanitizes customer PII and credentials from AuditEvent metadata (INV-010)', () => {
    const rawMetadata = {
      orderId: 'ord-123',
      customerPhone: '+37499123456',
      customerEmail: 'customer@example.com',
      serviceAddress: '123 Confidential St, Suite 4',
      initialPassword: 'secretPassword123!',
      cancellationToken: 'raw_32_byte_token_here',
      safeMetric: 42,
      nested: {
        token: 'should_be_redacted',
        action: 'SAFE_ACTION',
      },
    };

    const sanitized = sanitizeMetadata(rawMetadata);

    expect(sanitized.orderId).toBe('ord-123');
    expect(sanitized.safeMetric).toBe(42);
    expect(sanitized.customerPhone).toBe('[REDACTED]');
    expect(sanitized.customerEmail).toBe('[REDACTED]');
    expect(sanitized.serviceAddress).toBe('[REDACTED]');
    expect(sanitized.initialPassword).toBe('[REDACTED]');
    expect(sanitized.cancellationToken).toBe('[REDACTED]');
    expect(sanitized.nested.token).toBe('[REDACTED]');
    expect(sanitized.nested.action).toBe('SAFE_ACTION');
  });
});
