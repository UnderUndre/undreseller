# Tasks: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

---

## Phase 1: Database & Schema

- [ ] `T-101` `[DB]` Update `prisma/schema.prisma` with `resourceId` (default `"default_master"`), nullable `itemId`, and `totalDurationMin` on `SlotReservation`; `customerNotes`, `paymentType`, `confirmationStatus`, `cancellationReason`, `refundStatus`, `autoCancelOnNoConfirmation`, `scheduleVersion`, `rescheduleTokenHash`, `rescheduleTokenConsumedAt`, `invoiceExpiresAt`, `staffMessageId`, `staffChatId` on `Order`; `PAYMENT_EXPIRED`, `PAID_REQUIRES_RESOLUTION` on `OrderStatus`; and configuration fields on `ShopSettings` (`slotGridStepMin`, `confirmationNoticeHours`, `autoCancelDeadlineHours`, `autoCancelForNewClients`, `allowPayOnSite`, `prepaymentTiming`, `staffDestinationChatId`, `authorizedStaffUserIds`). Add `ExternalIntegration`/`enabledExternalIntegration`; phone verification/risk fields; outbox bot/chat/priority/dedupe/lease/nextAttemptAt/reconciliation fields.
- [ ] `T-102` `[DB]` Generate and write SQL migration `20261019000000_multi_service_cart` with DDL lock timeout guards (`SET statement_timeout = '5s'; SET lock_timeout = '2s'` with retry backoff), preflight collision detection query (`r1.id < r2.id`), actual duration backfill (`UPDATE "SlotReservation" SET "totalDurationMin" = EXTRACT(EPOCH FROM ("endTime" - "startTime")) / 60 WHERE "totalDurationMin" = 0 OR "totalDurationMin" IS NULL`), resource-level GiST exclusion constraint (`slot_resource_no_overlap`), dropping legacy `slot_no_overlap`, and safe `down.sql`.

## Phase 2: Booking Core & Cart Service

- [ ] `T-103` `[BE]` `[US1]` `lib/booking/cart.ts`: validate cart items (max 10 items ceiling, positive durations, single currency), sum `totalDurationMin` and `totalMinor`.
- [ ] `T-104` `[BE]` `[US1]` `lib/booking/windows.ts` update: support `itemIds: string[]` and `resourceId`, generate 30-min grid intervals (`slotGridStepMin`), filter contiguous windows of length `totalDurationMin` against reservations and breaks.
- [ ] `T-105` [BE] [US1] Update booking lock with stable-identity blacklist enforcement. Implement phone OTP (10-minute TTL, rate/attempt limits), persist phoneVerifiedAt, key permanent blocks by Telegram ID/customerId, route phone-only matches to MANUAL_REVIEW, expire risk markers after 90 days, and audit rebind/unblock.

## Phase 3: Dedicated Staff Bot

- [ ] `T-106` `[BE]` `[US2]` `lib/bot/staffBot.ts`: grammY bot instance for staff (`STAFF_BOT_TOKEN`), order card formatter with masked phone (`+7 *** *** 4567`), 5 action buttons (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Заказ выполнен]`), and HMAC-signed single-use Magic Reschedule link generator with `nonce`, `expiresAt`, `rescheduleTokenHash`, and `scheduleVersion`.
- [ ] `T-107` [BE] [US2] Staff webhook authorization and action-specific CAS. All Telegram sends/edits/deletes enqueue to the shared durable dispatcher; redaction and terminal keyboard removal use highest priority and stable dedupe keys. Add audited unblock.
- [ ] `T-107b` `[BE]` `[US4]` Provider refund & reconciliation workflow: implement idempotent refund action (`POST /api/admin/orders/[id]/refund`) via provider API (Stars refund, NOWPayments payout/refund reconciliation), transition `refundStatus = REFUNDED`, record negative `PaymentEvent`, and audit operator SLA.
- [ ] `T-107c` `[BE]` `[OPS]` Build one durable Telegram dispatcher per bot token with persisted bot-wide/per-chat shaping, shared 429 cooldown from parameters.retry_after, priority scheduling with starvation protection, atomic leases, timeout reconciliation and queue metrics.

## Phase 4: Confirmation, Auto-Cancellation & Invoicing (Inngest)

- [ ] `T-108` `[BE]` `[US3]` Inngest function `appointmentReminderJob` in `lib/jobs/inngest.ts`: with 4 `cancelOn` triggers (`order/cancelled`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`), sleep until `startTime - confirmationNoticeHours`, wake-up CAS check (`scheduleVersion`), and omnichannel dispatch (Telegram for TMA/TG clients, WhatsApp Cloud API template for phone-based clients).
- [ ] `T-109` `[BE]` `[US3]` Client response handler for confirmation buttons (`[Подтверждаю]` -> `CLIENT_CONFIRMED`, `[Не смогу]` -> `CLIENT_DECLINED`, alerts staff bot).
- [ ] `T-110` `[BE]` `[US3]` Inngest function `autoCancelUnconfirmedJob` in `lib/jobs/inngest.ts`: with 4 `cancelOn` triggers (`order/cancelled`, `order/client-confirmed`, `order/rescheduled`, `order/fulfilled`), sleep until `startTime - autoCancelDeadlineHours`, wake-up CAS check (`scheduleVersion`), auto-cancels unconfirmed bookings for new clients (`cancellationReason = 'AUTO_CANCELLED_NO_CONFIRMATION'`), alerts staff and client.
- [ ] `T-110b` `[BE]` `[US4]` Inngest function `invoiceExpiryJob` in `lib/jobs/inngest.ts`: handles 15-minute invoice window for `AFTER_STAFF_APPROVAL` with 3 `cancelOn` triggers (`order/paid`, `order/cancelled`, `order/rescheduled`). If unpaid after 15 minutes, transitions order to `PAYMENT_EXPIRED` (`cancellationReason = 'PAYMENT_EXPIRED'`) and releases reservation (`RELEASED`). Handles late webhooks without funds loss (`PAID_REQUIRES_RESOLUTION` / `OVERBOOKED_MANUAL_RESOLUTION` with `refundStatus = 'REFUND_REQUESTED'` and 24h operator SLA).

