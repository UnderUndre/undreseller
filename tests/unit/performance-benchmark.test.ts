import { computeContiguousAvailableSlots } from '@/lib/booking/windows';
import {
  createInMemoryDispatcherState,
  processOutboxBatchInMemory,
  OUTBOX_PRIORITY,
} from '@/lib/bot/telegramOutbox';
import { bot } from '@/lib/bot/telegramBot';
import { staffBot } from '@/lib/bot/staffBot';

describe('Performance & Memory Ceiling Benchmark (T-119, NFR-001, NFR-003)', () => {
  it('computes 7-day contiguous slots for a 5-service cart with p95 latency < 50ms and keeps RSS <= 500 MB under combined load', async () => {
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

    // 100 concurrent-style iterations of 7-day 5-service cart (150 min total) slot computation
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      for (const dateStr of days) {
        computeContiguousAvailableSlots({
          dateStr,
          totalDurationMin: 150, // 5 services
          slotGridStepMin: 30,
          minNoticeMin: 60,
          now,
          resourceId: 'default_master',
          workingHours: {
            startMin: 9 * 60,
            endMin: 20 * 60,
            breakStartMin: 13 * 60,
            breakEndMin: 14 * 60,
          },
          existingReservations: [
            {
              startTime: new Date(`${dateStr}T10:30:00.000Z`),
              endTime: new Date(`${dateStr}T12:00:00.000Z`),
            },
            {
              startTime: new Date(`${dateStr}T16:00:00.000Z`),
              endTime: new Date(`${dateStr}T17:30:00.000Z`),
            },
          ],
        });
      }
      const elapsed = performance.now() - t0;
      durationsSamplesMs.push(elapsed);
    }

    durationsSamplesMs.sort((a, b) => a - b);
    const p95Ms = durationsSamplesMs[Math.floor(durationsSamplesMs.length * 0.95)];

    // NFR-001: p95 < 50ms for 7-day 5-service cart calculation
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

    // NFR-003: Memory ceiling <= 500 MB RAM
    expect(rssMb).toBeLessThanOrEqual(500);
  });
});
