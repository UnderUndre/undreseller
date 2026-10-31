/**
 * T012: FSM→GC decision table unit tests — every row of
 * contracts/gcal-adapter.md §2, pure logic (no mocks).
 */
import { mapFsmToGcAction, FsmTransitionInput } from '@/lib/integrations/gcalMapping';

const event = (over: Partial<NonNullable<FsmTransitionInput['event']>> = {}) => ({
  serviceTitle: 'Стрижка',
  orderNumber: 'ORD-0001',
  startsAtUtc: '2027-02-01T10:00:00.000Z',
  endsAtUtc: '2027-02-01T11:00:00.000Z',
  description: '+79990000000',
  resourceId: 'res-1',
  ...over,
});

describe('T012: mapFsmToGcAction — full decision table (contract §2)', () => {
  it('→ BOOKED first push → CREATE (meet only when flag enabled)', () => {
    const a = mapFsmToGcAction({ orderId: 'o1', toStatus: 'BOOKED', hadGcEvent: false, event: event() });
    expect(a).toMatchObject({ kind: 'CREATE', payload: { meet: false } });

    const b = mapFsmToGcAction({
      orderId: 'o1',
      toStatus: 'BOOKED',
      hadGcEvent: false,
      remoteMeetingEnabled: true,
      event: event(),
    });
    expect(b).toMatchObject({ kind: 'CREATE', payload: { meet: true } });
  });

  it('→ BOOKED replay → CREATE (upsert semantics, no duplicate action kind)', () => {
    const a = mapFsmToGcAction({ orderId: 'o1', toStatus: 'BOOKED', hadGcEvent: true, event: event() });
    expect(a.kind).toBe('CREATE');
  });

  it('→ BOOKED after transfer without live event → CREATE (re-push)', () => {
    const a = mapFsmToGcAction({
      orderId: 'o1',
      toStatus: 'BOOKED',
      hadGcEvent: false,
      rescheduled: true,
      event: event(),
    });
    expect(a.kind).toBe('CREATE');
  });

  it('reschedule (scheduleVersion ↑) with live event → PATCH time', () => {
    const a = mapFsmToGcAction({
      orderId: 'o1',
      toStatus: 'BOOKED',
      hadGcEvent: true,
      rescheduled: true,
      patch: { startsAtUtc: '2027-02-01T12:00:00.000Z', endsAtUtc: '2027-02-01T13:00:00.000Z' },
    });
    expect(a).toEqual({
      kind: 'PATCH',
      payload: { startsAtUtc: '2027-02-01T12:00:00.000Z', endsAtUtc: '2027-02-01T13:00:00.000Z' },
    });
  });

  it('→ CANCELLED with live event → DELETE', () => {
    const a = mapFsmToGcAction({ orderId: 'o1', toStatus: 'CANCELLED', hadGcEvent: true });
    expect(a).toEqual({ kind: 'DELETE', orderId: 'o1' });
  });

  it('→ CANCELLED without event → NOOP (no phantom delete)', () => {
    const a = mapFsmToGcAction({ orderId: 'o1', toStatus: 'CANCELLED', hadGcEvent: false });
    expect(a).toEqual({ kind: 'NOOP', reason: 'cancelled_without_event' });
  });

  it('reservation RELEASED with live event (PAID_REQUIRES_RESOLUTION collision) → DELETE', () => {
    const a = mapFsmToGcAction({
      orderId: 'o1',
      toStatus: 'RESERVATION_RELEASED',
      hadGcEvent: true,
      reservationReleased: true,
    });
    expect(a).toEqual({ kind: 'DELETE', orderId: 'o1' });
  });

  it('reservation RELEASED without event → NOOP', () => {
    const a = mapFsmToGcAction({
      orderId: 'o1',
      toStatus: 'RESERVATION_RELEASED',
      hadGcEvent: false,
      reservationReleased: true,
    });
    expect(a).toEqual({ kind: 'NOOP', reason: 'released_without_event' });
  });

  it.each(['UNDERPAID', 'PAYMENT_PENDING', 'PAYMENT_EXPIRED'] as const)(
    '%s → NOOP (push only on BOOKED)',
    (status) => {
      const a = mapFsmToGcAction({ orderId: 'o1', toStatus: status, hadGcEvent: false });
      expect(a).toMatchObject({ kind: 'NOOP' });
      expect((a as { reason: string }).reason).toContain(status);
    }
  );

  it('→ BOOKED without event payload → NOOP (defensive)', () => {
    const a = mapFsmToGcAction({ orderId: 'o1', toStatus: 'BOOKED', hadGcEvent: false });
    expect(a).toEqual({ kind: 'NOOP', reason: 'booked_without_payload' });
  });
});
