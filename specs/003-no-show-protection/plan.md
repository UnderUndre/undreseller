# Implementation Plan: 003 (003-no-show-protection)

> "Депозит — это не жадность. Это компенсация за пустое окно, которое ты больше не продашь." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-07 | **Spec**: rev 1.1 (audit PASS run #2)
**Input**: spec rev 1.1 + requirements-audit (PASS) + research.md (D1–D7) + 002 as-built (`c5f3bf1`)

## Summary

No-show-защита на Stripe-рельсах: (1) deposit-политика per-service (`NONE|FULL_PREPAYMENT`) + PREPAID-ветка в bookingService (atomic HELD + Order c minor-units, PaymentIntent после коммита); (2) webhook-хендлеры в штатный endpoint плагина (inbox-dedupe `InboxEvent`, ACK-матрица 200/5xx/400, fulfillment через `invariants.ts`); (3) refund-политика (до cutoff — авто Stripe Refund, после — staff resolution); (4) email-канон Resend REST 0-deps + confirmation/reminder с CAS; (5) cancel/reschedule HMAC-токены (one-time, cutoff 3h); (6) планировщик — Payload Jobs (hold-sweep, reminder-job; framework уже включён с 002).

## Technical Context

**Language/Version**: без изменений (001/002 фундамент, payload 3.93/Next 16/PG16). **Testing**: vitest int + playwright (PREPAID-флоу со Stripe-моками, без реального эквайринга). **Payments**: Stripe SDK уже в дереве (плагин); PaymentIntent + webhooks. **Email**: Resend REST (fetch, 0 deps). **Jobs**: Payload Jobs (`tasks` + `schedule`; `jobs.tasks: []` уже в config).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 002 |
| VI | ON TRACK | analyze + внутренние ревью; ≥2 external до implement |
| VII | PASS | теги батчем на коммите контура (канон 001/002) |
| VII-B | PASS (waiver приложен) | `business-plan-waiver.md` на диске; платёжные рельсы — план v2.5.0 как есть |
| IX | DEVIATION (lineage) | как 001/002 |
| X | PASS | только additions (nullable-поля, новые коллекции); DDL — Payload auto-migrate Expand-only |
| XI | PASS | 0 спайков (все D-решения верифицированы по dist плагина / docs) |
| XII | **ON TRACK — money-критично** | FR-302/303 Risk=20 → DT+STM+Exploratory+UAT обязательны |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
# Phase 1 — deposit policy + PREPAID booking (US1/FR-301/302/308)
src/collections/Products/index.ts       # MOD: paymentMode (NONE default | FULL_PREPAYMENT) + cancellationCutoffHours
src/lib/booking/bookingService.ts       # MOD: PREPAID-ветка (email 422-guard, HELD+Order atomic, PI после коммита)
src/lib/payments/amounts.ts             # NEW: priceInUSD → amountMinor (×100, assertValidInvoiceAmount)
src/app/api/booking/route.ts            # MOD: paymentMode-проброс, 422 EMAIL_REQUIRED
# Phase 2 — webhooks + refund (US2/FR-303/304)
src/plugins/index.ts                    # MOD: stripeAdapter({ webhooks: {...} }) — 4 хендлера
src/lib/payments/webhookHandlers.ts     # NEW: dedupe (InboxEvent) → invariants → FSM через сервис
src/collections/InboxEvent.ts           # NEW: (provider, providerRef) unique
src/collections/PaymentEvents.ts        # NEW: ledger (provider, providerRef, amountMinor, currency, raw)
src/lib/booking/refundService.ts        # NEW: Stripe Refund до cutoff / refund-request после
# Phase 3 — email канон (US3/FR-305/308)
src/lib/email/resendAdapter.ts          # NEW: fetch-клиент, RESEND_API_KEY fail-closed
src/collections/EmailDeliveryLog.ts     # NEW: kind, status, salted-hash получателя
src/lib/email/templates.ts              # NEW: confirmation (cancel/reschedule-ссылки), reminder
# Phase 4 — токены самообслуживания (US4/FR-306)
src/lib/booking/tokens.ts               # NEW: HMAC nonce-hash генерация/верификация (timing-safe)
src/collections/SlotReservations.ts     # MOD: rescheduleTokenHash (nullable), reminderSentAt (nullable)
src/app/api/booking/[id]/reschedule/route.ts # NEW: consume-токен → redirect /book с prefill
src/app/api/booking/acknowledge/route.ts     # NEW: reminder acknowledgement (bump scheduleVersion)
# Phase 5 — планировщик (US5/FR-307)
src/jobs/holdSweep.ts                   # NEW: release expired HELD (TTL 15m, lease/idempotent)
src/jobs/reminderJob.ts                 # NEW: за confirmationNoticeHours, CAS reminderSentAt
src/payload.config.ts                   # MOD: jobs.tasks регистрация
# Phase 6 — closeout
tests/int/*.int.spec.ts                 # NEW: prepaid-fsm/webhooks-replay/refund/cas-reminder/tokens/sweep
```

## Threat Modeling (STRIDE)

- **S**: webhook-подпись (плагин constructEvent); HMAC-токены timing-safe; RESEND_API_KEY fail-closed. **T**: FSM-писатели — только доменный сервис (002-канон); inbox-dedupe против tamper-by-replay. **R**: PaymentEvents ledger + AuditEvents (002) — полная цепочка money-событий. **I**: delivery-log salted-hash; письма без PII в URL (nonce, не телефон). **D**: Stripe retry storm → dedupe; sweep-нагрузка ≤500 MB (NFR-304). **E**: paymentMode — field-access OWNER-only; refund-request — staff API.

## Rollback

Все изменения — additions (nullable-поля, новые коллекции, новые job'ы); PREPAID-ветка за флагом paymentMode (default NONE = 002-поведение); откат = git + down-collection (Payload auto-migrate).

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Плагинный webhooks-проп ≠ ожиданиям (beta) | низкая | dist прочитан (L1): handler(event, req, stripe), 200-JSON — контракт подтверждён; фоллбэк — свой роут с constructEvent |
| Stripe.js подтверждение в /book ≠ шаблонному чекауту | средняя | переиспользование шаблонного CheckoutPage-паттерна; e2e-моки Stripe |
| Payload Jobs lease при долгом Resend-фetch | низкая | таймаут fetch 10s; retry ≤5 встроенный |
| Двойная отправка reminder (гонка воркеров) | низкая | CAS UPDATE (D7) + гоночный тест ×2 воркера |
| Late webhook после re-book | средняя | FSM `PAID_REQUIRES_RESOLUTION` канон + refund-request (легаси-тесты) |

## Next

`/speckit.tasks` → 11 задач, 4 lane'а; closeout — sync barrier.
