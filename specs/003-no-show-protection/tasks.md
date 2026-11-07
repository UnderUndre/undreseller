# Tasks: 003 (003-no-show-protection)

**Input**: spec rev 1.2, plan.md, research.md (D1–D7), requirements-audit PASS (run #2), review fixes (F1–F14 PASS)
**Organization**: Phase 1 deposit+PREPAID → Phase 2 webhooks+refund → Phase 3 email → Phase 4 tokens → Phase 5 jobs → closeout.

## Phase 1: Deposit policy + PREPAID booking (US1)

- [ ] T310 [BE] [US1] FR-301/308: Product `paymentMode` (NONE default) + `cancellationCutoffHours` (default 3); `amounts.ts` (priceInUSD → amountMinor с Math.round, `assertValidInvoiceAmount`); строгое server-side извлечение paymentMode в `bookingService` (клиентский ввод игнорируется); booking API 422 `EMAIL_REQUIRED` для FULL_PREPAYMENT без email; `pnpm generate:types`; DT-тесты paymentMode × email × track
- [ ] T311 [BE] [US1] FR-302: PREPAID-ветка `bookingService` (atomic HELD+holdExpiresAt=now+15m + Order amount=minor + AuditEvent в drizzle-транзакции с advisory lock; PI-create после коммита, paymentIntentID в stripe-группу; PI-failure → немедленный release в RELEASED + 502 PAYMENT_INIT_FAILED); STM-сьют PREPAID-матрицы (hold→pay→confirm / expire / late→PAID_REQUIRES_RESOLUTION) — Risk 20

## Phase 2: Webhooks + refund (US2)

- [ ] T320 [BE] [US2] FR-303: Создание и регистрация в `payload.config.ts.collections` коллекций `InboxEvent` (provider+providerRef unique) и `PaymentEvents` ledger; `webhookHandlers.ts` (dedupe по Postgres коду `23505` → `assertProviderAmountMatch` → FSM через сервис); регистрация в `stripeAdapter({ webhooks })`; ACK-матрица тесты: replay ×100 → 1 ledger-row + 200; tampered → 400; БД-сбой → 5xx → ретрай → идемпотентная до-обработка; AMOUNT_MISMATCH-ветка — Risk 20
- [ ] T321 [BE] [US2] FR-304: `refundService` (Stripe Refund до cutoff `now < startTime - cancellationCutoffHours`; после cutoff → Order `refund_requested`); создание staff роута `POST /api/staff/refunds/[id]/route.ts` (approve/reject, доступ OWNER/OPERATOR); webhook `charge.refunded` → REFUNDED; BVA cutoff ±1мин (exclusive boundary); DT refund-веток

## Phase 3: Email канон (US3)

- [ ] T330 [BE] [US3] FR-305: Создание и регистрация в `payload.config.ts.collections` коллекции `EmailDeliveryLog` (salted-hash); `resendAdapter.ts` (fetch, lazy RESEND_API_KEY check, адрес `RESEND_FROM_EMAIL` с fallback на `ShopSettings.fromEmail`, timeout 10s); templates (confirmation c cancel/reschedule-ссылками, reminder); EP-тесты (email presence × paymentMode — FR-308 матрица)

## Phase 4: Токены самообслуживания (US4)

- [ ] T340 [BE] [US4] FR-306: `tokens.ts` (HMAC nonce, timing-safe); `rescheduleTokenHash` на SlotReservation; защита от сканеров (GET страница/валидация, POST потребление токена); `src/app/api/booking/[id]/cancel/route.ts` (GET validate, POST cancel); `src/app/api/booking/[id]/reschedule/route.ts` (атомарный обмен слотами: старый слот переходит в RELEASED только при фиксации нового слота, перенос Order для PREPAID без повторного списания); `POST /api/booking/acknowledge` (bump scheduleVersion); token-матрица valid/expired/replayed/after-cutoff ×100 replay

## Phase 5: Планировщик (US5)

- [ ] T350 [BE] [US5] FR-307: `jobs/holdSweep.ts` (schedule '*/1 * * * *', release expired HELD, lease) + `jobs/reminderJob.ts` (schedule '*/5 * * * *', periodic sweep + CAS `reminderSentAt` UPDATE-канон D7) + **обязательная конфигурация `jobs.autoRun: [{ cron: '* * * * *', queue: 'default' }]` и `jobs.tasks` в `src/payload.config.ts`**; тесты: запуск воркера по крону; рестарт-воркера не дублирует sweep; гонка 2 воркеров reminder → 1 отправка; NFR-304 замер памяти в evidence

## Phase 6: Closeout

- [ ] T360 [SETUP] Регрессия: `pnpm generate:types`, валидация DDL-миграций, полный гейт 0 exit (validate/lint/int/build), 72+ старых зелёные, evidence (ACK-матрица лог, CAS-гонка лог, autoRun воркер лог, memory-замер), tasks-статусы

## Dependency Graph

```
T310 → T311
T311 → T320
T320 → T321
T310 → T330
T330 → T340
T311 → T350
T321, T340, T350 → T360
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T310 → T311 → T320 → T321 → T360 (6 задач). **Total**: 8 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T310 → T311 | — |
| 2 | T320 → T321 | T311 |
| 3 | T330 → T340 | T310 (T330) |
| 4 | T350 | T311 |
| 5 | T360 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T310, T311, T320, T321, T330, T340, T350 |
| [SETUP] | T360 |

## Notes
- TDD-Lite; money-path (T311/T320) — Risk 20 → STM+DT+Error Guessing обязательны до кода; error-catalog codes (EMAIL_REQUIRED/PAYMENT_INIT_FAILED/AMOUNT_MISMATCH/TOKEN_ALREADY_CONSUMED/CUTOFF_PASSED/REFUND_FAILED) — снапшот-сьют расширяется.

