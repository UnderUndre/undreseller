# Quickstart: Tracer Bullet (004 Release Readiness)

> Minimal end-to-end path validating interface → FSM → persistence on a fresh instance. Run after Phase 1 (Expand) migration + backfill. ~20 minutes.

## 0. Environment

```bash
docker compose up -d postgres
cp .env.example .env    # fill DATABASE_URL/DIRECT_URL, BOT tokens, R2 creds, email API key, NOWPAYMENTS keys
npm install
npm run db:migrate      # applies 20261025000000_004_release_readiness_expand
npx ts-node scripts/backfill-004-language-defaults.ts
```

## 1. Tracer bullet scenario

1. **Foundation config (OWNER)**: login → `/admin/settings` → set business name, defaultLocale `ru`, IANA timezone `Europe/Berlin`, currency confirm → verify `/` renders chrome in ru with correct locale dates.
2. **Quick-create (US9)**: `/admin/catalog` → quick-create sheet → «Мужская стрижка», цена, 45 мин (selector, quantum ✓), мастер=all → photo via uploader (client WebP → presign PUT → R2 URL) → **verify: item on storefront within one reload; ≤4 required fields; ≤2 taps deep**.
3. **Free-track booking (US1)**: open bot → menu button (US4) → Mini App `/book` → pick slot (grid in Europe/Berlin wall-clock) → book with name+phone → **verify: auto-CONFIRMED (no payment step), TG notification logged ACCEPTED, staff card delivered**.
4. **OUT_CALL guard (US1/US7)**: book an out-call service without address via API → **verify: field-level 400 at boundary**; with address → PENDING_APPROVAL → staff approve → CONFIRMED.
5. **Prepaid track (US1, stubbed gateway)**: flip item `requiresFullPrepayment` → book → HELD 15-min TTL → simulate gateway `confirming` → **verify hold frozen past TTL** → simulate `finished` → CONFIRMED + PaymentAllocationLink; replay webhook ×100 → one effect.
6. **Underpaid (US1)**: simulate `partially_paid` → **verify: UNDERPAID, staff notified, no auto-confirm**.
7. **Waitlist (US5)**: second customer joins waitlist for that service/window → cancel the confirmed booking → **verify: offer dispatched ≤60 s, claim → CONFIRMED, second claimant → TAKEN**.
8. **Notification fallback (US2)**: block TG delivery (mock 500) → **verify email fallback ≤5 min, both attempts in delivery log**.
9. **DR evidence (US7)**: `scripts/dr-restore-drill.ps1` → **verify: REAL restore into scratch DB, measured RTO/RPO printed, PASS only on evidence**.

## 2. Acceptance snapshot

| Check | Source |
|---|---|
| 100-way same-slot race → exactly 1 winner | SC-401 (automated, tests/unit) |
| p95 availability < 300 ms on tracer steps | NFR-401 |
| RSS ≤ 500 MB during the whole run | NFR-402 (docker/bench-memory.sh) |
| Zero PII in logs after full run | SC-403 (log scan) |
| `grep -r "undreseller" projects/` — n/a here; undesign tokens active, no generic palette in brand roles | FR-431 |

## 3. Rollback rehearsal

```bash
# feature flags off → legacy paths; then additive down-migration on scratch copy:
npx prisma migrate down -- 20261018000000_init  # on SCRATCH copy only — verifies down.sql chain
```
