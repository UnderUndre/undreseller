# RTM — Requirements Traceability Matrix (app-level)

**Note on IDs**: `specs/main/requirements.md` already carries stable IDs (`FR-01…FR-16` for 001, `FR-101…FR-124` for 002, `NFR-001…NFR-007`). No renumbering needed. 004 requirements live in `specs/004-release-readiness/spec.md` as `FR-401…FR-444` — referenced here by those IDs. Requirements are grouped; every row carries an app-level manual test case from `test-cases.md`.

Risk model: **Risk Score = Impact (1–5) × Probability (1–5)**. Tier: Unit/API (automated), API-Manual (curl scripts), E2E-Manual (browser/Telegram GUI).

## Functional traceability

| Req ID | Суть | Impact | Prob | Risk Score | Test Tier | Test Cases | Source | Defect IDs |
|---|---|---|---|---|---|---|---|---|
| FR-01 | Admin catalog/shift CRUD, audit `[ADMIN_ACTION]`, public catalog only active | 4 | 2 | 8 | E2E-Manual | TC-MAIN-120, TC-MAIN-121 | 001 | — |
| FR-02 | Booking windows: subtract bookings+holds, breaks, minNoticeMin | 5 | 3 | 15 | API-Manual | TC-MAIN-011, TC-MAIN-012 | 001 | — |
| FR-03/FR-005 | Atomic slot hold, advisory lock, GiST `slot_resource_no_overlap`, 23P01→409 | 5 | 4 | 20 | API-Manual | TC-MAIN-040, TC-MAIN-041 | 001/002 | — |
| FR-04 | TG webhook secret check, `/start`,`/help`, callbacks, block tracking | 4 | 3 | 12 | API-Manual | TC-MAIN-060, TC-MAIN-061, TC-MAIN-090 | 001/002 | — |
| FR-05 | initData HMAC-SHA256, ±60s skew, 3600s age; no initData+tgId → 401 | 5 | 3 | 15 | API-Manual | TC-MAIN-062, TC-MAIN-063 | 001 | — |
| FR-08 | Knowledge ingestion limits + advisory lock | 2 | 2 | 4 | API (automated) | (covered by 001 automated suite; manual smoke only) TC-MAIN-140 | 001 | — |
| FR-11/FR-12 | Stars prepayment; NOWPayments HMAC-SHA512 IPN + 99% rule | 5 | 4 | 20 | API-Manual (sandbox) | TC-MAIN-030, TC-MAIN-032, TC-MAIN-033, TC-MAIN-035 | 001/004 | — |
| FR-13 | Atomic stock decrement; PAID_OUT_OF_STOCK path | 3 | 2 | 6 | API (automated) | TC-MAIN-140 | 001 | — |
| FR-14 | Durable inbox 64KB/Zod, 5s poller, drain endpoints | 3 | 2 | 6 | API-Manual | TC-MAIN-061 | 001 | — |
| FR-15 | `/api/health` 200/503, no secret/PII leak | 3 | 1 | 3 | API-Manual | TC-MAIN-150 | 001 | — |
| FR-16 | Log redaction: tokens, phones, notes, otp, initData, rawBody | 5 | 2 | 10 | API-Manual | TC-MAIN-151 | 001 | — |
| FR-101/102 | Multi-service basket 1..10, cumulative duration/price, snapshot | 4 | 3 | 12 | API-Manual | TC-MAIN-010, TC-MAIN-050 | 002 | — |
| FR-103/FR-442 | Slot grid by `slotGridStepMin` 15\|30; contiguous window; 45-min legal on 30-grid | 4 | 3 | 12 | API-Manual | TC-MAIN-011, TC-MAIN-012, TC-MAIN-013 | 002/004 | — |
| FR-106 | customerNotes ≤1000, sanitized, fixed-price disclaimer | 3 | 2 | 6 | E2E-Manual | TC-MAIN-020 | 002 | — |
| FR-107 | Staff bot pager card, 6 buttons, masked contacts | 4 | 2 | 8 | E2E-Manual | TC-MAIN-070 | 002 | — |
| FR-109 | Transactional CAS staff actions, idempotency `staff_cbq_*` | 5 | 3 | 15 | API-Manual | TC-MAIN-091, TC-MAIN-092, TC-MAIN-093 | 002 | — |
| FR-111 | One-time HMAC magic reschedule link, 24h TTL, nonce kill | 4 | 3 | 12 | API-Manual | TC-MAIN-092 | 002 | — |
| FR-112 | Omnichannel reminder; client confirm/decline callbacks; novice auto-cancel | 4 | 3 | 12 | API-Manual | TC-MAIN-080, TC-MAIN-081, TC-MAIN-082 | 002 | — |
| FR-116 | PAY_ON_SITE + prepayment timing IMMEDIATE / AFTER_STAFF_APPROVAL (15m AWAITING_PAYMENT) | 5 | 4 | 20 | API-Manual | TC-MAIN-020, TC-MAIN-021, TC-MAIN-031, TC-MAIN-036 | 002/004 | — |
| FR-117 | Blacklist by tgId/E.164, 403, risk-marker expiry, audited unblock | 5 | 3 | 15 | API-Manual | TC-MAIN-093 | 002 | — |
| FR-120 | GDPR purge: PII nulled + staff-chat redaction task | 5 | 2 | 10 | API-Manual | TC-MAIN-094, TC-MAIN-152 | 002 | — |
| FR-122 | Provider-separated refunds via RefundOperation; PaymentEvent immutable | 5 | 3 | 15 | API-Manual | TC-MAIN-100, TC-MAIN-101 | 002 | — |
| FR-123 | Messenger flags + `staff:copy_contacts` | 3 | 2 | 6 | E2E-Manual | TC-MAIN-070, TC-MAIN-071 | 002 | — |
| FR-401/403 | Provider-neutral payments; PREPAID track HELD→PAYMENT_PENDING→CONFIRMED; freeze on `confirming` (24h ceiling FR-404) | 5 | 4 | 20 | API-Manual (sandbox) | TC-MAIN-030, TC-MAIN-033, TC-MAIN-034 | 004 | — |
| FR-404/FR-433 | Hold TTL 15m; freeze suspends TTL; expired hold → release | 5 | 4 | 20 | API-Manual | TC-MAIN-034, TC-MAIN-036 | 004 | — |
| FR-407 | Per-service "require full prepayment" → PREPAID track | 5 | 3 | 15 | API-Manual | TC-MAIN-030, TC-MAIN-031 | 004 | — |
| FR-419/420/421 | Waitlist: TG-only join, anti-spam caps, atomic claim, fan-out ≤3 waves/24h | 4 | 3 | 12 | E2E-Manual | TC-MAIN-060→ waitlist: TC-MAIN-122, TC-MAIN-123 | 004 | — |
| FR-423/434 | Custom fields: deactivation only, required blocking, ≤1000 chars | 3 | 3 | 9 | E2E-Manual | TC-MAIN-124, TC-MAIN-125 | 004 | — |
| FR-426 | Mixed service+product cart blocked at checkout | 4 | 2 | 8 | API-Manual | TC-MAIN-051 | 004 | — |
| FR-427 | Staff web sign-in: scrypt, session rotation, 7d TTL, 5-fail lockout; ADMIN_TOKEN break-glass + old-token grace | 5 | 3 | 15 | E2E-Manual | TC-MAIN-001..TC-MAIN-005 | 003/004 | — |
| FR-316-lineage (003) | 3 roles OWNER>OPERATOR>PERFORMER (`ROLE_RANK`, minRole guards) | 5 | 3 | 15 | E2E-Manual | TC-MAIN-001, TC-MAIN-003, TC-MAIN-004, TC-MAIN-005 | 003 | — |
| FR-411/412 (004) | i18n ru/en: language resolution, plurals, dates; unsupported code → default | 4 | 3 | 12 | E2E-Manual | TC-MAIN-130..TC-MAIN-133 | 004 | — |
| FR-444/FR-432 | Late gateway FINISHED: slot free → re-confirm; re-booked → PAID_REQUIRES_RESOLUTION + refund ≤24h | 5 | 3 | 15 | API-Manual | TC-MAIN-100 (late branch), TC-MAIN-035 | 004 | — |
| FR-441 | R2 image upload: WebP ≤200KB ≤1200px; degradation save-without-image | 2 | 2 | 4 | E2E-Manual | TC-MAIN-141 | 004 | — |
| FR-436–443 (US9) | Content admin tabs catalog/team/settings/waitlist/fields; OWNER-only system settings | 4 | 2 | 8 | E2E-Manual | TC-MAIN-120, TC-MAIN-121, TC-MAIN-004 | 004 | — |
| Integration profile | Fail-closed `ERR_INTEGRATION_PROFILE_VIOLATION`, single contour, no third bot token | 5 | 2 | 10 | API-Manual | TC-MAIN-042 | 001/003 | — |
| Feature flags | Every `FEATURE_FLAG_*` off → legacy behavior observable, no DDL | 4 | 3 | 12 | API-Manual | TC-MAIN-043 | 004 | — |
| ADMIN_TOKEN rotation | Old token grace window, `[OLD_ADMIN_TOKEN_USED]`, expiry rejects | 4 | 3 | 12 | API-Manual | TC-MAIN-005 | 004 | — |

