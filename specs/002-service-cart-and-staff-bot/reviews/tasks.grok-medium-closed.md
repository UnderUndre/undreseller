# Tasks: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

---

## Phase 1: Database & Schema

- [X] `T-101` `[DB]` Update `prisma/schema.prisma` with `resourceId` (default `"default_master"`), nullable `itemId`, and `totalDurationMin` on `SlotReservation`; `customerNotes`, `paymentType`, `confirmationStatus`, `cancellationReason`, `refundStatus`, `autoCancelOnNoConfirmation`, `scheduleVersion`, `rescheduleTokenHash`, `rescheduleTokenConsumedAt`, `invoiceExpiresAt`, `staffMessageId`, `staffChatId` on `Order`; `PAYMENT_EXPIRED`, `PAID_REQUIRES_RESOLUTION` on `OrderStatus`; and configuration fields on `ShopSettings` (`slotGridStepMin`, `confirmationNoticeHours`, `autoCancelDeadlineHours`, `autoCancelForNewClients`, `allowPayOnSite`, `prepaymentTiming`, `staffDestinationChatId`, `authorizedStaffUserIds`). Add `ExternalIntegration { NONE, TELEGRAM_BUNDLE, WHATSAPP, NOWPAYMENTS }` / `enabledExternalIntegration`; phone verification/risk fields; outbox bot/chat/priority/dedupe/lease/nextAttemptAt/reconciliation fields. Document the credential matrix: TELEGRAM_BUNDLE permits exactly BOT_TOKEN + STAFF_BOT_TOKEN and forbids WhatsApp/NOWPayments; every other profile forbids both Telegram tokens.
- [X] `T-102` `[DB]` Implement four separate deploy stages: nullable expand/dual-write; resumable batch backfill; `CHECK ... NOT VALID` then separate `VALIDATE CONSTRAINT` plus read cutover/resource GiST; and later contract migration with `SET NOT NULL`, temporary CHECK removal and legacy constraint drop. Never place full-table backfill and `SET NOT NULL` in one transaction. Include lock/statement timeouts, max-five external retries, restored-v1 benchmark and maintenance fallback.

## Phase 2: Booking Core & Cart Service

- [X] `T-103` `[BE]` `[US1]` `lib/booking/cart.ts`: validate cart items (max 10 items ceiling, positive durations, single currency), sum `totalDurationMin` and `totalMinor`.
- [X] `T-104` `[BE]` `[US1]` `lib/booking/windows.ts` update: support `itemIds: string[]` and `resourceId`, generate 30-min grid intervals (`slotGridStepMin`), filter contiguous windows of length `totalDurationMin` against reservations and breaks.
- [X] `T-105` [BE] [US1] Update booking lock with stable-identity blacklist enforcement. Implement phone OTP (10-minute TTL, rate/attempt limits), persist phoneVerifiedAt, key permanent blocks by Telegram ID/customerId, route phone-only matches to MANUAL_REVIEW, expire risk markers after 90 days, and audit rebind/unblock.

## Phase 3: Dedicated Staff Bot

- [X] `T-106` `[BE]` `[US2]` `lib/bot/staffBot.ts`: grammY bot instance for staff (`STAFF_BOT_TOKEN`), order card formatter with masked phone (`+7 *** *** 4567`), 5 action buttons (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Заказ выполнен]`), and HMAC-signed single-use Magic Reschedule link generator with `nonce`, `expiresAt`, `rescheduleTokenHash`, and `scheduleVersion`.
- [X] `T-107` [BE] [US2] Staff webhook authorization and action-specific CAS. All Telegram sends/edits/deletes enqueue to the shared durable dispatcher; redaction and terminal keyboard removal use highest priority and stable dedupe keys. Add audited unblock.
- [X] `T-107b` `[BE]` `[US4]` Implement idempotent provider-separated refunds with `RefundOperation` states and provider references. Telegram Stars uses the official refund call; crypto uses merchant reimbursement/payout and reconciliation. `PaymentEvent` remains immutable; never create a synthetic negative PaymentEvent.
- [X] `T-107c` `[BE]` `[OPS]` Build one durable Telegram dispatcher per bot token with persisted bot-wide/per-chat shaping, shared 429 cooldown from parameters.retry_after, priority scheduling with starvation protection, atomic leases, timeout reconciliation and queue metrics.

## Phase 4: Confirmation, Auto-Cancellation & Invoicing (Inngest)

- [X] `T-108` `[BE]` `[US3]` Inngest function `appointmentReminderJob` in `lib/jobs/inngest.ts`: with 4 `cancelOn` triggers (`order/cancelled`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`), sleep until `startTime - confirmationNoticeHours`, wake-up CAS check (`scheduleVersion`), and omnichannel dispatch (Telegram for TMA/TG clients, WhatsApp Cloud API template for phone-based clients).
- [X] `T-109` `[BE]` `[US3]` Client response handler for confirmation buttons (`[Подтверждаю]` -> `CLIENT_CONFIRMED`, `[Не смогу]` -> `CLIENT_DECLINED`, alerts staff bot).
- [X] `T-110` `[BE]` `[US3]` Inngest function `autoCancelUnconfirmedJob` in `lib/jobs/inngest.ts`: with 4 `cancelOn` triggers (`order/cancelled`, `order/client-confirmed`, `order/rescheduled`, `order/fulfilled`), sleep until `startTime - autoCancelDeadlineHours`, wake-up CAS check (`scheduleVersion`), auto-cancels unconfirmed bookings for new clients (`cancellationReason = 'AUTO_CANCELLED_NO_CONFIRMATION'`), alerts staff and client.
- [X] `T-110b` `[BE]` `[US4]` Inngest function `invoiceExpiryJob` in `lib/jobs/inngest.ts`: handles 15-minute invoice window for `AFTER_STAFF_APPROVAL` with 3 `cancelOn` triggers (`order/paid`, `order/cancelled`, `order/rescheduled`). If unpaid after 15 minutes, transitions order to `PAYMENT_EXPIRED` (`cancellationReason = 'PAYMENT_EXPIRED'`) and releases reservation (`RELEASED`). Handles late webhooks without funds loss (`PAID_REQUIRES_RESOLUTION` / `OVERBOOKED_MANUAL_RESOLUTION` with `refundStatus = 'REFUND_REQUESTED'` and 24h operator SLA).
- [X] `T-110c` `[BE]` `[OPS]` Implement PostgreSQL-backed deadline reconciliation sweeper independent of Inngest scheduling. Lease and process overdue reminders, auto-cancel deadlines and invoice expiries through existing CAS services; add lag/oldest-overdue alerts and an Inngest outage recovery test. Document self-hosted Inngest as a tested migration option, not hot standby.

