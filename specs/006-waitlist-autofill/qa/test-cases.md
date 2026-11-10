# Test Cases: 006-waitlist-autofill (ISO/IEC/IEEE 29119-3)

**Всего TC**: 16 · Профиль: EP + BVA + STM + DT + Error Guessing · Ревизия: 1.2 (интеграция ревью antigravity F1–F13)

## US1: Join (FR-601)

### TC-006-001: валидный join → 201 + статус waiting + audit `waitlist.join`
- **Priority**: P0 · **EP**
- **Payload**: валидные customerName, customerPhone, customerEmail, serviceId, resourceId, expiresAt (+14d).
- **Ожидание**: 201, запись создана в `waitlist_entries` с `status = 'waiting'`, `campaignCount = 0`, audit event `waitlist.join`.

### TC-006-002: кап 3 активных записи/телефон → 4-я отклонена (BVA: 3 ok, 4 fail)
- **Priority**: P0 · **BVA**
- **Ожидание**: первые 3 записи с уникальными сервисами для одного телефона принимаются (201); 4-я попытка возвращает 409 WAITLIST_CAP_REACHED.

### TC-006-003: дубль, пустой email, blacklist, окно expiresAt (Negative)
- **Priority**: P0 · **Negative / Security**
- **Проверки**:
  1. Дубль (`phone + serviceId + resourceId` в активном статусе) → 409 WAITLIST_DUPLICATE;
  2. Пустой или некорректный email → 400 VALIDATION_FAILED (F3);
  3. Телефон числится в `blacklist` → 403 BLACKLISTED (F11);
  4. `expiresAt <= now` или `expiresAt > now + 60d` → 400 VALIDATION_FAILED (F8).

## US2: Matching + notify (FR-602)

### TC-006-004: 6 точек RELEASED → матчинг FIFO top-5 → 5 писем ≤ 60 c
- **Priority**: P0 · **DT**
- **Триггеры**: проверка всех 6 точек (`cancelBooking`, `approveBooking`-reject, `releaseAfterPaymentInitFailure`, `applyGatewayEvent payment_failed`, `cancelBookingByClientChat`, `releaseExpiredHolds`).
- **Ожидание**: каждая точка вызывает `notifySlotFreed`, формирует job `waitlist-match`, выбирает top-5 по `created_at ASC`, атомарно сохраняет `notifiedSlotStart` и `notifiedSlotEnd`, переводит в `status = 'notified'`, отправляет 5 писем с подписанными `claimToken` и `unsubscribeToken`.

### TC-006-005: фильтры матчинга и игнорирование прошедших слотов
- **Priority**: P0 · **DT**
- **Проверки**:
  1. Чужой ресурс или услуга → не уведомляются;
  2. `expiresAt < slotStart` → не уведомляется (F8);
  3. Статус `!= 'waiting'` или `campaignCount >= 3` → не уведомляется;
  4. Отмена брони, время начала которой уже наступило (`slotStart <= now`) → матчинг не запускается, 0 писем (F8).

### TC-006-006: камп-кап — 3-я кампания → `expired` + финальное письмо
- **Priority**: P0 · **Error Guessing** (audit M1)
- **Ожидание**: если запись была уведомлена 3 раза и ни разу не подтверждена, при истечении 30 минут sweep переводит её в `status = 'expired'` и отправляет информационное письмо без персонального слота.

## US3: Claim (FR-603 — Risk 20)

