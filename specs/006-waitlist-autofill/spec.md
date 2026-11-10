# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `006-waitlist-autofill`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 (`c5f3bf1`) + 003 (`3697b3d`) + 004 (`9efe76a`) + 005 (`3a576e4`) + QA-фиксы (`4c0d1ab`)
**Статус:** **DRAFT — REVISION 1.2 (2026-11-10; устранение находок F1–F13 ревью antigravity: F1 привязка `notifiedSlotStart/End` в БД и HMAC, F2 слаг `waitlist-entries` против route shadowing, F3 обязательный `email` в MVP, F4 запрет ложного `auto-advance` на занятый слот `409`, F5 вычистка хвостов rev 1.0, F6 все 6 точек `RELEASED`, F7 крон sweep 5m, F8 окно `expiresAt` и слоты в прошлом, F9 разделение с `AcknowledgeClient`, F10 раздельные `claimToken`/`unsubscribeToken`, F11 `Blacklist` и GDPR 90d, F12 синхронизация нумерации плана, F13 индексы)**
**Source of truth по бизнесу:** план v2.7.0 (без дельты — waitlist не меняет ICP/цены/рельсы; нумерация: 006 waitlist, 007 ЮKassa-адаптер) · **research:** dossier 2026-11-10 (Starta: waitlist рекаверит 40–60% отмен [L3]; Bookeo: 62% no-show = забывчивость; категория строит продукты вокруг smart-waitlist)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Депозиты (003) бьют намерение, reminders (003) бьют забывчивость — но отмены всё равно случаются (1 из 10 записей по категории [L3]), и освобождённый слот умирает пустым. Сейчас клиент, не нашедший слот, уходит в никуда; владелец теряет деньги молча ($1,500–4,000/мес для Primary ICP).

### 1.2. Решение

Умный лист ожидания (Smart Waitlist) для бронирования освобождающихся слотов: клиент подписывается на услугу при отсутствии доступных слотов на дату; при переходе любой брони в RELEASED (отмена/hold-expiry/staff-reject по всем 6 точкам FSM) система автоматически находит top-5 кандидатов по FIFO и рассылает email с криптографически подписанной ссылкой на claim. Первый подтвердивший забирает слот через стандартный FSM CREATE_BOOKING (FREE → CONFIRMED, PREPAID → HELD 15m); при занятии слота остальные кандидаты возвращаются в waiting без ложного спама. Фоновый sweep каждые 5 минут возвращает невостребованные слоты очереди или экспайрит записи по камп-капу.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO NEW EXTERNAL SERVICES:** уведомления только через Resend (003) и Payload Jobs (003/004); Telegram-канал вынесен в enhancement 007+ (TgLink не содержит телефона, в MVP — strict email-only); SMS/WhatsApp — табу (Scope Knife).
* ❌ **NO AUTO-BOOK WITHOUT CONFIRM:** waitlist не бронирует сам — слот отдаётся первому, кто кликнул claim и подтвердил форму на `/book/waitlist-claim`; авто-списание без клиента запрещено (FSM CREATE_BOOKING).
* ❌ **NO CROSS-RESOURCE MATCHING (MVP):** матчинг строго в пределах ресурса выбранной услуги.
* ❌ **NO QUEUE JUMPING:** порядок уведомления = FIFO по времени подписки; boost'ов нет.
* ❌ **NO SPURIOUS AUTO-ADVANCE ON 409:** при `409 SLOT_TAKEN` (слот уже забрали) уведомление следующему кандидату НЕ отправляется — слот занят. Auto-advance работает только при истечении 30-минутного TTL или явной отписке.
* ❌ **NO BROADCAST:** waitlist-уведомления — только на освободившийся конкретный слот top-5 кандидатам.

---

## 2. User Stories (Prioritized)

### US1 — Подписка на waitlist (P0)

