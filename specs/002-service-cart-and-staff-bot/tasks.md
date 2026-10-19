# Tasks: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

---

## Phase 1: Database & Schema

- [ ] `T-101` `[DB]` Update `prisma/schema.prisma` with `resourceId` (default `"default_master"`), nullable `itemId`, and `totalDurationMin` on `SlotReservation`; `customerNotes`, `paymentType`, `confirmationStatus`, `cancellationReason`, `refundStatus`, `autoCancelOnNoConfirmation`, `scheduleVersion`, `rescheduleTokenHash`, `rescheduleTokenConsumedAt`, `invoiceExpiresAt`, `staffMessageId`, `staffChatId` on `Order`; `PAYMENT_EXPIRED`, `PAID_REQUIRES_RESOLUTION` on `OrderStatus`; and configuration fields on `ShopSettings` (`slotGridStepMin`, `confirmationNoticeHours`, `autoCancelDeadlineHours`, `autoCancelForNewClients`, `allowPayOnSite`, `prepaymentTiming`, `staffDestinationChatId`, `authorizedStaffUserIds`).
- [ ] `T-102` `[DB]` Generate and write SQL migration `20261019000000_multi_service_cart` with DDL lock timeout guards (`SET statement_timeout = '5s'; SET lock_timeout = '2s'`), preflight collision detection query, resource-level GiST exclusion constraint (`slot_resource_no_overlap`), dropping legacy `slot_no_overlap`, and safe `down.sql`.

## Phase 2: Booking Core & Cart Service

- [ ] `T-103` `[BE]` `[US1]` `lib/booking/cart.ts`: validate cart items (max 10 items ceiling, positive durations, single currency), sum `totalDurationMin` and `totalMinor`.
- [ ] `T-104` `[BE]` `[US1]` `lib/booking/windows.ts` update: support `itemIds: string[]` and `resourceId`, generate 30-min grid intervals (`slotGridStepMin`), filter contiguous windows of length `totalDurationMin` against reservations and breaks.
- [ ] `T-105` `[BE]` `[US1]` `lib/booking/lock.ts` + `POST /api/booking/lock` update: multi-service booking lock with resource-scoped advisory lock (`acquireResourceSlotLock`), `customerNotes` persistence, blacklist enforcement (rejects blocked Telegram ID or phone with HTTP 403 Forbidden), and client history segmentation (`autoCancelOnNoConfirmation = true` for new clients).

## Phase 3: Dedicated Staff Bot

