import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  computeBackfillRow,
  detectResourceOverlapCollisions,
} from '@/scripts/backfill-slot-reservations';
import { runMigrations } from '@/scripts/migrate';

describe('PostgreSQL GiST Exclusion, 4-Stage Expand/Contract & Restored-v1 Backfill (T-102, T-116)', () => {
  const migrationsRoot = path.join(process.cwd(), 'prisma', 'migrations');

  it('enforces 4 distinct migration stages where full-table backfill and SET NOT NULL never share a transaction', () => {
    const stage1 = fs.readFileSync(
      path.join(migrationsRoot, '20261019000000_multi_service_cart', 'migration.sql'),
      'utf-8'
    );
    const stage2 = fs.readFileSync(
      path.join(migrationsRoot, '20261019010000_multi_service_cart_backfill', 'migration.sql'),
      'utf-8'
    );
    const stage3 = fs.readFileSync(
      path.join(
        migrationsRoot,
        '20261019020000_multi_service_cart_validate_cutover',
        'migration.sql'
      ),
      'utf-8'
    );
    const stage4 = fs.readFileSync(
      path.join(migrationsRoot, '20261019030000_multi_service_cart_contract', 'migration.sql'),
      'utf-8'
    );

    // Every stage enforces statement_timeout = '5s' and lock_timeout = '2s'
    for (const sql of [stage1, stage2, stage3, stage4]) {
      expect(sql).toContain("SET statement_timeout = '5s'");
      expect(sql).toContain("SET lock_timeout = '2s'");
    }

    // Stage 1 (Expand) drops NOT NULL on itemId and adds nullable resourceId/totalDurationMin without backfilling
    expect(stage1).toContain('ALTER COLUMN "itemId" DROP NOT NULL');
    expect(stage1).not.toContain('UPDATE "SlotReservation"');

    // Stage 2 (Backfill) runs bounded batch UPDATE (LIMIT 500) and NEVER executes SET NOT NULL
    expect(stage2).toContain('LIMIT 500');
    expect(stage2).toContain('UPDATE "SlotReservation"');
    expect(stage2).not.toContain('SET NOT NULL');

    // Stage 3 (Validate & Cutover) runs r1.id < r2.id overlap preflight, CHECK ... NOT VALID, VALIDATE CONSTRAINT, and adds slot_resource_no_overlap
    expect(stage3).toContain('r1."id" < r2."id"');
    expect(stage3).toContain('NOT VALID');
    expect(stage3).toContain('VALIDATE CONSTRAINT slot_reservation_resource_id_not_null_chk');
    expect(stage3).toContain('ADD CONSTRAINT slot_resource_no_overlap');

    // Stage 4 (Contract) runs SET NOT NULL and drops legacy slot_no_overlap without full-table UPDATE
    expect(stage4).toContain('ALTER COLUMN "resourceId" SET NOT NULL');
    expect(stage4).toContain('ALTER COLUMN "totalDurationMin" SET NOT NULL');
    expect(stage4).toContain('DROP CONSTRAINT IF EXISTS slot_no_overlap');
    expect(stage4).not.toContain('UPDATE "SlotReservation"');

    // Verify safe down.sql exists for all 4 stages
    expect(
      fs.existsSync(path.join(migrationsRoot, '20261019000000_multi_service_cart', 'down.sql'))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(migrationsRoot, '20261019030000_multi_service_cart_contract', 'down.sql')
      )
    ).toBe(true);
  });

  it('normalizes and quarantines malformed or non-whole-minute intervals on restored-v1 data', () => {
    const normalRow = computeBackfillRow({
      id: 'res-1',
      resourceId: null,
      totalDurationMin: null,
      startTime: new Date('2026-10-20T10:00:00.000Z'),
      endTime: new Date('2026-10-20T11:15:00.000Z'),
      status: 'BOOKED',
    });
    expect(normalRow.resourceId).toBe('default_master');
    expect(normalRow.totalDurationMin).toBe(75);
    expect(normalRow.quarantineReason).toBeNull();

    const nonWholeMinRow = computeBackfillRow({
      id: 'res-odd',
      resourceId: null,
      totalDurationMin: null,
      startTime: new Date('2026-10-20T10:00:00.000Z'),
      endTime: new Date('2026-10-20T10:45:30.000Z'),
      status: 'BOOKED',
    });
    expect(nonWholeMinRow.quarantineReason).toBe('NON_WHOLE_MINUTE_INTERVAL');
    expect(nonWholeMinRow.totalDurationMin).toBe(46);

    const oversizedRow = computeBackfillRow({
      id: 'res-oversized',
      resourceId: 'master_2',
      totalDurationMin: 0,
      startTime: new Date('2026-10-20T08:00:00.000Z'),
      endTime: new Date('2026-10-20T18:00:00.000Z'), // 600 min
      status: 'HELD',
    });
    expect(oversizedRow.quarantineReason).toBe('EXCEEDS_MAX_DURATION_480M');
    expect(oversizedRow.totalDurationMin).toBe(480);
  });

  it('detects overlapping active reservations on the same resourceId (r1.id < r2.id) while allowing parallel bookings on different resources', () => {
    const collisions = detectResourceOverlapCollisions([
      {
        id: 'res-a',
        resourceId: 'master_1',
        startTime: new Date('2026-10-21T10:00:00Z'),
        endTime: new Date('2026-10-21T11:30:00Z'),
        status: 'BOOKED',
      },
      {
        id: 'res-b',
        resourceId: 'master_1',
        startTime: new Date('2026-10-21T11:00:00Z'),
        endTime: new Date('2026-10-21T12:00:00Z'),
        status: 'HELD',
      },
      {
        id: 'res-c',
        resourceId: 'master_2', // Different resource! Parallel same-time booking is allowed
        startTime: new Date('2026-10-21T10:00:00Z'),
        endTime: new Date('2026-10-21T11:30:00Z'),
        status: 'BOOKED',
      },
    ]);

    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toEqual({
      r1Id: 'res-a',
      r2Id: 'res-b',
      resourceId: 'master_1',
    });
  });

  it('retries DDL lock timeouts up to 5 attempts and triggers maintenance fallback when exhausted', () => {
    process.env.DIRECT_URL = 'postgresql://localhost:5432/test';
    let callCount = 0;

    // Succeeds on 3rd attempt
    const okRes = runMigrations(
      5,
      1,
      () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('55P03: lock timeout');
        }
      },
      () => {}
    );
    expect(okRes.success).toBe(true);
    expect(okRes.attempts).toBe(3);
    expect(okRes.maintenanceFallbackTriggered).toBe(false);

    // Fails all 5 attempts -> triggers maintenance fallback
    const failRes = runMigrations(
      5,
      1,
      () => {
        throw new Error('55P03: lock timeout');
      },
      () => {}
    );
    expect(failRes.success).toBe(false);
    expect(failRes.attempts).toBe(5);
    expect(failRes.maintenanceFallbackTriggered).toBe(true);
  });
});