## NFR evidence table (app-wide)

| NFR | Требование | Method / Tool | Threshold | Evidence |
|---|---|---|---|---|
| NFR-01/003 Memory fencing | ≤500 MB RSS under full load (2 bots, poller, 100 concurrent bookings, outbox) | Load run: `docker/bench-memory.sh` + `docker stats` on staging; 100 parallel `POST /api/booking/lock` | Peak RSS ≤ 500 MB, no OOM-kill | [PENDING] |
| NFR-002 Webhook SLA | Webhook response + staff dispatch enqueue < 1.5 s | Time `POST /api/bot/telegram/webhook` and `/api/bot/staff/webhook` (curl -w '%{time_total}'); grep `[STAFF_DISPATCH_SENT]` | p95 < 1.5 s | [PENDING] |
| NFR-001 Slot latency | 5-service cart, 7-day horizon → slots < 50 ms p95 | Scripted `POST /api/booking/slots` ×100, `curl -w` timing | p95 < 50 ms | [PENDING] |
| NFR-03 Perimeter security | Secrets only via env; rate limit 10 req/60s (REPLICA_COUNT=1) | `grep -rn "process.env"` audit + manual 11th request in 60s → 429 | 429 on request #11; no secret in code | [PENDING] |
| NFR-04 Whitelabel split | Branding in `config/shop.config.ts`; schedule/grid/timings/prepay in ShopSettings | Manual: change setting via admin settings tab → behavior shifts without redeploy | Behavior change with no rebuild | [PENDING] |
| NFR-05 Availability/RTO | 99.0% uptime, RTO ≤ 30 min | Timed restore drill from pg_dump into scratch container | Restore + health 200 ≤ 30 min | [PENDING] |
| NFR-006 DDL compaction | No backfill+NOT NULL in one tx; lock/statement timeouts | `migrate-safe.sh` dry run on staging copy | No lock waits > 2s/5s; script exits 0 | [PENDING] |
| NFR-007 Job continuity | Postgres-backed deadlines + 5s poller + sweeper, alert >120s lag | Stop poller 3 min on staging → restart → backlog drained; sweeper log | Drain completes; alert fired | [PENDING] |
| Webhook HMAC (STRIDE) | TG secret token 403; NOWPayments sig HMAC-SHA512; initData HMAC | TC-MAIN-060, TC-MAIN-032/033 (tampered body), TC-MAIN-062 | 403/422 rejection, no state change | [PENDING] |
| Zero-PII logs | Redaction deny-list in `logger.ts` | TC-MAIN-151: trigger booking w/ phone+notes, grep logs for raw values | 0 hits for raw phone/notes/token | [PENDING] |

**Defect ID convention**: `DEF-MAIN-NNN` logged against the TC that exposed it; empty cells mean none known at authoring time.
