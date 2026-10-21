# Tasks: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

---

## Phase 1: Database & Schema

- [X] `T-101` `[DB]` Update `prisma/schema.prisma` with `resourceId` (default `"default_master"`), nullable `itemId`, and `totalDurationMin` on `SlotReservation`; `customerNotes`, `paymentType`, `confirmationStatus`, `cancellationReason`, `refundStatus`, `autoCancelOnNoConfirmation`, `scheduleVersion`, `rescheduleTokenHash`, `rescheduleTokenConsumedAt`, `invoiceExpiresAt`, `staffMessageId`, `staffChatId` on `Order`; `PAYMENT_EXPIRED`, `PAID_REQUIRES_RESOLUTION` on `OrderStatus`; and configuration fields on `ShopSettings` (`slotGridStepMin`, `confirmationNoticeHours`, `autoCancelDeadlineHours`, `autoCancelForNewClients`, `allowPayOnSite`, `prepaymentTiming`, `staffDestinationChatId`, `authorizedStaffUserIds`). Add `RefundOperation` model with kind/status enums, unique `idempotencyKey`, providerRef, amount/asset/network/destination/networkFee/txid, actor, timestamps, error and reconciliation fields; keep `PaymentEvent` immutable.
- [X] `T-102` `[DB]` Implement Principle X as separate deployable phases: (1) additive nullable schema and backward-compatible dual-write, (2) resumable rate-limited backfill with checkpoints/quarantine/shadow-read metrics, (3) read cutover plus guarded resource GiST constraint after zero-mismatch preflight, and (4) dedicated contract cleanup after observation PASS. Put max-5 retry/backoff in `.specify/scripts/bash/migrate-safe.sh`; benchmark on restored v1; attach compatibility matrix and maintenance fallback evidence.

## Phase 2: Booking Core & Cart Service

- [X] `T-103` `[BE]` `[US1]` In the booking transaction reload authoritative items; reject duplicate IDs, inactive/deleted items, mixed currency, nonpositive duration and total duration > 480 min; persist immutable `OrderItem` snapshots of name, priceMinor, currency and durationMin.
- [X] `T-104` `[BE]` `[US1]` `lib/booking/windows.ts` update: support `itemIds: string[]` and `resourceId`, generate 30-min grid intervals (`slotGridStepMin`), filter contiguous windows of length `totalDurationMin` against reservations and breaks.
- [X] `T-105` `[BE]` `[US1]` `lib/booking/lock.ts` + `POST /api/booking/lock` update: multi-service booking lock with resource-scoped advisory lock (`acquireResourceSlotLock`), `customerNotes` persistence, blacklist enforcement (rejects blocked Telegram ID or phone with HTTP 403 Forbidden), and client history segmentation (`autoCancelOnNoConfirmation = true` for new clients).

## Phase 3: Dedicated Staff Bot

- [X] `T-106` `[BE]` `[US2]` `lib/bot/staffBot.ts`: grammY bot instance for staff (`STAFF_BOT_TOKEN`), order card formatter with masked phone (`+7 *** *** 4567`), 5 action buttons (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Заказ выполнен]`), and HMAC-signed single-use Magic Reschedule link generator with `nonce`, `expiresAt`, `rescheduleTokenHash`, and `scheduleVersion`.
- [X] `T-107` `[BE]` `[US2]` Verify webhook secret and staff chat/user authorization; deduplicate `callbackQuery.id`; implement action-specific transactional CAS for approve/reject/blacklist/reschedule/fulfill; commit DB state before enqueueing idempotent Telegram markup/redaction projection; add audited unblock with actor/reason.
- [X] `T-107b` `[BE]` `[US4]` Implement provider-separated `RefundOperation` at `POST /api/admin/orders/[id]/refund`: Stars uses `refundStarPayment`; crypto uses merchant reimbursement/payout with verified destination, asset/network, fee policy, balance check and operator authorization. Persist idempotencyKey, providerRef/txid, `REQUESTED/SUBMITTED/CONFIRMED/FAILED/UNKNOWN` and reconciliation; never create synthetic negative `PaymentEvent`.

## Phase 4: Confirmation, Auto-Cancellation & Invoicing (Inngest)

- [X] `T-108` `[BE]` `[US3]` Inngest function `appointmentReminderJob` in `lib/jobs/inngest.ts`: with 4 `cancelOn` triggers (`order/cancelled`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`), sleep until `startTime - confirmationNoticeHours`, wake-up CAS check (`scheduleVersion`), and omnichannel dispatch (Telegram for TMA/TG clients, WhatsApp Cloud API template for phone-based clients).
- [X] `T-109` `[BE]` `[US3]` Client response handler for confirmation buttons (`[Подтверждаю]` -> `CLIENT_CONFIRMED`, `[Не смогу]` -> `CLIENT_DECLINED`, alerts staff bot).
- [X] `T-110` `[BE]` `[US3]` Inngest function `autoCancelUnconfirmedJob` in `lib/jobs/inngest.ts`: with 4 `cancelOn` triggers (`order/cancelled`, `order/client-confirmed`, `order/rescheduled`, `order/fulfilled`), sleep until `startTime - autoCancelDeadlineHours`, wake-up CAS check (`scheduleVersion`), auto-cancels unconfirmed bookings for new clients (`cancellationReason = 'AUTO_CANCELLED_NO_CONFIRMATION'`), alerts staff and client.
- [X] `T-110b` `[BE]` `[US4]` Inngest function `invoiceExpiryJob` in `lib/jobs/inngest.ts`: handles 15-minute invoice window for `AFTER_STAFF_APPROVAL` with 3 `cancelOn` triggers (`order/paid`, `order/cancelled`, `order/rescheduled`). If unpaid after 15 minutes, transitions order to `PAYMENT_EXPIRED` (`cancellationReason = 'PAYMENT_EXPIRED'`) and releases reservation (`RELEASED`). Handles late webhooks without funds loss (`PAID_REQUIRES_RESOLUTION` / `OVERBOOKED_MANUAL_RESOLUTION` with `refundStatus = 'REFUND_REQUESTED'` and 24h operator SLA).

