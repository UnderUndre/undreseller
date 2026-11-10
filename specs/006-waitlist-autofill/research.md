# Research: 006-waitlist-autofill

> Plan Phase 0 — Engineering Decisions (D1–D8). Grounding: 001–005 as-built + manual-QA fixes (`4c0d1ab`), FSM-канон (`bookingFsm.ts`), hold-sweep (T050-канон), antigravity review findings F1–F13.

## D1. Claim = FSM `CREATE_BOOKING` (audit C1 — никакой новой статус-машины)

- **Decision**: claim-эндпоинт вызывает существующий `bookingService.createBooking` с зафиксированными `startTime/endTime` освобождённого слота: FREE-трек → CONFIRMED немедленно; FULL_PREPAYMENT → HELD 15m (штатный канон + платёжная ссылка Stripe). Waitlist-запись победителя → `converted`. Конкурентный проигравший получает 409 SLOT_TAKEN (advisory lock + GiST канон 002 — гонка закрыта на уровне БД).
- **Rationale**: единственный status-writer остаётся bookingService; отдельный 10-минутный HOLD не нужен.

## D2. Раздельные токены: криптопривязка слота к claim и отдельный unsubscribe (F1, F10)

- **Decision**:
  1. `claimToken`: вычисляется как `hashToken('waitlist-claim:v' + campaignCount + ':' + entryId + ':' + slotStartIso)` — привязан к конкретному слоту и версии кампании, валиден только при `status === 'notified'` и `activeCampaignAt + 30m > now`. Сервер при claim читает время строго из `notifiedSlotStart` в БД.
  2. `unsubscribeToken`: вычисляется как `hashToken('waitlist-unsub:' + entryId)` — не зависит от слота и кампании, валиден на протяжении всего жизненного цикла записи (пока запись не `cancelled` или `converted`).
- **Rationale**: исключает вектор подмены времени слота клиентом (F1); гарантирует, что ссылка на отписку не «протухнет» через 30 минут вместе со слотом (F10). Ноль секретов в БД.

## D3. Триггер матчинга: все 6 точек RELEASED (F6, F8)

- **Decision**: точки интеграции — все 6 мест перехода в RELEASED в `bookingService.ts` и `holdSweep.ts`:
  1. `cancelBooking` (строка ~445)
  2. `approveBooking` reject (строка ~528)
  3. `releaseAfterPaymentInitFailure` (строка ~569)
  4. `applyGatewayEvent` `payment_intent.payment_failed` (строка ~738)
  5. `cancelBookingByClientChat` (строка ~1064)
  6. `releaseExpiredHolds` в `src/jobs/holdSweep.ts` (строка ~50)
  Все SQL-запросы UPDATE дополняются `RETURNING resource_id, item_id, start_time, end_time`. Если `start_time <= now()`, слот игнорируется (D8/F8). Иначе вызывается `notifySlotFreed(resourceId, productId, start, end)`, которая ставит Payload Job `waitlist-match`.

## D4. Камп-модель и поведение при 409: НИКАКОГО ложного auto-advance (F4)

- **Decision**:
  - `WaitlistEntry`: `campaignCount` (int, default 0), `activeCampaignAt` (nullable), `notifiedSlotStart` (nullable date), `notifiedSlotEnd` (nullable date).
  - Матчинг берёт: `status = 'waiting' AND campaignCount < 3 AND expiresAt >= start AND expiresAt > now` -> top-5 FIFO -> перевод в `notified`, `campaignCount++`, фиксация `notifiedSlotStart/End`.
  - При успехе claim (`201`): победитель -> `converted`; остальные 4 записи этой же партии возвращаются в `status = 'waiting'` (re-arm) без списания попытки. Auto-advance НЕ вызывается (слот занят).
  - При поражении (`409 SLOT_TAKEN`): проигравший получает 409 и возвращается в `status = 'waiting'` (re-arm). **Auto-advance НЕ вызывается** (слот уже занят, слать письма следующему нельзя).
  - **Auto-advance следующему FIFO-кандидату (#6)**: вызывается ТОЛЬКО если слот всё ещё свободен, в двух случаях:
    (а) в `waitlist-sweep` по истечении 30 минут без победителя;
    (б) при явной отписке notified-кандидата через `DELETE /api/waitlist/[entryId]`.

## D5. Email-канон: Resend + `EmailDeliveryLog` (F13)

- **Decision**: письмо — `lib/email/templates.ts` + `sendEmail` + `logDelivery(kind='waitlist')`. В `EmailDeliveryLog.ts` расширяется `kind` select на `'waitlist'`. В `src/lib/email/resendAdapter.ts` тип аргумента `kind` расширяется на `'waitlist'` (при опциональном `bookingId`).

## D6. UI: join-форма в SlotGrid + честная claim-страница (F9)

- **Decision**:
  - `SlotGrid`: если слотов нет, отображается инлайн-форма `WaitlistJoinForm` (имя, телефон, email обязателен в MVP).
  - `src/app/(app)/book/waitlist-claim/page.tsx`:
    - Показывает клиенту детали слота и явную кнопку Confirm booking;
    - При клике передаёт детерминированный `idempotencyKey = 'waitlist-claim:' + entryId + ':v' + campaignCount` в `POST /api/waitlist/[entryId]/claim`;
    - При `409 SLOT_TAKEN` показывает **честное сообщение об отказе**: «К сожалению, слот уже занят другим клиентом. Мы уведомим вас, как только появится новое окно» (отказ от логики AcknowledgeClient, которая трактовала 409 как успех);
    - Содержит ссылку/кнопку «Отписаться от очереди» (`DELETE /api/waitlist/[entryId]?token=<unsubToken>`).

## D7. Имя коллекции: `waitlist-entries` (F2)

- **Decision**: слаг коллекции в `src/collections/WaitlistEntries.ts` задаётся как `waitlist-entries` (таблица `waitlist_entries`). Публичный API остаётся на `/api/waitlist` (join) и `/api/waitlist/[entryId]` (claim/unsub).
- **Rationale**: предотвращает перекрытие маршрутов (Next.js route shadowing) catch-all роута Payload `/api/[...slug]`, благодаря чему `/admin/collections/waitlist-entries` работает без конфликтов и ошибок 405.

## D8. Расписание `waitlist-sweep` (5 минут) + Blacklist + GDPR (F7, F8, F11)

- **Decision**:
  - `waitlistSweepTask`: cron `*/5 * * * *` (каждые 5 минут, по канону `reminderSweepTask`).
  - Регистрация в `src/payload.config.ts` в `jobs.tasks`.
  - При `join`: проверка по `Blacklist` (`phone` в черном списке -> 403) и валидация горизонта `now < expiresAt <= now + 60d`.
  - GDPR purge: в `src/jobs/gdprPurge.ts` очистка терминальных записей `waitlist_entries` старше 90 дней.