### TC-006-007: STM claim-гонка ×100 на один слот → 1 бронь, 99×409, 0 ложных auto-advance
- **Priority**: P0 · **STM**
- **Ожидание**: при одновременной атаке 100 запросов на один освободившийся слот:
  - Ровно 1 запрос получает 201 (`CONFIRMED` для FREE или `HELD 15m` для PREPAID), запись победителя → `converted`;
  - 99 запросов получают 409 `SLOT_TAKEN`;
  - Записи проигравших переходят в `status = 'waiting'` (re-arm) для следующих слотов;
  - **Auto-advance НЕ вызывается** (F4: слот занят, каскадные письма кандидату #6 запрещены);
  - 0 двойных бронирований (advisory lock + GiST backstop).

### TC-006-008: claim → PREPAID услуга → HELD 15m + Stripe ссылка
- **Priority**: P0 · **STM**
- **Ожидание**: claim предоплатной услуги переводит заказ в `HELD` с `holdExpiresAt = now + 15m` и создаёт PaymentIntent. Истечение холда через 15 минут запускает `holdSweep` → освобождение слота → повторный матчинг.

### TC-006-009: token-матрица claim
- **Priority**: P0 · **BVA / Security**
- **Проверки**:
  1. Валидный токен + актуальное время `notifiedSlotStart` → 201;
  2. Попытка передать чужой `start` в теле запроса → игнорируется, сервер берёт `notifiedSlotStart` из БД (F1);
  3. Токен с чужим slotStart / чужим entryId / чужой версией кампании → 403;
  4. Токен после 30 минут (`activeCampaignAt + 30m <= now`) → 403/410;
  5. Повторный claim после `converted` → 403/409.

### TC-006-010: auto-advance — срабатывает ТОЛЬКО на свободный слот
- **Priority**: P0 · **DT**
- **Проверки**:
  1. При 409 `SLOT_TAKEN` → auto-advance НЕ вызывается (слот занят) (F4);
  2. В `waitlist-sweep` по истечении 30 минут без клика: если слот свободен → кандидат #6 получает email (auto-advance);
  3. В `waitlist-sweep`: если слот за эти 30 минут успели занять с витрины → auto-advance НЕ вызывается;
  4. При `DELETE /api/waitlist/[entryId]`: если запись была `notified` и слот свободен → следующий кандидат получает email.

## US4: Lifecycle & Security (FR-604/605)

### TC-006-011: sweep каждые 5 минут
- **Priority**: P0 · **EP**
- **Ожидание**: задача выполняется каждые 5 минут (`*/5 * * * *`). Записи с `expiresAt < now` переходят в `expired`. Записи `notified` старше 30 минут возвращаются в `waiting` (если `campaignCount < 3`) или `expired` (если `>= 3`).

### TC-006-012: отписка по unsubscribeToken
- **Priority**: P1 · **EP**
- **Ожидание**: `DELETE /api/waitlist/[entryId]?token=<unsubToken>` переводит запись в `cancelled`. Токен валиден даже если 30 минут кампании истекли (F10).

### TC-006-013: отписка с чужим/невалидным токеном → 403
- **Priority**: P1 · **Security**

### TC-006-014: отсутствие Next.js Route Shadowing в админке
- **Priority**: P0 · **Architecture / Integration** (F2)
- **Ожидание**: коллекция `waitlist-entries` доступна в `/admin/collections/waitlist-entries`, запросы админки к Payload REST API (`GET /api/waitlist-entries`, `PATCH`) не перехватываются роутом `/api/waitlist` и не возвращают 405.

## NFR & Hygiene

### TC-006-015: GDPR purge 90 дней
- **Priority**: P1 · **Compliance** (F11)
- **Ожидание**: задача `gdprPurgeTask` удаляет записи `waitlist_entries` в терминальных статусах (`converted`, `expired`, `cancelled`) старше 90 дней.

### TC-006-016: регрессионный гейт, замеры perf и PII-grep
- **Priority**: P0 · **Non-Functional**
- **Ожидание**: 153+ старых тестов зеленые; 0 новых npm-зависимостей; матчинг с композитным индексом <= 50 мс, claim p95 < 100 мс; PII-grep: ссылки и логи без открытых телефонов/email.

---

## Exploratory Charter (Risk ≥20, конституция XII)
- **Чартер E-03** (FR-603, 60 мин): атака на claim — гонки claim×claim×витрина, подмена слота в запросе, ложные рассылки auto-advance при 409, replay токенов по истечении 30m TTL.
