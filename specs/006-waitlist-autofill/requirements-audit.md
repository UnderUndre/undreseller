# Requirements Audit Report: 006-waitlist-autofill

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #3 на rev 1.2; run #1 — REJECTED, run #2 — PASS на rev 1.1; run #3 — интеграция 13 находок независимого ревью antigravity F1–F13)
- **Audit Date**: 2026-11-10
- **Audited**: `specs/006-waitlist-autofill/spec.md` rev 1.2 (10 reqs: 5 FR + 5 NFR)
- **Grounding (001–005 + QA-fixes as-built)**: FSM FREE-трек создаёт бронь **сразу CONFIRMED** (HELD — только PREPAID); hold-sweep (T050-канон) реанимирует expired HELD; TgLink — (chatId, orderId) без телефона; claim-гонка = advisory lock + GiST канон 002.

---

## Run #1 (spec rev 1.0) — REJECTED

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)
- Нарушений: 0 (капы 3/телефон, top-5, TTL 30 мин, окно 14d, race ×100 — квантованы).

### 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт run #1 |
| :--- | :--- | :--- | :--- |
| **US3 (claim → HELD TTL 10 мин)** | FSM-канон 001/002 (`track FREE → CREATE_BOOKING → CONFIRMED сразу; HELD существует только в PREPAID`) | **Противоречие**: для NONE-услуг (дефолт витрины) FSM не может выдать HELD — статуса нет в треке; спека предписывает статус, который FSM не производит | ❌ **БЛОКЕР C1** |
| US2 (матчинг триггер = RELEASED от hold-expiry) | US2 (уведомление → claim → не собрал → TTL истёк → RELEASED → матчинг снова) | **Цикл уведомлений**: те же кандидаты спамятся на каждый тик sweep'а без камп-капа | ❌ **M1** |
| US2 (TgLink «по телефону») | 004 as-built (`TgLink = chatId + orderId`, телефона нет) | Сущность не матчится по телефону — канал недоступен для waitlist без прошлой брони | ⚠️ M2 (само-противоречие в US2) |

### 3. Полнота и однозначность (Gate 3/4)
- Кларифай в rev 1.1: устранены C1, M1, M2.

---

## Run #2 (spec rev 1.1) — PASS

- **Устранения**: FSM CREATE_BOOKING, камп-кап 3, email-only MVP.
- **Risk Score**: FR-603 = 20 (Critical).

---

## Run #3 (spec rev 1.2, post-antigravity review) — PASS

Интеграция 13 находок состязательного аудита `antigravity` (F1–F13):

1. **F1 (CRITICAL) — Привязка координат слота**: поля `notifiedSlotStart` и `notifiedSlotEnd` добавлены в коллекцию; `slotStartIso` включён в HMAC `waitlist-claim:v${campaignCount}:${entryId}:${slotStartIso}`; эндпоинт claim читает время строго из БД.
2. **F2 (CRITICAL) — Route Shadowing**: слаг коллекции изменён на `waitlist-entries` (таблица `waitlist_entries`), исключая перехват catch-all роута Payload `/api/[...slug]`.
3. **F3 (CRITICAL) — Обязательный email в MVP**: `email` зафиксирован как обязательное поле при `join` (`FR-601`, `US1`) — 0 мёртвых душ и 0 падений при `FULL_PREPAYMENT`.
4. **F4 (CRITICAL) — Запрет ложного auto-advance на 409**: при `409 SLOT_TAKEN` (слот занят) auto-advance следующему кандидату НЕ вызывается; проигравшие возвращаются в `waiting` (re-arm); auto-advance срабатывает только если слот остался свободным (sweep 30m expiry или unsubscribe).
5. **F5 (HIGH) — Вычистка хвостов rev 1.0**: `§1.2 Решение` заполнено, убраны остатки «HELD TTL 10 мин» и упоминания Telegram в MVP.
6. **F6 (HIGH) — Все 6 точек RELEASED**: включены `cancelBookingByClientChat` (004) и `applyGatewayEvent` `payment_intent.payment_failed` (003); SQL дополнен `RETURNING resource_id, item_id, start_time, end_time`.
7. **F7 (HIGH) — Крон sweep 5 минут**: расписание изменено с `daily` на `*/5 * * * *`; регистрация в `payload.config.ts`.
8. **F8 (HIGH) — Окно expiresAt и слоты в прошлом**: join проверяет `now < expiresAt <= now + 60d`; матчинг проверяет `expiresAt >= slotStart` и `slotStart > now`.
9. **F9 (HIGH) — Разделение с AcknowledgeClient**: убрана ошибочная трактовка 409 как успеха; для проигравших 409 — честный отказ; победитель использует детерминированный `idempotencyKey`.
10. **F10 (MEDIUM) — Раздельные токены**: claimToken (TTL 30m, привязка слота) и unsubscribeToken (жизненный цикл записи).
11. **F11 (MEDIUM) — Blacklist и GDPR**: проверка по `Blacklist` при join (403); очистка записей старше 90 дней в `gdprPurge.ts`.
12. **F12 (MEDIUM) — Нумерация бизнес-плана**: 006 = waitlist, 007 = ЮKassa.
13. **F13 (LOW) — Индексы и типизация**: индексы `(resource_id, service_id, status)` и `(phone, status)`; типизация `logDelivery`.

### Risk-Based Testing Scoring (rev 1.2)

| Req | Impact | Prob | Risk | Техники |
| :--- | :--- | :--- | :--- | :--- |
| FR-601 (Join) | 3 | 3 | 9 | EP + DT (кап/дубли/blacklist/email) |
| FR-602 (Matching+notify) | 4 | 3 | 12 | DT (6 точек RELEASED, FIFO, past-slot guard) |
| FR-603 (Claim) | 5 | 4 | **20 (Critical)** | **STM (гонка ×100) + DT + Error Guessing + UAT** (money-adjacent слот-контеншн) |
| FR-604 (Lifecycle) | 3 | 2 | 6 | EP (sweep 5m, GDPR 90d, route shadowing) |
| FR-605 (Unsubscribe) | 2 | 2 | 4 | Smoke + auto-advance branch |
| NFR-601..604 | — | — | — | Регрессия/замеры |

### 5. Вердикт run #3

**PASS** — 0 блокеров. Все 13 замечаний устранены в спецификации rev 1.2.

```yaml
verdict: PASS
audit: requirements-audit
run: 3
audited_at: 2026-11-10T20:45:00Z
spec_revision: "1.2"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```
