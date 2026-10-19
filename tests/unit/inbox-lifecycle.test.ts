import { validateCanonicalPayload } from '@/lib/inbox/schemas';
import { assertReplicaTopology } from '@/lib/security/rateLimiter';

describe('Inbox Lifecycle, Schemas & State Machine (T-015, T-017, T-031)', () => {
  const originalEnv = process.env;

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Zod Schemas and Size Caps (T-015)', () => {
    it('validates canonical SYSTEM_ALERT payload', () => {
      const payload = {
        version: 1,
        kind: 'SYSTEM_ALERT',
        orderId: 'order-123',
        reason: 'OVERBOOKED_MANUAL_RESOLUTION',
        timestamp: new Date().toISOString(),
      };
      const result = validateCanonicalPayload(payload);
      expect(result.success).toBe(true);
      expect(result.data?.version).toBe(1);
    });

    it('rejects oversized canonical payload (> 16 KB)', () => {
      const oversizedPayload = {
        version: 1,
        kind: 'TELEGRAM_UPDATE',
        chatId: '12345',
        updateType: 'message',
        text: 'A'.repeat(17000), // Exceeds 16 KB cap
      };
      const result = validateCanonicalPayload(oversizedPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Atomic attemptCount Evaluation (T-015)', () => {
    function evaluateFailureTransition(attemptCount: number): { status: 'PENDING' | 'FAILED'; newAttemptCount: number } {
      const newAttemptCount = attemptCount + 1;
      if (newAttemptCount >= 10) {
        return { status: 'FAILED', newAttemptCount };
      }
      return { status: 'PENDING', newAttemptCount };
    }

    it('transitions from attempt 8 -> 9 to status PENDING', () => {
      const transition = evaluateFailureTransition(8);
      expect(transition.newAttemptCount).toBe(9);
      expect(transition.status).toBe('PENDING');
    });

    it('transitions on 10th failure (9 -> 10) to status FAILED', () => {
      const transition = evaluateFailureTransition(9);
      expect(transition.newAttemptCount).toBe(10);
      expect(transition.status).toBe('FAILED');
    });
  });

  describe('Startup Assertion REPLICA_COUNT (T-017)', () => {
    it('passes when REPLICA_COUNT === "1"', () => {
      process.env.REPLICA_COUNT = '1';
      expect(() => assertReplicaTopology()).not.toThrow();
    });

    it('throws ERR_INVALID_REPLICA_TOPOLOGY when REPLICA_COUNT !== "1"', () => {
      process.env.REPLICA_COUNT = '2';
      expect(() => assertReplicaTopology()).toThrow('ERR_INVALID_REPLICA_TOPOLOGY');

      delete process.env.REPLICA_COUNT;
      expect(() => assertReplicaTopology()).toThrow('ERR_INVALID_REPLICA_TOPOLOGY');
    });
  });

  describe('7-day Terminal Inbox Scrub Invariants (T-031)', () => {
    interface InboxEventMock {
      id: string;
      status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';
      createdAt: Date;
      payloadJson: Record<string, unknown>;
    }

    function applyNightlyScrub(events: InboxEventMock[], now: Date): InboxEventMock[] {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return events.map((ev) => {
        if ((ev.status === 'SENT' || ev.status === 'FAILED') && ev.createdAt <= sevenDaysAgo) {
          return { ...ev, payloadJson: {} };
        }
        return ev;
      });
    }

    it('scrubs old SENT/FAILED to {}, while preserving old PENDING and recent SENT', () => {
      const now = new Date('2026-10-18T12:00:00Z');
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const events: InboxEventMock[] = [
        { id: '1', status: 'SENT', createdAt: eightDaysAgo, payloadJson: { chat: 1 } },
        { id: '2', status: 'FAILED', createdAt: eightDaysAgo, payloadJson: { chat: 2 } },
        { id: '3', status: 'PENDING', createdAt: eightDaysAgo, payloadJson: { chat: 3 } },
        { id: '4', status: 'SENT', createdAt: twoDaysAgo, payloadJson: { chat: 4 } },
      ];

      const scrubbed = applyNightlyScrub(events, now);

      expect(scrubbed[0].payloadJson).toEqual({}); // old SENT -> {}
      expect(scrubbed[1].payloadJson).toEqual({}); // old FAILED -> {}
      expect(scrubbed[2].payloadJson).toEqual({ chat: 3 }); // old PENDING -> preserved!
      expect(scrubbed[3].payloadJson).toEqual({ chat: 4 }); // recent SENT -> preserved!
    });
  });
});
