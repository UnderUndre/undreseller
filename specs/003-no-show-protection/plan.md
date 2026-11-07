# Implementation Plan: 003 (003-no-show-protection)

> "Депозит — это не жадность. Это компенсация за пустое окно, которое ты больше не продашь." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-08 | **Spec**: rev 1.2 (review fixes: F1–F14 PASS)
**Input**: spec rev 1.2 + requirements-audit (PASS) + research.md (D1–D7) + 002 as-built (`c5f3bf1`)

## Summary

No-show-защита на Stripe-рельсах: (1) deposit-политика per-service (`NONE|FULL_PREPAYMENT`, строго server-side чтение из Product) + PREPAID-ветка в bookingService (atomic HELD + Order c minor-units через Math.round, PaymentIntent после коммита, откат слота при сбое PI); (2) webhook-хендлеры в штатный endpoint плагина (inbox-dedupe `InboxEvent` с Postgres `23505`, ACK-матрица 200/5xx/400, fulfillment через `invariants.ts`); (3) refund-политика (до cutoff `now < startTime - cutoff` — авто Stripe Refund API, после `now >= cutoff` — staff resolution через dedicated API); (4) email-канон Resend REST 0-deps + confirmation/reminder с периодическим крон-свипом и CAS; (5) cancel/reschedule HMAC-токены (защита от сканеров: GET просмотр / POST потребление; атомарный обмен слотов при переносе без потери слота и денег); (6) планировщик — Payload Jobs с обязательным `jobs.autoRun` (минутный крон) и `schedule` на тасках; регистрация коллекций `InboxEvent`, `PaymentEvents`, `EmailDeliveryLog` в `payload.config.ts`.

## Technical Context

