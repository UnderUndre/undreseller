# Tasks: 006 (006-waitlist-autofill)

**Input**: spec rev 1.2, plan.md, research.md (D1–D8), requirements-audit (rev 1.2), antigravity review fixes F1–F13.
**Organization**: Phase 1 коллекция + join + токены → Phase 2 матчинг + claim (Risk 20) + UI → Phase 3 lifecycle + cron 5m + closeout.

## Phase 1: Коллекция + join + токены (US1)

- [x] T610 [BE] [US1] FR-601: `WaitlistEntries` коллекция (слаг `waitlist-entries`, таблица `waitlist_entries`): поля `customerName`, `customerPhone`, `customerEmail` (обязателен в MVP), `serviceId`, `resourceId`, `expiresAt`, `status` (`waiting|notified|converted|expired|cancelled`), `campaignCount`, `activeCampaignAt`, `notifiedSlotStart`, `notifiedSlotEnd`; композитные индексы `(resource_id, service_id, status)` и `(phone, status)`; `adminOnly` доступ и `readOnly: true` для системных полей; `waitlistService.join` (проверка `Blacklist` по телефону -> 403, окно `now < expiresAt <= now + 60d`, кап 3 активных/телефон, дубль -> 409 WAITLIST_DUPLICATE, advisory lock `pg_advisory_xact_lock(hashtext('waitlist_join_' || phone))` (канон hashtext — урок 004 F6: строковый литерал без hashtext = `function ... does not exist`)); публичный `POST /api/waitlist` (rate limit 10/60s) + audit `waitlist.join`; DT-тесты: кап, дубли, blacklist 403, обязательный email 400, окно expiresAt.
- [x] T611 [BE] [FR-604/D2] `claimToken.ts`: `computeClaimToken(entryId, campaignCount, slotStartIso)` = HMAC `waitlist-claim:v${campaignCount}:${entryId}:${slotStartIso}` (timing-safe); `computeUnsubscribeToken(entryId)` = HMAC `waitlist-unsub:${entryId}`; `EmailDeliveryLog.ts` select `kind += 'waitlist'`; `resendAdapter.ts` typings `logDelivery` (`kind: 'confirmation' | 'reminder' | 'waitlist'`); `pnpm generate:types`.

## Phase 2: Матчинг + claim (US2/US3 — Risk 20)

- [x] T620 [BE] [US2] FR-602/D3/D4/D5: обновление всех 6 точек перехода в `RELEASED` (`cancelBooking`, `approveBooking`-reject, `releaseAfterPaymentInitFailure`, `applyGatewayEvent payment_failed`, `cancelBookingByClientChat`, `releaseExpiredHolds` в `holdSweep.ts`) с `RETURNING resource_id, item_id, start_time, end_time`; функция `notifySlotFreed(resourceId, productId, start, end)` с проверкой `start > now()`; Payload Job `waitlist-match` (FIFO top-5, `expiresAt >= start`, фиксация `notifiedSlotStart/End`, email через resend-адаптер с ссылкой claim и unsubscribe); тесты: срабатывание всех 6 точек, пропуск слотов в прошлом, FIFO-порядок, фильтры.
- [x] T621 [BE] [US3] FR-603/D1/D2/D4: `POST /api/waitlist/[entryId]/claim?token=` (с телом `{ idempotencyKey }`): валидация HMAC-токена с `entry.notifiedSlotStart.toISOString()`, проверка статуса `notified` и `activeCampaignAt + 30m > now`, чтение времени слота строго из `notifiedSlotStart` в БД; вызов `bookingService.createBooking` (FSM: FREE->CONFIRMED, PREPAID->HELD 15m); при победе (`201`) — текущая запись -> `converted`, остальные записи партии -> `waiting` (re-arm) без списания попытки и БЕЗ auto-advance (слот занят); при поражении (`409 SLOT_TAKEN`) — возврат 409, проигравший -> `waiting` (re-arm), **auto-advance НЕ вызывается**; **STM-тест: claim-гонка x100 на один слот -> 1 бронь, 99x409, 0 double-booking, 0 ложных рассылок** (Risk 20); token-матрица (valid, expired campaign, wrong slot, wrong token, replay -> 403).
- [x] T622 [BE] [US3] claim-страница `/book/waitlist-claim`: отображение времени слота и услуги, явная кнопка подтверждения Confirm, при `409 SLOT_TAKEN` — честное сообщение об отказе («Слот уже занят другим клиентом. Мы уведомим вас о следующем окне», без ошибочной логики AcknowledgeClient), кнопка отписки; `WaitlistJoinForm.tsx` в `SlotGrid` (ветка «No available slots on this date», поля: имя, телефон, обязательный email).

## Phase 3: Lifecycle + closeout (US4)

- [x] T630 [BE] [US4] FR-604/605/D7/D8: Payload Job `waitlist-sweep` с расписанием каждые 5 минут (`*/5 * * * *`): перевод `expiresAt < now` -> `expired`, обработка `notified > 30m` (если слот ещё свободен -> запуск auto-advance следующему FIFO-кандидату; если `campaignCount >= 3` -> `expired` + финальное письмо; иначе -> `waiting` re-arm); `DELETE /api/waitlist/[entryId]?token=<unsubToken>` (проверка unsubToken -> `cancelled` + audit; если была активная notified-кампания и слот свободен -> запуск auto-advance); очистка записей `waitlist_entries` старше 90 дней в `gdprPurge.ts`; регистрация коллекции `WaitlistEntries` и задачи `waitlistSweepTask` в `src/payload.config.ts`; тесты: sweep 5m, auto-advance только на свободный слот, unsubscribe, GDPR purge.
- [x] T640 [SETUP] Регрессия и верификация: `pnpm generate:types`, полный гейт 0 exit (`pnpm validate`, `pnpm lint`, `pnpm test:int` — все 153+ старых + новые waitlist-тесты зеленые, `pnpm build`), evidence-логи (claim-гонка x100, 6 точек RELEASED, sweep 5m, p95 замер).

## Dependency Graph

```
T610 -> T611, T620
T611 -> T620, T621
T620 -> T621
T621 -> T622
T620 -> T630
T622, T630 -> T640
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T610 -> T611 -> T620 -> T621 -> T622 -> T640 (6 задач). **Total**: 8 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T610 -> T611 | — |
| 2 | T620 -> T621 -> T622 | T610, T611 |
| 3 | T630 | T620 |
| 4 | T640 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T610, T611, T620, T621, T622, T630 |
| [SETUP] | T640 |

## Notes
- TDD-Lite; Risk 20 (T621) -> STM+DT+EG до кода; claim = единственный status-writer (`bookingService`); error-catalog: `WAITLIST_DUPLICATE`, `WAITLIST_CAP_REACHED`, `BLACKLISTED`, `WAITLIST_TOKEN_INVALID`, `SLOT_TAKEN`.