## Phase 5: Storefront UI & TMA

- [ ] `T-111` `[FE]` `[US1]` `components/catalog/CartDrawer.tsx`: multi-service selection drawer, total duration and price display, and checkout trigger.
- [ ] `T-112` `[FE]` `[US1]` `components/booking/SlotGrid.tsx` update: multi-service slot display with 30-min step, `customerNotes` input with fixed-price disclaimer, pay-on-site radio selection.
- [ ] `T-113` `[FE]` `[US4]` `components/checkout/CheckoutModal.tsx` & `app/checkout/page.tsx` update: support `PAY_ON_SITE` without gateway redirection, and configurable prepayment timing (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL`).
- [ ] `T-113b` `[FE]` `[OPS]` Implement fail-closed enabledExternalIntegration enforcement: conditional routes/jobs/UI, startup/readiness failure on mixed provider credentials, CI matrix for NONE/single/invalid mixed profiles, and deployment/SOW evidence.

## Phase 6: Quality Gates & Comprehensive Tests

- [ ] `T-114` `[E2E]` Unit tests in `tests/unit/multi-service-cart.test.ts`: multi-service contiguous window calculations, 30-min grid step, slot break/conflict filtering.
- [ ] `T-116` `[DB]` `[E2E]` Integration test for PostgreSQL GiST exclusion: concurrent booking collisions on overlapping multi-service windows return 409 (`23P01`), DDL lock timeout verification with retry policy, and safe `down.sql` rollback test. Add concurrent same-resource and different-resource insert load; assert no deadlocks and bounded pool wait.
- [ ] `T-117` `[BE]` Inngest sleep race condition & CAS tests: verify Inngest cancelOn triggers are strictly <= 4 events per function, stale runs aborted on rescheduled/cancelled orders, 15-minute invoice timeout test, refundStatus transition and reconciliation tests, Telegram PII redaction test on order completion and GDPR purge. Add Telegram burst tests for shared send/edit pressure, persisted retry_after, priority redaction, lease recovery, dedupe and zero lost terminal projections.
- [ ] `T-118` `[SEC]` Staff bot authorization test (unauthorized group member callback rejected with alert), Magic Reschedule link single-use and tamper rejection test, blacklist 403 lock rejection test.
- [ ] `T-119` [PERF] Benchmark p95 < 50ms and <=500 MB under combined load: two bots, Inngest, PDF parsing, 100 concurrent bookings and non-empty Telegram outbox; capture peak/steady RSS, queue growth and OOM/restart as FAIL.
- [ ] `T-115` `[SEC]` `[OPS]` Final constitutional quality gate: `npm run validate`, `npm test`, `npm run build`, license audit, telemetry redaction verification.

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
T-103 + T-104 → T-111
T-111 + T-105 → T-112
T-112 → T-113
T-113 → T-113b
T-105 + T-107 + T-107b + T-110 + T-110b + T-113 → T-114
T-102 + T-105 → T-116
T-108 + T-110 + T-110b + T-107 + T-107b + T-107c → T-117
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
| Inngest Lifecycles | `[BE]` | T-108 → T-109 → T-110, T-107 → T-110b |
| Storefront UI | `[FE]` | T-111 → T-112 → T-113
T-113 → T-113b |
| Verification | `[E2E]` `[DB]` `[BE]` `[SEC]` `[PERF]` `[OPS]` | T-114, T-116, T-117, T-118, T-119 → T-115 |

