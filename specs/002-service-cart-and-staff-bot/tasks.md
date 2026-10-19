# Tasks: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

---

## Phase 1: Database & Schema

- [ ] `T-101` `[DB]` Update `prisma/schema.prisma` with `totalDurationMin` on `SlotReservation`, `customerNotes`, `paymentType`, `confirmationStatus`, `autoCancelOnNoConfirmation` on `Order`, and configuration fields on `ShopSettings` (`slotGridStepMin`, `confirmationNoticeHours`, `autoCancelDeadlineHours`, `autoCancelForNewClients`, `allowPayOnSite`, `prepaymentTiming`, `staffChatId`).
- [ ] `T-102` `[DB]` Generate and write SQL migration `20261019000000_multi_service_cart` updating `slot_no_overlap` exclusion constraint to calendar level (`tstzrange("startTime", "endTime")`) and write safe `down.sql`.

## Phase 2: Booking Core & Cart Service

- [ ] `T-103` `[BE]` `[US1]` `lib/booking/cart.ts`: validate cart items (max 10 items ceiling), sum `totalDurationMin` and `totalMinor`.
- [ ] `T-104` `[BE]` `[US1]` `lib/booking/windows.ts` update: support `itemIds: string[]`, generate 30-min grid intervals (`slotGridStepMin`), filter contiguous windows of length `totalDurationMin` against reservations and breaks.
- [ ] `T-105` `[BE]` `[US1]` `lib/booking/lock.ts` + `POST /api/booking/lock` update: multi-service booking lock with global calendar advisory lock, `customerNotes` persistence, blacklist enforcement (rejects blocked Telegram ID or phone with HTTP 403 Forbidden), and client history segmentation (`autoCancelOnNoConfirmation = true` for new clients).

## Phase 3: Dedicated Staff Bot

- [ ] `T-106` `[BE]` `[US2]` `lib/bot/staffBot.ts`: grammY bot instance for staff (`STAFF_BOT_TOKEN`), order card formatter, inline keyboard (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`), and HMAC-signed Magic Reschedule link generator.
- [ ] `T-107` `[BE]` `[US2]` `POST /api/bot/staff/webhook`: secret verification (`STAFF_WEBHOOK_SECRET`), staff authorization (`ctx.from.id == staffChatId`), action handlers (approve, reject, reschedule, and blacklist blocking `MessengerContact.isBlocked = true` and cancelling order with `CANCELLED_BLOCKED`), plus `POST /api/admin/users/unblock` for manual unbanning.

## Phase 4: Confirmation & Smart Auto-Cancellation (Inngest)

- [ ] `T-108` `[BE]` `[US3]` Inngest function `appointmentReminderJob` in `lib/jobs/inngest.ts`: sleeps until `startTime - confirmationNoticeHours`, dispatches omnichannel push (Telegram for TMA/TG clients, WhatsApp Cloud API template for phone-based clients) with confirmation buttons.
- [ ] `T-109` `[BE]` `[US3]` Client bot response handler for confirmation buttons (`[Подтверждаю]` -> `CLIENT_CONFIRMED`, `[Не смогу]` -> `CANCELLED_BY_CLIENT`, alerts staff bot).
- [ ] `T-110` `[BE]` `[US3]` Inngest function `autoCancelUnconfirmedJob` in `lib/jobs/inngest.ts`: checks unconfirmed bookings at `startTime - autoCancelDeadlineHours`, auto-cancels unconfirmed bookings for new clients, alerts staff and client.

## Phase 5: Storefront UI & TMA

- [ ] `T-111` `[FE]` `[US1]` `components/catalog/CartDrawer.tsx`: multi-service selection drawer, total duration and price display, and checkout trigger.
- [ ] `T-112` `[FE]` `[US1]` `components/booking/SlotGrid.tsx` update: multi-service slot display with 30-min step, `customerNotes` input with fixed-price disclaimer, pay-on-site radio selection.
- [ ] `T-113` `[FE]` `[US4]` `components/checkout/CheckoutModal.tsx` & `app/checkout/page.tsx` update: support `PAY_ON_SITE` without gateway redirection, and configurable prepayment timing (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL`).

## Phase 6: Quality Gates & Tests

- [ ] `T-114` `[E2E]` Unit tests in `tests/unit/multi-service-cart.test.ts`: multi-service contiguous window calculations, new-client auto-cancel logic, staff-bot action idempotency, and blacklist 403 rejection tests.
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
T-103 + T-104 → T-111
T-111 + T-105 → T-112
T-112 → T-113
T-105 + T-107 + T-110 + T-113 → T-114
T-114 → T-115
```

## Parallel lanes

| Lane | Tag | Sequence |
|---|---|---|
| Database | `[DB]` | T-101 → T-102 |
| Booking Core | `[BE]` | T-103 → T-104 → T-105 |
| Staff Bot | `[BE]` | T-106 → T-107 |
| Inngest Lifecycles | `[BE]` | T-108 → T-109 → T-110 |
| Storefront UI | `[FE]` | T-111 → T-112 → T-113 |
| Verification | `[E2E]` `[SEC]` `[OPS]` | T-114 → T-115 |
