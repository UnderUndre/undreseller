# Tasks: 003 (003-no-show-protection)

**Input**: spec rev 1.1, plan.md, research.md (D1–D7), requirements-audit PASS (run #2)
**Organization**: Phase 1 deposit+PREPAID → Phase 2 webhooks+refund → Phase 3 email → Phase 4 tokens → Phase 5 jobs → closeout.

## Phase 1: Deposit policy + PREPAID booking (US1)

- [ ] T310 [BE] [US1] FR-301/308: Product `paymentMode` (NONE default) + `cancellationCutoffHours` (default 3); `amounts.ts` (priceInUSD → amountMinor, `assertValidInvoiceAmount`); booking API 422 `EMAIL_REQUIRED` для FULL_PREPAYMENT без email; DT-тесты paymentMode × email × track
- [ ] T311 [BE] [US1] FR-302: PREPAID-ветка `bookingService` (atomic HELD+holdExpiresAt=now+15m + Order amount=minor + AuditEvent в drizzle-транзакции с advisory lock; PI-create после коммита, paymentIntentID в stripe-группу; PI-failure → 502 PAYMENT_INIT_FAILED, sweep-путь); STM-сьют PREPAID-матрицы (hold→pay→confirm / expire / late→PAID_REQUIRES_RESOLUTION) — Risk 20

## Phase 2: Webhooks + refund (US2)

- [ ] T320 [BE] [US2] FR-303: `InboxEvent` (provider+providerRef unique) + `PaymentEvents` ledger; `webhookHandlers.ts` (dedupe → `assertProviderAmountMatch` → FSM через доменный сервис); регистрация в `stripeAdapter({ webhooks })`; ACK-матрица тесты: replay ×100 → 1 ledger-row + 200; tampered → 400; БД-сбой → 5xx → ретрай → идемпотентная до-обработка; AMOUNT_MISMATCH-ветка — Risk 20
- [ ] T321 [BE] [US2] FR-304: `refundService` (Stripe Refund до cutoff при customer-cancel; сбой → REFUND_FAILED + alert; после cutoff → refund_requested + staff approve/reject API; webhook `charge.refunded` → REFUNDED); BVA cutoff ±1мин; DT refund-веток

## Phase 3: Email канон (US3)

- [ ] T330 [BE] [US3] FR-305: `resendAdapter.ts` (fetch, RESEND_API_KEY fail-closed, timeout 10s) + `EmailDeliveryLog` (salted-hash) + templates (confirmation c cancel/reschedule-ссылками, reminder); EP-тесты (email presence × paymentMode — FR-308 матрица)

## Phase 4: Токены самообслуживания (US4)

- [ ] T340 [BE] [US4] FR-306: `tokens.ts` (HMAC nonce, timing-safe); `rescheduleTokenHash` на SlotReservation; consume = атомарный SQL UPDATE (одноразовость); `POST /api/booking/[id]/reschedule` (cutoff-guard → invalidate → redirect prefill) + acknowledge-эндпоинт (bump scheduleVersion); token-матрица valid/expired/replayed/after-cutoff ×100 replay

## Phase 5: Планировщик (US5)

- [ ] T350 [BE] [US5] FR-307: `jobs/holdSweep.ts` (release expired HELD, idempotencyKey=bookingId, lease) + `jobs/reminderJob.ts` (CAS `reminderSentAt` UPDATE-канон D7, за confirmationNoticeHours) + регистрация `jobs.tasks` в payload.config; тесты: рестарт-воркера не дублирует sweep; гонка 2 воркеров reminder → 1 отправка; NFR-304 замер памяти в evidence

## Phase 6: Closeout

- [ ] T360 [SETUP] Регрессия: полный гейт 0 exit (validate/lint/int/build), 72+ старых зелёные, evidence (ACK-матрица лог, CAS-гонка лог, memory-замер), tasks-статусы

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