**Language/Version**: без изменений (001/002 фундамент, payload 3.93/Next 16/PG16). **Testing**: vitest int + playwright (PREPAID-флоу со Stripe-моками, без реального эквайринга). **Payments**: Stripe SDK уже в дереве (плагин); PaymentIntent + webhooks. **Email**: Resend REST (fetch, 0 deps, `RESEND_FROM_EMAIL`). **Jobs**: Payload Jobs (`tasks` + `schedule` + `autoRun: [{ cron: '* * * * *', queue: 'default' }]`). **Types/DB**: `pnpm generate:types` + DDL миграция.

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
src/collections/Products/index.ts            # MOD: paymentMode (NONE default | FULL_PREPAYMENT) + cancellationCutoffHours
src/lib/booking/bookingService.ts            # MOD: server-side paymentMode derivation, email 422-guard, HELD+Order atomic, PI после коммита, release on PI-fail
src/lib/payments/amounts.ts                  # NEW: priceInUSD → amountMinor (Math.round × 100, assertValidInvoiceAmount)
src/app/api/booking/route.ts                 # MOD: strict server-side validation (NO client paymentMode accepted), 422 EMAIL_REQUIRED
# Phase 2 — webhooks + refund (US2/FR-303/304)
src/plugins/index.ts                         # MOD: stripeAdapter({ webhooks: {...} }) — 4 хендлера
src/lib/payments/webhookHandlers.ts          # NEW: dedupe (InboxEvent c Postgres 23505) → invariants → FSM через сервис
src/collections/InboxEvent.ts                # NEW: (provider, providerRef) unique
src/collections/PaymentEvents.ts             # NEW: ledger (provider, providerRef, amountMinor, currency, raw)
src/lib/booking/refundService.ts             # NEW: Stripe Refund до cutoff / refund_requested статус после
src/app/api/staff/refunds/[id]/route.ts      # NEW: staff approve/reject endpoint (OWNER/OPERATOR)
# Phase 3 — email канон (US3/FR-305/308)
src/lib/email/resendAdapter.ts               # NEW: fetch-клиент, lazy RESEND_API_KEY check, RESEND_FROM_EMAIL
src/collections/EmailDeliveryLog.ts          # NEW: kind, status, salted-hash получателя
src/lib/email/templates.ts                   # NEW: confirmation (cancel/reschedule-ссылки), reminder
src/globals/ShopSettings.ts                  # MOD: fromEmail (fallback для писем)
# Phase 4 — токены самообслуживания (US4/FR-306)
src/lib/booking/tokens.ts                    # NEW: HMAC nonce-hash генерация/верификация (timing-safe)
src/collections/SlotReservations.ts          # MOD: rescheduleTokenHash (nullable), reminderSentAt (nullable)
src/app/booking/cancel/page.tsx              # NEW: клиентская страница подтверждения отмены (GET view, POST submit)
src/app/booking/reschedule/page.tsx          # NEW: страница переноса (GET view, redirect /book с токеном)
src/app/api/booking/[id]/cancel/route.ts     # MOD: GET validate, POST consume + pre-cutoff auto-refund / post-cutoff staff SLA
src/app/api/booking/[id]/reschedule/route.ts # NEW: GET validate, POST atomic exchange (release old on new booking; transfer Order)
src/app/api/booking/acknowledge/route.ts     # NEW: reminder acknowledgement (bump scheduleVersion)
# Phase 5 — планировщик и регистрация (US5/FR-307)
src/jobs/holdSweep.ts                        # NEW: release expired HELD (schedule '*/1 * * * *', lease/idempotent)
src/jobs/reminderJob.ts                      # NEW: periodic sweep (schedule '*/5 * * * *', batch CAS reminderSentAt)
src/payload.config.ts                        # MOD: collections += [InboxEvent, PaymentEvents, EmailDeliveryLog]; jobs.autoRun: [{ cron: '* * * * *', queue: 'default' }], jobs.tasks
# Phase 6 — closeout, types, DDL
tests/int/*.int.spec.ts                      # NEW: prepaid-fsm/webhooks-replay/refund/cas-reminder/tokens/sweep
payload-types.ts                             # GEN: pnpm generate:types
```

## Threat Modeling (STRIDE)

- **S**: webhook-подпись (плагин constructEvent); HMAC-токены timing-safe; почтовые сканеры обезврежены (GET не меняет состояние); RESEND_API_KEY lazy check. **T**: FSM-писатели — только доменный сервис (002-канон); paymentMode берется строго из Product на сервере (клиентский ввод игнорируется); inbox-dedupe против replay на Postgres `23505`. **R**: PaymentEvents ledger + AuditEvents (002) — полная цепочка money-событий. **I**: delivery-log salted-hash; письма без PII в URL (nonce, не телефон). **D**: Stripe retry storm → dedupe; sweep-нагрузка ≤500 MB (NFR-304). **E**: paymentMode — field-access OWNER-only; refund staff API — OWNER/OPERATOR only.

## Rollback

Все изменения — additions (nullable-поля, новые коллекции, новые job'ы); PREPAID-ветка за флагом paymentMode (default NONE = 002-поведение); откат = git + down-collection (Payload auto-migrate).

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Плагинный webhooks-проп ≠ ожиданиям (beta) | низкая | dist прочитан (L1): handler(event, req, stripe), 200-JSON — контракт подтверждён; фоллбэк — свой роут с constructEvent |
| Stripe.js подтверждение в /book ≠ шаблонному чекауту | средняя | переиспользование шаблонного CheckoutPage-паттерна; e2e-моки Stripe |
| Payload Jobs autoRun не запущен | низкая | явная конфигурация `jobs.autoRun` в `payload.config.ts` (D1) + тест на автоматический подхват задач |
| Двойная отправка reminder (гонка воркеров) | низкая | периодический свип + CAS UPDATE (D7) + гоночный тест ×2 воркера |
| Преждевременное освобождение слота при перебронировании | низкая | атомарный обмен слотами в одной транзакции (D6): старый слот освобождается строго при фиксации нового |
| Late webhook после re-book | средняя | FSM `PAID_REQUIRES_RESOLUTION` канон + refund-request (легаси-тесты) |

## Next

`/speckit.tasks` — выполнено: 8 задач, 5 lane'ов (см. tasks.md); closeout — sync barrier.
