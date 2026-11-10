# Tasks: 006 (006-waitlist-autofill)

**Input**: spec rev 1.1, plan.md, research.md (D1–D6), requirements-audit PASS (run #2)
**Organization**: Phase 1 коллекция+join → Phase 2 матчинг+claim → Phase 3 lifecycle+UI → closeout.

## Phase 1: Коллекция + join (US1)

- [ ] T610 [BE] [US1] FR-601: `Waitlist` коллекция (customerName/phone/email/serviceId/resourceId/expiresAt/status waiting|notified|converted|expired|cancelled/campaignCount/activeCampaignAt); `waitlistService.join` (валидация future-service, кап 3 активных/телефон, дубль → 409 WAITLIST_DUPLICATE, advisory `waitlist_join_${phone}`); `POST /api/waitlist` (rate limit 10/60s) + audit `waitlist.join`; DT-тесты: кап/дубли/прошедшая услуга 422
- [ ] T611 [BE] [FR-604/D2] `claimToken.ts` (вычислимый HMAC `waitlist:v<campaign>:<entryId>`, timing-safe); `EmailDeliveryLog.kind += 'waitlist'`; generate:types

## Phase 2: Матчинг + claim (US2/US3)

- [ ] T620 [BE] [US2] FR-602/D3/D4/D5: `notifySlotFreed(resourceId, productId, start, end)` — вызов из точек RELEASED (bookingService.cancelBooking/PI-fail/release + holdSweep после release); Payload Job `waitlist-match` (FIFO top-5, камп-кап 3, email через resend-канон, salted-hash лог); тесты: FIFO-порядок, камп-кап, фильтры (resource/service/expiry/status)
- [ ] T621 [BE] [US3] FR-603/D1/D2: `POST /api/waitlist/[entryId]/claim` — HMAC+expiry+status guard → `createBooking` на зафиксированный слот (FSM: FREE→CONFIRMED / PREPAID→HELD 15m) → entry `converted` (CAS); проигравший → 409 SLOT_TAKEN → auto-advance следующему кандидату; **STM-тест: claim-гонка ×100 → 1 CONFIRMED/HELD, 99×409, 0 double-booking** (Risk 20); token-матрица (valid/expired/wrong-entry)
- [ ] T622 [BE] [US3] claim-страница `book/waitlist-claim` (явный Confirm — D6, 409-канон AcknowledgeClient-фикса) + `WaitlistJoinForm` в SlotGrid (ветка «No available slots»)

## Phase 3: Lifecycle + closeout (US4)

- [ ] T630 [BE] [US4] FR-604/605: `waitlist-sweep` job (expired >14d, notified>30 мин → re-arm/камп-кап, финальное письмо при исчерпании); `DELETE /api/waitlist/[entryId]` (unsubscribe по токену → `cancelled` + audit); OWNER-коллекция в payload.config; тесты: sweep-матрица (expired/re-arm/кап), unsubscribe
- [ ] T640 [SETUP] Регрессия: generate:types, полный гейт 0 exit (validate/lint/int/build), 153+ старых зелёные, evidence (claim-гонка лог ×100, FIFO-матчинг лог, p95-замер), tasks-статусы

## Dependency Graph

```
T610 → T611, T620
T611 → T620, T621
T620 → T621
T621 → T622
T620 → T630
T622, T630 → T640
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T610 → T611 → T620 → T621 → T622 → T640 (6 задач). **Total**: 8 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T610 → T611 | — |
| 2 | T620 → T621 → T622 | T610, T611 |
| 3 | T630 | T620 |
| 4 | T640 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T610, T611, T620, T621, T622, T630 |
| [SETUP] | T640 |

## Notes
- TDD-Lite; Risk 20 (T621) → STM+DT+EG до кода; claim = единственный status-writer (bookingService); error-catalog: WAITLIST_DUPLICATE/WAITLIST_NOT_FOUND/WAITLIST_TOKEN_INVALID/WAITLIST_CAP_REACHED — снапшот-сьют расширяется.
