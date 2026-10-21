# Phase 1 Tracer Bullet Quickstart & Verification Runbook (`003`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-21  
**Target Baseline**: Single-VPS Production (`99.0% uptime`, `RTO <= 60m`, `RPO <= 24h`, `100 concurrent reqs`, `app RSS <= 500 MB` — `Q5 Option B`)

---

## 1. Prerequisites & Environment Setup

1. Ensure PostgreSQL 16 with `btree_gist` is running (`docker compose up -d postgres`).
2. Configure `.env` for single-tenant deployment (`Q4 Option A`):
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/undreseller?connection_limit=10"
   DIRECT_URL="postgresql://postgres:postgres@localhost:5432/undreseller"
   ENABLED_EXTERNAL_INTEGRATION="TELEGRAM_BUNDLE"
   ADMIN_TOKEN="break_glass_emergency_token_32chars_min"
   STAFF_SESSION_SECRET="32_byte_hex_secret_for_cookie_signing"
   ```

---

## 2. Step-by-Step Tracer Bullet Validation (Production MVP `003.1`)

### Step 1: Run 4-Stage Expand & Backfill Migration (`NFR-305`)
```bash
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/undreseller" \
  .specify/scripts/bash/migrate-safe.sh
npx tsx scripts/backfill-003-kernel.ts
```
- **Expected**: Stage 1 (`Expand`), Stage 2 (`Backfill`), and Stage 3 (`Validate/Cutover`) complete with `lock_timeout = '2s'`, `statement_timeout = '5s'`, and `0` unmigrated `Item` or `Order` records.

### Step 2: Verify Staff Session Auth, 3-Role RBAC & Break-Glass Audit (`US5`, `FR-325a`, `FR-325b`)
```bash
# 1. Login as OWNER and provision an OPERATOR and a PERFORMER
curl -i -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@shop.local","password":"OwnerInitialPassword!23"}'

# 2. Verify PERFORMER cannot call refund endpoint (returns HTTP 403 INSUFFICIENT_STAFF_ROLE)
# 3. Revoke OPERATOR session and verify immediate HTTP 401 SESSION_REVOKED
# 4. Call with break-glass ADMIN_TOKEN and verify AuditEvent(BREAK_GLASS_ADMIN_TOKEN_USED)
```

### Step 3: Execute Mixed Goods + Service Order with 30/70 PaymentPlan & Segmented Fulfillment (`US1`–`US4`, `SC-001`)
1. Query `GET /api/booking/slots?itemIds=<productOfferingId>,<serviceOfferingId>&resourceId=default_master&date=2026-10-25` — verify p95 latency `< 50 ms` (`NFR-301`).
2. Lock slot & submit `POST /api/checkout` with `paymentPlanMode: "DEPOSIT_30_70"`:
   - Verify `InventoryMovement(RESERVE)` decrements `InventoryBalance.available` (`INV-003`).
   - Verify `SlotReservation` locks contiguous window with `bufferBeforeMin` / `bufferAfterMin` (`INV-004`).
   - Verify `OrderLine` snapshots are persisted (`INV-001`).
   - Verify `PaymentPlan` creates Milestone 1 (`30% DEPOSIT`) and Milestone 2 (`70% BALANCE`).
   - Verify `FulfillmentPlan` creates 2 independent segments: `INVENTORY` and `APPOINTMENT`.
3. Capture 30% deposit webhook $\to$ verify `PaymentAllocation` marks Milestone 1 `PAID` and `Order` payment status `PARTIALLY_PAID`.
4. Authenticate as `PERFORMER` (`StaffRole.PERFORMER`) and `POST /api/admin/fulfillment/segments/<appointmentSegmentId>/evidence` with checklist and serial number $\to$ verify segment transitions to `COMPLETED` and `AuditEvent` records `actorId`.

### Step 4: Verify Post-Payment Capacity Conflict $\to$ `OperatorAction` Queue (`INV-002`, `SC-003`)
1. Simulate concurrent payment webhook on `available = 0` stock or expired slot.
2. Verify `PaymentEvent` is preserved (`INV-002`), order transitions to `PAID_REQUIRES_RESOLUTION`, and `GET /api/admin/operator-actions` returns the open `OperatorAction` within `< 2 seconds`.

### Step 5: Single-VPS Load, Memory Ceiling & DR Restore Drill (`SC-002`, `NFR-303`, `NFR-304`)
```bash
npm test -- tests/unit/performance-benchmark.test.ts
bash docker/bench-memory.sh
```
- **Expected**:
  - 100 concurrent reservation/checkout requests produce `0` overlapping bookings and `100%` accurate `InventoryBalance`;
  - Main application container peak RSS stays **$\le 500\text{ MB RAM}$**;
  - Automated `pg_dump` restore drill into a clean verification database completes well within **RTO $\le 60$ minutes** against a **$\le 24$-hour RPO** snapshot.

---

## 3. Optional Engineering AI Lab Verification (`Phase H: P-AI-001`–`P-AI-008`)

*(Runs on external workstation / lab profile outside the 500 MB commerce-core container)*
```bash
docker compose -f infrastructure/compose/ai-lab.compose.yml up -d
npx tsx scripts/ai-benchmark.ts --suite golden
npx tsx scripts/ai-outage-drill.ts
```
- **Expected (`SC-006`)**: Stopping local `LM Studio` causes `AiDataClass.CONFIDENTIAL` requests to fail closed immediately (`0` cloud fallbacks) while `commerce-core` checkout and booking endpoints remain `100%` available.