## Phase 5: Storefront UI & TMA

- [X] `T-111` `[FE]` `[US1]` `components/catalog/CartDrawer.tsx`: multi-service selection drawer, total duration and price display, and checkout trigger.
- [X] `T-112` `[FE]` `[US1]` `components/booking/SlotGrid.tsx` update: multi-service slot display with 30-min step, `customerNotes` input with fixed-price disclaimer, pay-on-site radio selection.
- [X] `T-113` `[FE]` `[US4]` `components/checkout/CheckoutModal.tsx` & `app/checkout/page.tsx` update: support `PAY_ON_SITE` without gateway redirection, and configurable prepayment timing (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL`).
- [X] `T-113b` `[FE]` `[OPS]` Implement fail-closed integration-profile enforcement. `TELEGRAM_BUNDLE` permits exactly client `BOT_TOKEN` plus `STAFF_BOT_TOKEN` in one Telegram contour and forbids WhatsApp/NOWPayments credentials; other profiles forbid both Telegram tokens. Conditionally register routes/jobs/UI, fail startup/readiness on mixed or third-token configurations, and cover the full credential matrix in CI.

## Phase 6: Quality Gates & Comprehensive Tests

- [X] `T-114` `[E2E]` Unit tests in `tests/unit/multi-service-cart.test.ts`: multi-service contiguous window calculations, 30-min grid step, slot break/conflict filtering.
- [X] `T-116` `[DB]` `[E2E]` Integration test for PostgreSQL GiST exclusion: concurrent booking collisions on overlapping multi-service windows return 409 (`23P01`), DDL lock timeout verification with retry policy, and safe `down.sql` rollback test. Add concurrent same-resource and different-resource insert load; assert no deadlocks and bounded pool wait. Verify backfill, NOT VALID CHECK, VALIDATE, and SET NOT NULL occur in distinct transactions/deployments and measure lock duration on restored-v1 data.
- [X] `T-117` `[BE]` Inngest sleep race condition & CAS tests: verify Inngest cancelOn triggers are strictly <= 4 events per function, stale runs aborted on rescheduled/cancelled orders, 15-minute invoice timeout test, refundStatus transition and reconciliation tests, Telegram PII redaction test on order completion and GDPR purge. Add Telegram burst tests for shared send/edit pressure, persisted retry_after, priority redaction, lease recovery, dedupe and zero lost terminal projections. Assert refund flows never create a negative PaymentEvent and only mutate RefundOperation.
- [X] `T-118` `[SEC]` Staff bot authorization test (unauthorized group member callback rejected with alert), Magic Reschedule link single-use and tamper rejection test, blacklist 403 lock rejection test.
- [X] `T-119` [PERF] Benchmark p95 < 50ms and <=500 MB under combined load: two bots, Inngest, PDF parsing, 100 concurrent bookings and non-empty Telegram outbox; capture peak/steady RSS, queue growth and OOM/restart as FAIL.
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
T-107b → T-107c
T-105 → T-108
T-108 → T-109
T-109 → T-110
T-107 → T-110b
T-110b → T-110c
T-103 + T-104 → T-111
T-111 + T-105 → T-112
T-112 → T-113
T-113 → T-113b
T-105 + T-107 + T-107b + T-110 + T-110b + T-113 → T-114
T-102 + T-105 → T-116
T-108 + T-110 + T-110b + T-110c + T-107 + T-107b + T-107c → T-117
T-105 + T-106 + T-107 → T-118
T-104 + T-107c + T-114 → T-119
T-114 + T-116 + T-117 + T-118 + T-119 → T-115
```

## Parallel lanes

| Lane | Tag | Sequence |
|---|---|---|
| Database | `[DB]` | T-101 → T-102 |
| Booking Core | `[BE]` | T-103 → T-104 → T-105 |
| Staff Bot | `[BE]` | T-106 → T-107 → T-107b
T-107b → T-107c |
| Inngest Lifecycles | `[BE]` | T-108 → T-109 → T-110, T-107 → T-110b
T-110b → T-110c |
| Storefront UI | `[FE]` | T-111 → T-112 → T-113
T-113 → T-113b |
| Verification | `[E2E]` `[DB]` `[BE]` `[SEC]` `[PERF]` `[OPS]` | T-114, T-116, T-117, T-118, T-119 → T-115 |