`POST /api/waitlist` (публичный, rate limit 10/60s):
- `customerName` (строка <= 200) + `customerPhone` (строка <= 50) + `customerEmail` (обязательно в MVP, email-only канал) + `serviceId` + `resourceId` (опционально -> активный дефолт) + `expiresAt` (валидация: `now < expiresAt <= now + 60d`, default `now + 14d`).
- Проверка по коллекции `Blacklist` (`src/collections/Blacklist.ts`, спека 004 FR-406): если телефон в черном списке -> `403 BLACKLISTED`.
- Анти-спам: <= 3 активных записей (`status IN ('waiting', 'notified')`) на один телефон. Дубль (`phone + serviceId + resourceId` в активном статусе) -> `409 WAITLIST_DUPLICATE`.
- Клиентская поверхность: на `/book/[slug]` при «No available slots on this date» — инлайн-форма `WaitlistJoinForm` (имя, телефон, email).

**Acceptance**: подписка -> 201 + audit `waitlist.join`; 4-я активная запись -> 409 WAITLIST_CAP_REACHED; дубль -> 409 WAITLIST_DUPLICATE; телефон из Blacklist -> 403; пустой email -> 400.

### US2 — Матчинг + уведомление при освобождении (P0)

Хук на все 6 точек FSM перехода брони в RELEASED:
1. `cancelBooking` (отмена клиентом через веб)
2. `approveBooking` с действием `reject` (отклонение оператором)
3. `releaseExpiredHolds` (`holdSweep`)
4. `releaseAfterPaymentInitFailure`
5. `cancelBookingByClientChat` (отмена через Telegram-бота 004)
6. `applyGatewayEvent` при `payment_intent.payment_failed`

Каждая точка возвращает `(resource_id, item_id, start_time, end_time)` и вызывает `notifySlotFreed(resourceId, productId, start, end)`.
- Игнорирование слотов в прошлом: если `start <= now`, матчинг не запускается (нет смысла предлагать прошедший слот).
- Выбор waitlist-записей из коллекции `WaitlistEntries` (`waitlist_entries`):
  `resource_id = $resourceId AND service_id = $serviceId AND status = 'waiting' AND campaign_count < 3 AND expires_at >= start AND expires_at > now`
  Сортировка: `created_at ASC` (FIFO), лимит: 5.
- Атомарный перевод выбранных записей:
  `status = 'notified'`, `campaign_count = campaign_count + 1`, `active_campaign_at = now`, `notified_slot_start = start`, `notified_slot_end = end`.
- Enqueue задачи отправки писем через Payload Jobs:
  Письмо содержит название услуги, время начала/окончания слота, ссылку на claim:
  `/book/waitlist-claim?entry=<id>&token=<claimToken>`
  где `claimToken = hashToken('waitlist-claim:v' + campaignCount + ':' + entryId + ':' + slotStartIso)` (TTL 30 мин),
  и ссылку на отписку `token=<unsubToken>`, где `unsubToken = hashToken('waitlist-unsub:' + entryId)`.

**Acceptance**: отмена будущей брони -> <= 60 c ушли письма top-5 кандидатам; `notifiedSlotStart/End` зафиксированы в БД; прошедшая бронь не инициирует матчинг; запись получает `status = 'notified'`.

### US3 — Claim: первый клик выигрывает (P0 — money-adjacent)

`POST /api/waitlist/[entryId]/claim?token=` с телом `{ idempotencyKey }`:
1. Валидация HMAC-токена: вычисление `hashToken('waitlist-claim:v' + entry.campaignCount + ':' + entry.id + ':' + entry.notifiedSlotStart.toISOString())` и timing-safe сравнение с query token.
2. Проверка статуса: `entry.status === 'notified'` и `entry.activeCampaignAt + 30m > now`. При нарушении -> 403/410.
3. Время слота `start` берётся строго из `entry.notifiedSlotStart` в БД (клиент не может подменить слот).
4. Вызов `bookingService.createBooking` (единственный status-writer, защита advisory lock + GiST):
   - **FREE-трек**: сразу `CONFIRMED` (`BOOKED` в БД), клик = подтверждённое намерение;
   - **FULL_PREPAYMENT**: `HELD TTL 15m` (канон `PREPAID_HOLD_TTL_MS`) + платёжная ссылка Stripe.
5. **При победе (`201`)**:
   - текущая запись -> `status = 'converted'`, audit `waitlist.converted`;
   - остальные `notified`-записи на этот же слот (`notified_slot_start = entry.notifiedSlotStart`) атомарно возвращаются в `status = 'waiting'` (re-arm) без списания `campaignCount`, чтобы участвовать в следующих слотах. Auto-advance НЕ вызывается (слот занят).