- [ ] `T-106` `[BE]` `[US2]` `lib/bot/staffBot.ts`: grammY bot instance for staff (`STAFF_BOT_TOKEN`), order card formatter with masked phone (`+7 *** *** 4567`), 5 action buttons (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Заказ выполнен]`), and HMAC-signed single-use Magic Reschedule link generator with `nonce`, `expiresAt`, `rescheduleTokenHash`, and `scheduleVersion`.
- [ ] `T-107` `[BE]` `[US2]` `POST /api/bot/staff/webhook`: secret verification (`STAFF_WEBHOOK_SECRET`), role separation checking `staffDestinationChatId` AND `authorizedStaffUserIds.includes(ctx.from.id)`, action handlers (approve, reject, reschedule, blacklist `CANCELLED`, and `FULFILLED`), Telegram PII redaction (`editMessageText` to `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` with failed-redaction retry queue), and `POST /api/admin/users/unblock`.

## Phase 4: Confirmation, Auto-Cancellation & Invoicing (Inngest)

- [ ] `T-108` `[BE]` `[US3]` Inngest function `appointmentReminderJob` in `lib/jobs/inngest.ts`: with unambiguous `cancelOn` triggers (`order/cancelled`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`, `order/payment-expired`), sleep until `startTime - confirmationNoticeHours`, wake-up CAS check (`scheduleVersion`), and omnichannel dispatch (Telegram for TMA/TG clients, WhatsApp Cloud API template for phone-based clients).
- [ ] `T-109` `[BE]` `[US3]` Client response handler for confirmation buttons (`[Подтверждаю]` -> `CLIENT_CONFIRMED`, `[Не смогу]` -> `CLIENT_DECLINED`, alerts staff bot).
- [ ] `T-110` `[BE]` `[US3]` Inngest function `autoCancelUnconfirmedJob` in `lib/jobs/inngest.ts`: with `cancelOn` triggers (`order/cancelled`, `order/client-confirmed`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`, `order/payment-expired`), sleep until `startTime - autoCancelDeadlineHours`, wake-up CAS check (`scheduleVersion`), auto-cancels unconfirmed bookings for new clients (`cancellationReason = 'AUTO_CANCELLED_NO_CONFIRMATION'`), alerts staff and client.
- [ ] `T-110b` `[BE]` `[US4]` Inngest function `invoiceExpiryJob` in `lib/jobs/inngest.ts`: handles 15-minute invoice window for `AFTER_STAFF_APPROVAL` with `cancelOn: [order/paid, order/cancelled, order/rescheduled]`. If unpaid after 15 minutes, transitions order to `PAYMENT_EXPIRED` (`cancellationReason = 'PAYMENT_EXPIRED'`) and releases reservation (`RELEASED`). Handles late webhooks without funds loss (`PAID_REQUIRES_RESOLUTION` / `OVERBOOKED_MANUAL_RESOLUTION` with 24h operator SLA).

## Phase 5: Storefront UI & TMA

- [ ] `T-111` `[FE]` `[US1]` `components/catalog/CartDrawer.tsx`: multi-service selection drawer, total duration and price display, and checkout trigger.
- [ ] `T-112` `[FE]` `[US1]` `components/booking/SlotGrid.tsx` update: multi-service slot display with 30-min step, `customerNotes` input with fixed-price disclaimer, pay-on-site radio selection.
- [ ] `T-113` `[FE]` `[US4]` `components/checkout/CheckoutModal.tsx` & `app/checkout/page.tsx` update: support `PAY_ON_SITE` without gateway redirection, and configurable prepayment timing (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL`).

## Phase 6: Quality Gates & Comprehensive Tests

- [ ] `T-114` `[E2E]` Unit tests in `tests/unit/multi-service-cart.test.ts`: multi-service contiguous window calculations, 30-min grid step, slot break/conflict filtering.
- [ ] `T-116` `[DB]` `[E2E]` Integration test for PostgreSQL GiST exclusion: concurrent booking collisions on overlapping multi-service windows return 409 (`23P01`), DDL lock timeout verification, and safe `down.sql` rollback test.
- [ ] `T-117` `[BE]` Inngest sleep race condition & CAS tests: verify stale runs aborted on rescheduled/cancelled orders, 15-minute invoice timeout test, Telegram PII redaction test on order completion and GDPR purge.
- [ ] `T-118` `[SEC]` Staff bot authorization test (unauthorized group member callback rejected with alert), Magic Reschedule link single-use and tamper rejection test, blacklist 403 lock rejection test.
- [ ] `T-119` `[PERF]` Latency benchmark for slot calculation (p95 < 50ms) and memory ceiling verification (<= 500 MB RAM).
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
T-105 → T-108
T-108 → T-109
T-109 → T-110
T-107 → T-110b
T-103 + T-104 → T-111
T-111 + T-105 → T-112
T-112 → T-113
T-105 + T-107 + T-110 + T-110b + T-113 → T-114
T-102 + T-105 → T-116
T-108 + T-110 + T-110b + T-107 → T-117
T-105 + T-106 + T-107 → T-118
T-104 + T-114 → T-119
T-114 + T-116 + T-117 + T-118 + T-119 → T-115
```

## Parallel lanes

| Lane | Tag | Sequence |
|---|---|---|
| Database | `[DB]` | T-101 → T-102 |
| Booking Core | `[BE]` | T-103 → T-104 → T-105 |
| Staff Bot | `[BE]` | T-106 → T-107 |
| Inngest Lifecycles | `[BE]` | T-108 → T-109 → T-110, T-107 → T-110b |
| Storefront UI | `[FE]` | T-111 → T-112 → T-113 |
| Verification | `[E2E]` `[DB]` `[BE]` `[SEC]` `[PERF]` `[OPS]` | T-114, T-116, T-117, T-118, T-119 → T-115 |

