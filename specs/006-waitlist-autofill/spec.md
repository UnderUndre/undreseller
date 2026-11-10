# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `006-waitlist-autofill`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 (`c5f3bf1`) + 003 (`3697b3d`) + 004 (`9efe76a`) + 005 (`3a576e4`) + QA-фиксы (`4c0d1ab`)
**Статус:** **DRAFT — REVISION 1.1 (2026-11-10; clarify по audit run#1: C1 claim через FSM CREATE_BOOKING (FREE→CONFIRMED сразу, PREPAID→HELD 15m канон), M1 камп-кап 3/запись против notify-циклов, M2 Telegram-канал выпилен из MVP (TgLink не матчится по телефону) — email-only)**
**Source of truth по бизнесу:** план v2.7.0 (без дельты — waitlist не меняет ICP/цены/рельсы; уведомления по существующим каналам) · **research:** dossier 2026-11-10 (Starta: waitlist рекаверит 40–60% отмен [L3]; Bookeo: 62% no-show = забывчивость; категория строит продукты вокруг smart-waitlist)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Депозиты (003) бьют намерение, reminders (003) бьют забывчивость — но отмены всё равно случаются (1 из 10 записей по категории [L3]), и освобождённый слот умирает пустым. Сейчас клиент, не нашедший слот, уходит в никуда; владелец теряет деньги молча.

### 1.2. Решение

x

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO NEW EXTERNAL SERVICES:** уведомления только через Resend (003) и Telegram outbox (004); SMS/WhatsApp — отдельное решение (Scope Knife: бюджет интеграций потрачен на Calendar Feed 005).
* ❌ **NO AUTO-BOOK WITHOUT CONFIRM:** waitlist не бронирует сам — слот отдаётся первому, кто кликнул claim и подтвердил форму; авто-списание без клиента запрещено.
* ❌ **NO CROSS-RESOURCE MATCHING (MVP):** матчинг строго в пределах ресурса выбранной услуги (мультиресурсный матчинг — 007+ по спросу).
* ❌ **NO QUEUE JUMPING:** порядок уведомления = FIFO по времени подписки; boost'ы нет.
* ❌ **NO BROADCAST:** waitlist-уведомления — только на освободившийся конкретный слот (анти-спам канон 004).

---

## 2. User Stories (Prioritized)

### US1 — Подписка на waitlist (P0)

`POST /api/waitlist` (публичный, rate limit 10/60s): customerName + phone (обязательно, канон 002) + email (опционально) + serviceId + resourceId (опционально → активный дефолт) + expiresAt (default +14d, max 60d). Клиентская поверхность: на `/book/[slug]` при «No available slots on this date» — форма «Уведомить меня» (след. 14 дней, любые слоты). Анти-спам: ≤3 активных записей на один телефон; дубль (phone+service+resource) → 409 WAITLIST_DUPLICATE.

**Acceptance**: подписка → 201 + audit `waitlist.join`; 4-я активная запись телефона → 429/409-матрица; дубль → WAITLIST_DUPLICATE.

### US2 — Матчинг + уведомление при освобождении (P0)

Хук на терминальные переходы брони (RELEASED через cancel/hold-expiry/staff-reject — канон FSM 002/003): выбрать waitlist-записи (resourceId совпадает, serviceId совпадает, expiresAt > now, статус `waiting`) → top 5 по FIFO → каждой enqueue уведомления (email канон 003 + outbox `bot:'client'` если TgLink по телефону... TgLink линкуется по orderId — для waitlist без прошлой брони Telegram недоступен → **MVP: email-only, TG-канал — enhancement**) с claim-ссылкой `HMAC(waitlist-entry nonce)` TTL = 30 мин.

**Acceptance**: отмена брони → ≤60 c 5 кандидатам ушли письма; claim-ссылка одноразовая с expiry; запись получает статус `notified` (одна активная кампания на запись).

### US3 — Claim: первый клик выигрывает (P0 — money-adjacent)

`POST /api/waitlist/[entryId]/claim?token=` → валидация HMAC+expiry+статуса `notified` → слот ещё свободен? → **CREATE_BOOKING через FSM** (единственный писатель — bookingService, канон 002): FREE-трек → **сразу CONFIRMED** (клик = подтверждённое намерение); FULL_PREPAYMENT → **HELD TTL 15m** (канон `PREPAID_HOLD_TTL_MS` + платёжная ссылка 003) → редирект на confirmation. Конкурентный проигравший → 409 SLOT_TAKEN → **авто-перенотификация** следующего кандидата (статус записи: `converted` при успехе).

**Acceptance**: STM-гонка двух claim ×100 → ровно 1 HELD, 99×409, следующий кандидат уведомлён; claim по expired/чужому токену → 403; HELD по истечении TTL → штатный hold-sweep 003 (T050-канон) → повторный матчинг.

### US4 — Жизненный цикл и админ-поверхность (P1)

Payload Job `waitlist-sweep` (ежедневно): expired-записи → `expired`; notified-кампании старше 30 мин без claim → возврат в `waiting` (re-arm). **Камп-кап: максимум 3 кампании на запись** (audit M1: против notify-циклов hold-expiry↔matching); исчерпан → `expired` + финальное письмо «слоты появились — забронируйте вручную». OWNER: коллекция Waitlist в /admin, статусы waiting/notified/converted/expired/cancelled.

**Acceptance**: sweep переводит expired >14d; notified>30 мин → waiting; аудит `waitlist.expire`.

---

## 3. Edge Cases

- **Гонка claim vs обычное бронирование**: между уведомлением и кликом слот забрал кто-то с витрины → claim → 409 → перенотификация.
- **Waitlist на прошедшую услугу**: expiresAt < startTime → подписка отклоняется (422).
- **Бронь reschedule'ится, а не отменяется**: RELEASED не случается — матчинг не триггерится (reschedule = in-place update канон 003).
- **Телефон в claim-ссылке**: ссылка содержит только HMAC-токен — PII не в URL (канон фида 005).
- **Уведомление о слоте без имени услуги** (продукт удалён): фоллбэк «Запись» (канон 005 F9).
- **Клиент отписывается**: `DELETE /api/waitlist/[entryId]?token=` → статус `cancelled` (canon audit).
- **Два слота освобождены одновременно**: одна активная кампания на запись; второе освобождение уходит следующим FIFO-кандидатам (уже notified не дублируются до re-arm).
- **Услуга переключена на FULL_PREPAYMENT после подписки**: claim идёт по текущему paymentMode продукта (FSM решает в момент claim).

## 4. Requirements

### Functional Requirements
- **FR-601 (Join)**: публичный `POST /api/waitlist` (валидация future-service, кап 3 активных записи/телефон, дубль → 409 WAITLIST_DUPLICATE); audit `waitlist.join`.
- **FR-602 (Matching+notify)**: триггер на RELEASED (cancel/hold-expiry/staff-reject) → FIFO top-5 → email-уведомления (канон 003, salted-hash лог) с claim-ссылкой (HMAC nonce, TTL 30 мин); статус `notified`.
- **FR-603 (Claim)**: `POST /api/waitlist/[entryId]/claim` → HELD TTL 10 мин через bookingService (единственный писатель) + accessToken/cancelToken; проигравшие → 409 + auto-advance; claim-токены одноразовые/expiring.
- **FR-604 (Lifecycle)**: sweep-job — expired, re-arm notified>30 мин; статусы waiting/notified/converted/expired/cancelled; OWNER-коллекция в /admin.
- **FR-605 (Unsubscribe)**: `DELETE` по токену → `cancelled` + audit.

### Non-Functional Requirements
- **NFR-601 (Regression)**: 153+ старых теста зелёные; новые ≥15 (join-матрица, FIFO-матчинг, claim-гонка ×100, TTL-жизненный цикл, PII, rate limit).
- **NFR-602 (No new deps)**: 0 (email — Resend 003, токены — HMAC 003, джобы — Payload Jobs 003/004).
- **NFR-603 (Perf)**: матчинг ≤ 50 ms (индекс `(resource_id, service_id, status)`); claim p95 < 100 ms (advisory lock канон 002).
- **NFR-604 (PII)**: claim-ссылка без PII; тело письма — услуга/время, без лишнего; дени-лист в логах.

## 5. Success Criteria

- **SC-001**: claim-гонка ×100 → 1 победитель, 99×409, auto-advance следующему — 0 двойных броней.
- **SC-002**: cancel → 5 уведомлений ≤ 60 c; claim ≤ 30 мин TTL — одноразово.
- **SC-003**: lifecycle-матрица (join→notified→converted / expired / cancelled) — 0 застрявших статусов после sweep.
- **SC-004**: кап 3 записи/телефон + дубли → 0 спама; PII-grep уведомлений чист; 153+ регрессия зелёная.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Каналы уведомлений | Email (003) + Telegram outbox (004, при наличии TgLink) | Ноль новых внешних сервисов; SMS/WhatsApp — по спросу отдельно |
| Q2: Claim-модель | Первый клик → HELD TTL 10 мин (канон 003 PREPAID-hold) | Реюз проверенного холд-механизма; Confirm booking завершает |
| Q3: Матчинг | Строго resource+service (мультиресурс — 007+) | MVP-простота; со spares-матчингом растёт поверхность спама |
| Q4: Очередь | FIFO по подписке, top-5 на слот | Анти-спам;boost'ы — Via Negativa |
| Q5: TTL кампании | 30 мин на notified-партию | После — re-arm в waiting (sweep) |
