# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `002-booking-domain`
**Репозиторий:** `UnderUndre/undreseller` · **Базовая линия:** 001 (коммит `980bc32`, Payload-фундамент)
**Статус:** **DRAFT — REVISION 1.0 (2026-11-07; grounded в port-map 001, code/security review 001, бизнес-план v2.5.0 §2.2)**
**Source of truth по бизнесу:** `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0 — дельты нет (ядро существующего процесса; waiver VII-B.5 приложится при plan)
**Источники находок:** `specs/001-.../legacy-port-map.md` (домены 1/2/4/5/7), `reviews/{code,security}-zcode.md` (SEC-1/F-02/F-04, F-01 domain service), легаси-эталоны `bookingFsm.ts`/`windows.ts`/`advisoryLock.ts`

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Фундамент 001 поднят, но продукт пока — магазин без главной функции ICP: **записи на услуги**. Боль клиента (план v2.5.0 §1): No-Show и пустые окна $1,500–4,000/мес. Сквозной процесс §2.2 — «витрина услуг → слоты → холд/оплата → уведомление» — начинается с booking domain, а double-booking — его致命 уязвимость.

### 1.2. Решение

Порт booking domain из легаси как **design-reimplementation на Payload-рельсах**: слотная доступность + публичный booking API + FSM-проводка (pure-kernel 001 получает IO-слой) + GiST/advisory броня + setup-token bootstrap (закрытие SEC-1) + rate limiting + витрина записи. FREE track (PAY_ON_SITE) — полный путь до FULFILLED; PREPAID track — FSM готов, входы гейтятся до 004.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO TELEGRAM BOTS:** staff pager, client confirmation — 004 (roadmap reorder 2026-11-07); reminders/notifications — 003. Оператор видит брони в админке/API.
* ❌ **NO PAYMENT GATEWAY WIRING:** Stars/NOWPayments адаптеры и Stripe-webhook-хендлеры — 004; PREPAID-входы FSM гейтятся (FREE track полный).
* ❌ **NO GOOGLE CALENDAR / WAITLIST / AI:** 005/006+.
* ❌ **NO MULTI-SERVICE CART (дефолт):** 002 = single-service booking (одна услуга = одна бронь); мульти-сервисная корзина (contiguous interval search) — 003+ (Clarification Q1).
* ❌ **NO LEGACY COPY-PASTE:** окна/локи/домен — пере-реализация канонов; Prisma-обвязка не переносится.

### 1.4. Бизнес-план hook

Chore-дельты нет (ядро процесса §2.2), но цены/ICP не меняются → waiver VII-B.5 при plan. QA-контур XII — полный (money-adjacent: Risk ≥20 ожидаемо на FR-202/205 → Decision Table + State Transition обязательны по конституции).

---

## 2. User Stories (Prioritized)

### US1 — Setup-token OWNER bootstrap (P0 — закрытие SEC-1/F-02/F-04)

Первый OWNER создаётся **только** с одноразовым bootstrap-токеном: `OWNER_BOOTSTRAP_TOKEN` (env/лог первичного запуска); публичный `Users.create` остаётся customer-регистрацией; гонка первых регистраций исключена (токен = единственный путь к OWNER; повторный бутстрап невозможен).

**Acceptance Scenarios**:
1. **Given** чистая БД + токен, **When** регистрация с токеном, **Then** роль OWNER; второй вызов с тем же токеном → отказ (одноразовость).
2. **Given** чистая БД без токена, **When** публичная регистрация, **Then** роль `customer` (никогда OWNER); takeover-окно = 0.
3. **Given** существующий OWNER, **When** регистрация с токеном, **Then** токен больше не выдаёт OWNER (один бутстрап на инстанс).
4. Runbook §4.1 обновлён (ingress может открываться сразу).

### US2 — Double-booking броня на уровне БД (P0 — port-map #4/#5)

GiST EXCLUDE по `resourceId + tstzrange(startTime, endTime)` на активных статусах + `pg_advisory_xact_lock(resourceId)` в транзакции бронирования; конфликт 23P01 → HTTP 409. Raw-SQL Payload custom migration, Expand-only.

**Acceptance Scenarios**:
1. Две конкурентные брони одного ресурса на пересекающийся интервал → ровно одна создана, вторая 409 (интеграционный гоночный тест ≥100 попыток, 0 double-booking).
2. Брони разных ресурсов в тот же интервал → обе созданы.
3. Down-миграция дропает только новое; блокирующих ALTER нет.

### US3 — Каталог услуг и часы работы (P0 — port-map: каталог/окна)

`Products` выступают услугами через флаг `bookable` + поля (`durationMin`, `bufferBeforeMin/AfterMin` — пере-использование variant/inventory семантики не требуется); коллекция `WeeklyHours` (resourceId, weekday, startMin/endMin, break) — порт дизайна легаси; TZ строго из `ShopSettings.timeZone` (урок легаси «inert timezone» — часы хранятся/считаются в TZ инстанса, детерминированно).

**Acceptance Scenarios**:
1. Услуга 45 мин с квантом 30 мин даёт слоты на сетке (10:00/10:30/…) — легаси-урок duration-quantum.
2. Пересечение с `WeeklyHours`-перерывом режет слот; UTC-смещение инстанса не сдвигает сетку.

### US4 — Availability engine (P0 — port-map: окна)

Порт дизайна `windows.ts`: `[T, T+duration]` непрерывный поиск свободных окон с вычитанием занятости (SlotReservations в статусах HELD/BOOKED/PENDING_APPROVAL + buffers) и рабочего времени; публичный `GET /api/availability?service&date(s)`.

**Acceptance Scenarios**:
1. Бронь 10:00–11:00 + buffer 15 мин → слоты 10:15–10:45 отсутствуют в выдаче.
2. Прошедшие/night-часы вне окон; DST-переход не ломает сетку (fixed-offset TZ инстанса).

### US5 — Booking domain service + публичный API (P0 — money-adjacent)

Доменный сервис (Local API, `overrideAccess` — единственный писатель статусов, закрытие code F-01 полностью) + `POST /api/booking`: валидация → advisory lock → доступность → atomic create `SlotReservation(HELD-free-track: сразу CONFIRMED-маппинг BOOKED для IN_CALL / PENDING_APPROVAL для OUT_CALL)` + `Order` (FSM `transitionBookingFsm` — pure-kernel 001), `scheduleVersion` CAS; `GET /api/booking/[id]` по accessToken; отмена клиентом (cancel-token hash, порт канона).

**Acceptance Scenarios**:
1. Успешная бронь → FSM `AVAILABLE→CONFIRMED` (IN_CALL, флаг off) с эффектами `transitionBookingFsm` 1:1; 0 прямых записей статуса вне сервиса.
2. OUT_CALL → `PENDING_APPROVAL` (US6).
3. Невалидный слот/занятый → 409/422 с каталог-кодами ошибок (error-shape snapshot расширяем).
4. Идемпотентность: повторный POST с тем же idempotencyKey → та же бронь, без дублей.

### US6 — Staff approval surface (P1 — роль OPERATOR заработает)

App-API (OPERATOR+): список `PENDING_APPROVAL`, approve/reject через FSM (CAS `scheduleVersion`), отказ → `AVAILABLE` + cancel-token; дублирование операций в admin UI минимально (OPERATOR в /admin не пускаем — канон 001).

**Acceptance Scenarios**:
1. OPERATOR approve → CONFIRMED (BOOKED); reject → слот RELEASED, повторное бронирование возможно.
2. CAS: два конкурентных approve на старой `scheduleVersion` → второй `ALREADY_PROCESSED`.
3. PERFORMER/аноним → 403.

### US7 — Storefront booking flow (P1 — витрина)

`/book`-флоу на шаблонном storefront-стеке: услуга → слот-грид (US4) → детали (имя/телефон, consent) → подтверждение → status-страница с cancel-ссылкой. Ошибки 409/422 — человекочитаемо, i18n-заготовка (en/ru ключи, без full-локализации — 006+).

**Acceptance Scenarios**:
1. Happy path браузером за ≤5 кликов; e2e-сьют booking-flow (playwright, без Stripe).
2. Гонка слотов двумя вкладками → вторая получает 409 + авто-обновление грида.

### US8 — Rate limiting booking-контура (P1 — port-map #6 частично)

In-memory фиксированное окно (канон легаси: 10 req/60s на IP+route) на POST /api/booking + availability; 429 + Retry-After; single-instance assertion (REPLICA_COUNT, канон легаси).

**Acceptance Scenarios**: 11-й запрос в минуту → 429; после окна — снова 200; тест на границу.

---

## 3. Edge Cases

- **Двойная бронь**: гонка покрыта US2 (L1 advisory + L2 GiST); тест-взрыв 100 конкурентных.
- **TZ**: все вычисления в `ShopSettings.timeZone` (fixed offset) — легаси-баг «inert timezone» не воспроизводится; DST-тест.
- **Буферы**: буферы соседних броней перекрываются → слот недоступен (EP-тест).
- **CLAUDE-канон `pnpm ii`**: новая миграция не трогает lockfile.
- **Первый OWNER + токен**: bootstrap до/после открытия ingress — оба сценария в тестах.
- **payload generate:types drift**: новые коллекции → регенерация, 0 ручных правок.
- **Mongo-фантомов нет**: raw-SQL миграция — единственный DDL, Expand-only (Principle X: контракт фазы — 004+).

## 4. Requirements

### Functional Requirements

- **FR-201 (Bootstrap token)**: одноразовый `OWNER_BOOTSTRAP_TOKEN` → первый OWNER; без токена публичная регистрация = только `customer`; пер-инстанс однократность; runbook обновлён.
- **FR-202 (GiST EXCLUDE)**: `slot_reservations_no_overlap` по `(resourceId, tstzrange) WHERE status IN ('HELD','BOOKED','PENDING_APPROVAL')`; 23P01 → 409; Expand-only миграция + down.
- **FR-203 (Advisory lock)**: `pg_advisory_xact_lock(hashtext('resource_slot_lock_'||resourceId))` в транзакции бронирования (L1).
- **FR-204 (Catalog + hours)**: `bookable`-услуги (durationMin, buffers), `WeeklyHours`-коллекция; TZ = `ShopSettings.timeZone`, quantum 30 мин.
- **FR-205 (Availability API)**: публичный GET с вычитанием занятости и буферов; p95 < 50 ms при ≤2k бронях/мес.
- **FR-206 (Booking API + domain service)**: POST /api/booking (idempotencyKey), FSM через pure-kernel + доменный сервис (единственный писатель статусов), atomic SlotReservation+Order, cancel-token hash.
- **FR-207 (Rate limit)**: 10/60s на IP+route, 429+Retry-After, REPLICA_COUNT-assertion.
- **FR-208 (Approval API)**: OPERATOR+ approve/reject через FSM CAS; 403 для прочих.
- **FR-209 (Storefront flow)**: /book энд-ту-энд + e2e; error-catalog человекочитаем.

### Non-Functional Requirements

- **NFR-201 (Regression)**: все 72 теста 001 зелёные; новые ≥30 (FSM-проводка, гонки GiST, availability BVA, rate-limit границы, bootstrap матрица).
- **NFR-202 (Memory)**: ≤500 MB (fencing-инвариант; замер в evidence).
- **NFR-203 (No new deps)**: Inngest/либы планировщика — только по решению plan (D-вопрос); иначе 0.
- **NFR-204 (Migration safety)**: Expand-only raw SQL, statement/lock_timeout, down.sql, preflight collision check (канон легаси F3/F15).

## 5. Success Criteria

- **SC-001**: гоночный тест double-booking — 0 двойных броней на 100 попыток (L1+L2).
- **SC-002**: FSM-переходы идут ТОЛЬКО через доменный сервис (grep: 0 прямых status-writes вне сервиса; field-access guard 001 остаётся).
- **SC-003**: bootstrap-матрица (токен/без/повтор) зелёная; takeover-окно = 0.
- **SC-004**: availability BVA (buffers, TZ, DST, quantum) зелёная; p95 < 50 ms замер в evidence.
- **SC-005**: rate-limit граница 10/60s зелёная; 72+ тестов регрессии зелёные.
- **SC-006**: e2e booking-flow (без Stripe) зелёный.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы до plan)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Мульти-сервисная корзина | **Single-service booking в 002**; мульти-корзина — 003+ | Contiguous-interval search — отдельная сложность (легаси 002-урок); ядро ценности — слоты и бронь |
| Q2: PREPAID track | **FSM-проводка полная, входы гейтятся** до 003-no-show-protection (roadmap reorder 2026-11-07) | HELD/PAYMENT_PENDING без гейтвея мертвы; FREE track даёт полный сквозной путь |
| Q3: Планировщик TTL/approval-дедлайнов | **Plan-phase D**: Inngest vs Payload jobs | Inngest — канон легаси; Payload jobs — ноль новых зависимостей; решается на плане с бенчем |
| Q4: OUT_CALL approval surface | **App-API для OPERATOR** (не /admin) | Канон 001: OPERATOR без Payload-админки; UI — минимальный |
| Q4b: Планировщик sweeps | **Перенесено в 003** (roadmap reorder) | Reminders/hold-sweep живут там |
| Q5: Услуга = Product? | **Product + bookable-флаг + duration-поля** | Переиспользование variants/цены/SEO шаблона; отдельная коллекция — дубль каталога |