6. **При конкурентном поражении (`409 SLOT_TAKEN`)**:
   - проигравший получает ответ 409 с сообщением `SLOT_TAKEN`;
   - запись проигравшего переводится в `status = 'waiting'` (re-arm для следующих слотов);
   - **Auto-advance НЕ вызывается** (слот уже занят победителем или витриной; отправлять письма дальше нельзя).
7. **Auto-advance следующему FIFO-кандидату (#6)**:
   - вызывается ТОЛЬКО если слот всё ещё свободен и `slotStart > now`, в двух случаях:
     (а) истечение 30 минут кампании в `waitlist-sweep`;
     (б) клиент явно отписался через `DELETE /api/waitlist/[entryId]`.

**Acceptance**: STM-гонка 100 запросов -> ровно 1 бронь (`CONFIRMED` или `HELD 15m`), 99 отказов 409, 0 двойных броней, 0 ложных рассылок; claim по чужому/просроченному токену -> 403; HELD по истечении TTL -> штатный `holdSweep` -> повторный цикл с камп-капом.

### US4 — Жизненный цикл и админ-поверхность (P1)

Payload Job `waitlist-sweep` (каждые 5 минут, `*/5 * * * *`):
- `expiresAt < now` -> `status = 'expired'`, audit `waitlist.expired`.
- `status = 'notified'` и `activeCampaignAt < now - 30m`:
  - Проверка слота: если слот всё ещё свободен (`slotStart > now` и нет брони в активных статусах) -> запустить матчинг следующего доступного FIFO-кандидата (auto-advance);
  - Если `campaignCount >= 3` -> перевести в `status = 'expired'` + отправка финального email «Слоты появлялись, но вы не успели забронировать»;
  - Иначе -> перевести в `status = 'waiting'` (re-arm).
- GDPR purge: в `src/jobs/gdprPurge.ts` удалять записи `waitlist_entries` в статусах `('converted', 'expired', 'cancelled')` старше 90 дней.
- OWNER: коллекция `waitlist-entries` в `/admin`, группа `'Bookings'`, поля статусов и кампаний `readOnly: true`, доступ `adminOnly`.

**Acceptance**: sweep каждые 5 минут возвращает невостребованные notified>30m в waiting или expired; авто-эдвайнс срабатывает только на свободный слот; GDPR чистит терминальные записи > 90d; админка не конфликтует с API.

---

## 3. Edge Cases

- **Гонка claim vs обычное бронирование витрины**: слот перехвачен витриной -> claim получает 409 -> запись переводится в `waiting` -> auto-advance НЕ триггерится.
- **Подписка на прошедшую услугу**: `expiresAt <= now` или `expiresAt > now + 60d` -> 400/422 VALIDATION_FAILED.
- **Освобождение слота в прошлом**: бронь отменена после наступления `start` (`start <= now`) -> `notifySlotFreed` сразу выходит без матчинга (0 спам-писем на прошедшее время).
- **Бронь reschedule'ится, а не отменяется**: `RELEASED` не происходит — матчинг не триггерится (reschedule = in-place atomic exchange).
- **Клиент в Blacklist**: `phone` числится в коллекции `blacklist` -> `POST /api/waitlist` возвращает 403 BLACKLISTED.
- **Клиент отписывается**: `DELETE /api/waitlist/[entryId]?token=<unsubToken>` -> статус `cancelled` + audit. Если запись была `notified` и слот ещё в будущем -> запуск auto-advance следующему FIFO-кандидату.
- **Удалённый продукт/ресурс**: фоллбэк имени услуги «Запись» (канон 005 F9).
- **Два слота освобождены одновременно**: каждая кампания лочит и переводит своих кандидатов в `notified` с привязкой конкретного `notifiedSlotStart`; кандидаты в `notified` не выбираются параллельным матчингом.

---

## 4. Requirements

### Functional Requirements
- **FR-601 (Join)**: публичный `POST /api/waitlist` (валидация обязательных name/phone/email, `now < expiresAt <= now + 60d`, проверка Blacklist -> 403, кап 3 активных/телефон, дубль -> 409 WAITLIST_DUPLICATE); коллекция `waitlist-entries` с индексами `(resource_id, service_id, status)` и `(phone, status)`; audit `waitlist.join`.
- **FR-602 (Matching+notify)**: хук во всех 6 точках `RELEASED` -> `notifySlotFreed` -> проверка `slotStart > now` -> Payload Job `waitlist-match` -> FIFO top-5 (`expiresAt >= slotStart AND campaignCount < 3`) -> атомарная фиксация `notifiedSlotStart/End` -> email с claim-ссылкой (HMAC с привязкой `slotStart`, TTL 30 мин) и unsubscribe-ссылкой (HMAC без TTL).
- **FR-603 (Claim)**: `POST /api/waitlist/[entryId]/claim` -> валидация HMAC + expiry + статус `notified` -> `slotStart` читается строго из БД -> `bookingService.createBooking` (FSM: FREE->CONFIRMED, PREPAID->HELD 15m) -> победитель `converted`, со-кандидаты партии -> `waiting` (re-arm); проигравший -> 409 SLOT_TAKEN (без auto-advance); auto-advance следующему (#6) ТОЛЬКО при sweep expiry или unsubscribe.
- **FR-604 (Lifecycle)**: Payload Job `waitlist-sweep` каждые 5 минут (`*/5 * * * *`) -> expired по времени, re-arm/камп-кап 3 для notified>30m; auto-advance на свободные слоты; GDPR 90d purge; коллекция `waitlist-entries` в `/admin` с `adminOnly`.
- **FR-605 (Unsubscribe)**: `DELETE /api/waitlist/[entryId]?token=<unsubToken>` -> статус `cancelled` + audit + auto-advance при освобождении зарезервированного notified-слота.

### Non-Functional Requirements
- **NFR-601 (Regression)**: 153+ старых тестов зеленые; новые >=15 тестов (join-матрица, blacklist, FIFO, race x100, sweep 5m, auto-advance rules, PII, rate limit).
- **NFR-602 (No new deps)**: 0 новых пакетов (Resend 003, crypto HMAC, Payload Jobs).
- **NFR-603 (Perf)**: матчинг <= 50 ms (композитный индекс `(resource_id, service_id, status)`); claim p95 < 100 ms (advisory lock).
- **NFR-604 (PII & Route Safety)**: токены без PII в открытом виде; логирование без телефонов/email (хеширование); слаг `waitlist-entries` не перекрывает REST API.

---

## 5. Success Criteria

- **SC-001**: claim-гонка x100 -> ровно 1 победитель, 99x409, 0 двойных броней, 0 каскадных рассылок на занятый слот.
- **SC-002**: отмена будущей брони -> ушли письма top-5 <= 60 c; claim одноразовый с жесткой криптопривязкой к слоту.
- **SC-003**: lifecycle: sweep каждые 5 минут переводит expired/re-arm; камп-кап 3 соблюдается; 0 застрявших статусов.
- **SC-004**: спам-фильтры (Blacklist 403, кап 3/телефон, дубли 409) блокируют спам; PII-grep чист; регрессия 153+ зелёная.

---

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Каналы уведомлений | Email-only (Resend 003) в MVP | Telegram вынесен в 007+ (TgLink не содержит телефона, канон F3/M2); 0 новых внешних сервисов |
| Q2: Claim-модель | FSM CREATE_BOOKING (FREE -> CONFIRMED; PREPAID -> HELD 15m) | Канон FSM 001/002/003; 10m HOLD в обход FSM устранён (audit C1) |
| Q3: Привязка слота | `notifiedSlotStart/End` в БД + в HMAC claimToken | Устранение F1: claim не может быть подменён клиентом на другое время |
| Q4: Поведение при 409 | Re-arm в waiting, БЕЗ auto-advance | Устранение F4: при 409 слот занят, слать письма следующему нельзя |
| Q5: Имя коллекции | `waitlist-entries` (слаг `waitlist-entries`) | Устранение F2: исключает route shadowing с кастомными `/api/waitlist/*` |
| Q6: Расписание sweep | Каждые 5 минут (`*/5 * * * *`) | Устранение F7: daily ломал 30m TTL кампаний; 5m соответствует reminderSweep |