## Phase 5: Storefront UI & TMA

- [X] `T-111` `[FE]` `[US1]` `components/catalog/CartDrawer.tsx`: multi-service selection drawer, total duration and price display, and checkout trigger.
- [X] `T-112` `[FE]` `[US1]` `components/booking/SlotGrid.tsx` update: multi-service slot display with 30-min step, `customerNotes` input with fixed-price disclaimer, pay-on-site radio selection.
- [X] `T-113` `[FE]` `[US4]` `components/checkout/CheckoutModal.tsx` & `app/checkout/page.tsx` update: support `PAY_ON_SITE` without gateway redirection, and configurable prepayment timing (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL`).
- [X] `T-113b` `[FE]` `[OPS]` Enforce Sprint B delivery boundary through deployment configuration: at most two roles, one booking workflow and one enabled external integration per client SOW; non-selected WhatsApp/Telegram/payment adapters remain disabled by feature flags. Document Phase 2 backlog handoff and preserve the <=500 MB application memory gate.

## Phase 6: Quality Gates & Comprehensive Tests

- [X] `T-114` `[E2E]` Unit tests in `tests/unit/multi-service-cart.test.ts`: multi-service contiguous window calculations, 30-min grid step, slot break/conflict filtering.
- [X] `T-116` `[DB]` `[E2E]` Integration test for PostgreSQL GiST exclusion: concurrent booking collisions on overlapping multi-service windows return 409 (`23P01`), DDL lock timeout verification with retry policy, and safe `down.sql` rollback test. Run from a restored v1 snapshot; test malformed/non-whole-minute intervals, full duration correction, multi-resource parallelism, five retry attempts, deploy abort and maintenance fallback.
- [X] `T-117` `[BE]` Integration/concurrency tests: Inngest rules <= 4 and stale-run CAS; simultaneous approve/reject/blacklist/fulfill callbacks yield one transition; concurrent reschedule issue/consume; Stars refund idempotency; crypto validation, timeout->UNKNOWN and reconciliation; duplicate payment webhooks; Telegram 429/permission/no-op/missing-message taxonomy; GDPR purge.
- [X] `T-118` `[SEC]` Staff bot authorization test (unauthorized group member callback rejected with alert), Magic Reschedule link single-use and tamper rejection test, blacklist 403 lock rejection test. Verify phone-only blocking requires verified ownership; log unblock actor/reason; test recycled/unlinked numbers do not cause indefinite blocking.
- [X] `T-119` `[PERF]` Latency benchmark for slot calculation (p95 < 50ms) and memory ceiling verification (<= 500 MB RAM).
- [X] `T-120` `[GATE]` Run `/speckit.analyze` and store `reviews/analyze.md` with PASS or OVERRIDDEN.
- [X] `T-121` `[GATE]` Obtain at least two PASS/OVERRIDDEN reviews from distinct external providers under `reviews/<provider>.md`; Copilot counts as one provider only.
- [X] `T-122` `[GATE]` Run `snapshot-stage` from the Git worktree and record/reuse the `review/002-service-cart-and-staff-bot/vN` tag before implementation.
- [X] `T-115` `[SEC]` `[OPS]` Final constitutional quality gate: `npm run validate`, `npm test`, `npm run build`, license audit, telemetry redaction verification.

---

## Dependency graph

```text
T-101 → T-102
T-102 → T-103
T-103 → T-104
T-104 → T-105
T-105 → T-106
T-106 → T-107
T-107 → T-107b
T-105 → T-108
T-108 → T-109
T-109 → T-110
T-107 → T-110b
T-103 + T-104 → T-111
T-111 + T-105 → T-112
T-112 → T-113
T-113 → T-113b
T-105 + T-107 + T-107b + T-110 + T-110b + T-113 → T-114
T-102 + T-105 → T-116
T-108 + T-110 + T-110b + T-107 + T-107b → T-117
T-105 + T-106 + T-107 → T-118
T-104 + T-114 → T-119
T-114 + T-116 + T-117 + T-118 + T-119 + T-120 + T-121 + T-122 → T-115
```

## Parallel lanes

| Lane | Tag | Sequence |
|---|---|---|
| Database | `[DB]` | T-101 → T-102 |
| Booking Core | `[BE]` | T-103 → T-104 → T-105 |
| Staff Bot | `[BE]` | T-106 → T-107 → T-107b |
| Inngest Lifecycles | `[BE]` | T-108 → T-109 → T-110, T-107 → T-110b |
| Storefront UI | `[FE]` | T-111 → T-112 → T-113 |
| Verification | `[E2E]` `[DB]` `[BE]` `[SEC]` `[PERF]` `[OPS]` | T-114, T-116, T-117, T-118, T-119 → T-115 |

