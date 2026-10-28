import { computeAvailableSlots } from '@/lib/booking/windows';
import {
  createInMemoryDispatcherState,
  processOutboxBatchInMemory,
  OUTBOX_PRIORITY,
} from '@/lib/bot/telegramOutbox';
import { bot } from '@/lib/bot/telegramBot';
import { staffBot } from '@/lib/bot/staffBot';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    availabilityException: { findUnique: jest.fn().mockResolvedValue(null) },
    weeklyHours: {
      findFirst: jest.fn().mockResolvedValue({
        startMin: 9 * 60,
        endMin: 20 * 60,
        breakStartMin: 13 * 60,
        breakEndMin: 14 * 60,
      }),
    },
    slotReservation: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

describe('Performance & Memory Ceiling Benchmark (NFR-401 profile, T-119 lineage)', () => {
  it('computes 7-day availability for a 150-min service block with p95 latency recorded < 50ms and keeps RSS <= 500 MB under combined load', async () => {
    const now = new Date('2026-10-20T08:00:00Z');
    const days = [
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ];

    const durationsSamplesMs: number[] = [];

    // NFR-401 availability-load profile: 100 iterations of a 7-day window
    // for a 5-service cart (150 min contiguous block)
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      for (const dateStr of days) {
        await computeAvailableSlots({
          dateStr,
          durationMin: 150, // 5 services
          fulfillmentMode: 'IN_CALL',
          slotGridStepMin: 30,
          minNoticeMin: 60,
          now,
          resourceId: 'default_master',
        });
      }
      const elapsed = performance.now() - t0;
      durationsSamplesMs.push(elapsed);
    }

    durationsSamplesMs.sort((a, b) => a - b);
    const p95Ms = durationsSamplesMs[Math.floor(durationsSamplesMs.length * 0.95)];

    // NFR-401: p95 < 50ms for 7-day availability computation (mocked persistence layer)
    expect(p95Ms).toBeLessThan(50);

    // Combined load: both bots initialized + 100 outbox items drained
    expect(bot).toBeDefined();
    expect(staffBot).toBeDefined();

    const outboxState = createInMemoryDispatcherState();
    for (let i = 0; i < 100; i++) {
      outboxState.items.push({
        id: `perf_msg_${i}`,
        botProfile: i % 2 === 0 ? 'STAFF_BOT' : 'CLIENT_BOT',
        chatId: `-10099${i}`,
        priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
        dedupeKey: `perf_dk_${i}`,
        createdAt: now,
        nextAttemptAt: now,
        attemptCount: 0,
        status: 'PENDING',
        payloadJson: {
          action: 'sendMessage',
          chatId: `-10099${i}`,
          text: `Load test message #${i}`,
        },
      });
    }

    const drainRes = await processOutboxBatchInMemory(outboxState, async () => {}, now);
    expect(drainRes.sent).toBe(100);

    const rssBytes = process.memoryUsage().rss;
    const rssMb = rssBytes / (1024 * 1024);

    // NFR-003 / business-plan: Memory ceiling <= 500 MB RAM
    expect(rssMb).toBeLessThanOrEqual(500);
  });
});
