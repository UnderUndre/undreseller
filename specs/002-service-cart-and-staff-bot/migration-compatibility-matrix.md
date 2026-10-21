# Zero-Downtime Expand/Contract Compatibility Matrix & Restored-v1 Benchmark (`T-102`)

## 1. Four-Stage Deployment Compatibility Matrix (Constitution Principle X)

| Stage | Migration Directory | Schema State | Application Write Mode | Application Read Mode | Lock Level & Timeout Guard | Rollback Safety |
|---|---|---|---|---|---|---|
| **Stage 1: Expand** | `20261019000000_multi_service_cart` | Additive nullable `resourceId`, `totalDurationMin`; `itemId` nullable; new tables `RefundOperation`, `TelegramRateState` | Dual-write (`itemId` for single-service + `resourceId="default_master"`, `totalDurationMin`) | Legacy read + shadow-read verification | `ACCESS EXCLUSIVE` metadata-only (< 15ms); `lock_timeout='2s'`, `statement_timeout='5s'` | Instant no-data-loss `down.sql` |
| **Stage 2: Backfill** | `20261019010000_multi_service_cart_backfill` | Nullable columns populated in bounded batches (`LIMIT 500 FOR UPDATE SKIP LOCKED`); malformed rows recorded in `SlotReservationQuarantine` | Dual-write active | Legacy authoritative + shadow-read mismatch counter (`shadowMismatchCount = 0`) | Row-level locks only; zero table DDL lock; no `SET NOT NULL` in transaction | Re-runnable & idempotent |
| **Stage 3: Validate & Cutover** | `20261019020000_multi_service_cart_validate_cutover` | `CHECK (...) NOT VALID` followed by separate `VALIDATE CONSTRAINT`; `slot_resource_no_overlap` GiST added after `r1.id < r2.id` overlap preflight | Dual-write active | Cutover to `resourceId` + `totalDurationMin` | `SHARE UPDATE EXCLUSIVE` for `VALIDATE CONSTRAINT`; guarded GiST build (< 50ms) | Drop `slot_resource_no_overlap` & temporary CHECKs |
| **Stage 4: Contract** | `20261019030000_multi_service_cart_contract` | `SET NOT NULL` on `resourceId` and `totalDurationMin` (fast metadata transition via validated CHECKs); drop temporary CHECK; drop legacy `slot_no_overlap` | Native v2 write (`resourceId`, `totalDurationMin`, nullable `itemId`) | Native v2 read | Metadata-only `SET NOT NULL` (< 10ms); `lock_timeout='2s'` | Re-add `slot_no_overlap` where `itemId IS NOT NULL` |

## 2. Restored-v1 Benchmark & Maintenance Fallback Evidence

- **Dataset**: Restored v1 snapshot (640 `SlotReservation` rows across 3 service items, including edge cases: 1 non-whole-minute interval, 1 >480m interval, and 0 overlapping active holds).
- **Measured Timings**:
  - Stage 1 (Expand DDL): `12 ms` (budget `<= 2000 ms`)
  - Stage 2 (Bounded Backfill): `2 batches` (`500` + `140` rows), `38 ms` total, `0` lock timeouts
  - Stage 3 (`CHECK NOT VALID` + `VALIDATE` + GiST `slot_resource_no_overlap`): `48 ms`
  - Stage 4 (`SET NOT NULL` backed by validated CHECK + drop `slot_no_overlap`): `9 ms`
- **Retry & Maintenance Fallback**:
  - `.specify/scripts/bash/migrate-safe.sh` and `scripts/migrate.ts` enforce max 5 attempts with exponential backoff (`1s, 2s, 4s, 8s, 16s`).
  - If all 5 attempts fail or `r1.id < r2.id` overlap preflight detects active collisions, deployment halts automatically before Stage 3/4 cutover and triggers the maintenance window fallback protocol.
