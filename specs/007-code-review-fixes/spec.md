# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `007-code-review-fixes`
**Ветка:** `main` (single-branch lineage — та же grandfathered IX-девиация, что 004/005/006)
**Путь к спеке:** `undreseller/specs/007-code-review-fixes/spec.md`
**Статус:** **DRAFT — REVISION 1.0 (2026-10-31)**
**Архитектурный фундамент:** канон 004/005/006 (fail-closed секреты, timing-safe compare, minor units, дени-лист логгера)
**Рантайм:** без изменений (Node 22, PG 16, Prisma)
**Source of truth по бизнесу:** `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v20.1 — коммерческой дельты нет (чистый tech-debt/security hardening, waiver приложен)
**Источники находок:** `docs/reviews/code-review-zcode.md` (F-01..F-06, full-codebase ревью 2026-10-31) + security-auditor checklist pass (S-01, S-02)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Full-codebase ревью (zcode, 2026-10-31) и доп. пробег по чеклисту `speckit.security-auditor` выявили 1 HIGH + 4 WARNING + 3 SUGGESTION дефекта в shipped-коде 003–006. Один дефект — fail-open секрет подписи (F-01) — прямой контраст с каноном fail-closed (`adminAuth.ts`, `staffActions.ts:59`); два — инварианты money-path/SRE-бюджета, которые превращают любой будущий баг в тихую потерю денег или памяти.

### 1.2. Решение

Точечные фиксы 8 находок — без новой архитектуры, без миграций, без изменения API-контрактов (кроме честного 501 на нереализованный RESCHEDULE).

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO RESCHEDULE IMPLEMENTATION:** реальный перенос времени — не в 007 (планируется консолидацией booking-API ≤007 канона 006); здесь только честный `501 Not Implemented` на no-op ветку.
* ❌ **NO NEW DEPS:** фиксы на `node:crypto` / stdlib `AbortSignal` — ноль новых зависимостей.
* ❌ **NO SCHEMA CHANGES:** миграций нет (Expand/Contract N/A).
* ❌ **NO WEBHOOKS/API PHASE 6 WORK:** US3 из 006 остаётся за Demand Gate — не трогаем.
* ❌ **NO TIMING-SAFE REWRITE SPREE:** существующие `timingSafeEqual`-вызовы с length-гворми (verified: initData, staffActions, nowpayments, adminAuth) не переписываются — только дефектные места.

---

## 2. User Stories (Prioritized)

### US1 — Fail-closed секреты подписи и хеширования (P0 — security)

Магические reschedule-ссылки и delivery-логи перестают работать с дефолтными секретами из кода: без сконфигурированного env-секрета подпись **невозможна** (генерация бросает fail-closed ошибку, логируется алерт при старте), хеш-псевдонимизация delivery-лога не выдаёт псевдо-безопасность с фиксированной строкой.

**Acceptance Scenarios**:
1. **Given** env без `STAFF_WEBHOOK_SECRET`/`ADMIN_TOKEN`, **When** staff вызывает reschedule-оффер, **Then** генерация ссылки бросает явную ошибку конфигурации (500 с diagnose-логом), никакая ссылка с публично известным ключом не создаётся.
2. **Given** env без `DELIVERY_LOG_SALT`/`ADMIN_TOKEN`, **When** пишется delivery-лог, **Then** цели не «хешируются» фиксированной солью из кода — запись помечается `UNHASHED` и стартовый алерт warns при буте.

**Why P0**: единственные fail-open секреты в кодовой базе; контраст с каноном fail-closed.

### US2 — Честный контракт admin bookings RESCHEDULE (P1 — data integrity)

`POST /api/admin/bookings/[id]` с `action: 'RESCHEDULE'` отвечает `501 Not Implemented` с diagnostics вместо тихого 200-но-оп.

**Acceptance Scenarios**:
1. **Given** букинг, **When** `RESCHEDULE` на admin-роут, **Then** 501 + JSON `{ error: "RESCHEDULE is not implemented (planned <=007)" }`, БД не изменена, audit `BOOKING_RESCHEDULE` не пишется (действия не было).

### US3 — Инвариант суммы платежа (P1 — money path)

`fulfillPayment` сверяет `amountMinor`/`currency` из верифицированного webhook'а с `order.totalMinor`/`order.currency`; расхождение → `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request + алерт (канон OVERBOOKED-пути), **никогда** тихое `PAID`.

**Acceptance Scenarios**:
1. **Given** webhook с `amountMinor != order.totalMinor`, **When** fulfillment, **Then** статус `PAID_REQUIRES_RESOLUTION`, `requiresOperatorAction: true`, оператор-алерт, сток/слот по канону collision-пути.
2. **Given** суммы совпадают, **When** fulfillment, **Then** поведение идентично текущему (0 регрессий, 418 тестов зелёные).
3. **Given** валюта заказа `USD` и webhook `EUR`, **Then** — как (1) (mismatch по валюте = тот же путь).

### US4 — Сетевые таймауты на исходящих вызовах (P2 — SRE)

Все исходящие `fetch()` в money/notify-пути имеют таймаут: Resend (email), NOWPayments invoice creation, WhatsApp client — `AbortSignal.timeout(10_000)`; таймаут → `FAILED` delivery-статус по существующим веткам (не бросает 500 на route).

**Acceptance Scenarios**:
1. **Given** зависший upstream (мок-сервер без ответа), **When** отправка email, **Then** ≤10.5 с статус `FAILED` + delivery-лог, HTTP-обработчик не висит.
2. **Given** штатный upstream, **Then** 0 поведенческих изменений.

### US5 — Гигиена контура аутентификации (P2 — security hardening)

1. **Lockout-реестр bounded**: `Map` в `staffSignIn` с eviction (TTL 15 мин после последней записи / max 1000 записей LRU-вытеснение) — спрей рандомных email не растит память (бюджет ≤500 MB RSS).
2. **WhatsApp GET verify timing-safe**: `hub.verify_token` сравнивается через length-guard + `timingSafeEqual`, не `===` (чеклист security-auditor §1).

**Acceptance Scenarios**:
1. **Given** 5000 неудачных попыток с разными email, **When** замер RSS/размера Map, **Then** Map ≤1000 записей, RSS в бюджете.
2. **Given** валидный verify_token, **When** GET-хендшейк, **Then** 200 + challenge; **Given** 5000 неверных токенов разной длины, **Then** 403 на всех, ни одного RangeError/500.

### US6 — Reconcile-окно GC-push (P3 — SRE)

Окно `gcal-reconcile` расширяется с 24 ч до 7 дней (горизонт слотов канон NFR-001) с сохранением `take: 50` и сортировкой по `updatedAt asc` — self-healing покрывает брони, изменённые в период простоя воркера.

**Acceptance Scenarios**:
1. **Given** бронь BOOKED изменена 3 дня назад с GC-событием, отставшим от scheduleVersion, **When** reconcile-цикл, **Then** push происходит (идемпотентный upsert), GC-событие синхронно.

---

## 3. Edge Cases

- **Оба секрета заданы частично** (`ADMIN_TOKEN` есть, `STAFF_WEBHOOK_SECRET` нет): fallback-цепочка сохраняется для *существующих* значений — fail-closed только при полном отсутствии.
- **`AbortSignal.timeout` в старом Node**: Node 22 LTS — нативно поддержан; polyfill не требуется.
- **501 на RESCHEDULE**: существующие клиенты (админка) не отправляют RESCHEDULE (UI-кнопки нет) — breaking-поверхности нет; контракт задокументирован в error-body.
- **Reconcile 7 дней**: `take: 50` + `updatedAt asc` — старейшие чинятся первыми; шторм после простоя дренируется циклами по 50.
- **timing-safe verify_token**: сравнение при разных длинах — length-guard до `timingSafeEqual` (ноль RangeError), ответ 403 идентичен по времени в пределах константного-времени сравнения.
- **Lockout eviction vs брутфорс одного email**: eviction по TTL не ослабляет лок атаки — активный лок (`lockedUntil` в будущем) не вытесняется.

## 4. Requirements

### Functional Requirements
- **FR-701 (Fail-closed reschedule secret)**: `getRescheduleSecret()` бросает при отсутствии обоих env-секретов; формат ошибки логируется `[RESCHEDULE_SECRET_UNCONFIGURED]`; тест «секрет отсутствует → генерация бросает, 0 ссылок создано».
- **FR-702 (Delivery-log salt fail-closed)**: отсутствие `DELIVERY_LOG_SALT` и `ADMIN_TOKEN` → записи с целью `UNHASHED` + boot-алерт; **не** используется `'undreseller-dl-salt'`.
- **FR-703 (RESCHEDULE 501)**: admin bookings `[id]` → `501` + JSON error; 0 мутаций БД; 0 audit-записей действия.
- **FR-704 (Amount invariant)**: `fulfillPayment` при `amountMinor !== order.totalMinor` или `currency !== order.currency` → `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request `idempotencyKey: amount_mismatch_<orderId>_<providerRef>`; совпадение — поведение без изменений.
- **FR-705 (Fetch timeouts)**: `AbortSignal.timeout(10_000)` на Resend send, NOWPayments invoice create, WhatsApp client; таймаут → существующий FAILED-путь.
- **FR-706 (Lockout registry bounded)**: eviction записей старше 15 мин; hard-cap 1000 записей (LRU); активный лок не вытесняется; тест на границу.
- **FR-707 (WhatsApp verify timing-safe)**: length-guard + `timingSafeEqual` на `hub.verify_token`.
- **FR-708 (Reconcile window 7d)**: `since = now - 7d`, `orderBy: updatedAt asc`, `take: 50`.

### Non-Functional Requirements
- **NFR-701 (Zero regression)**: 418+ тестов зелёные; 7 снапшотов 400-форм идентичны; `npm audit` 0 H/C; `tsc` чист.
- **NFR-702 (No new deps)**: `package.json` dependencies без изменений.
- **NFR-703 (Budget)**: замер RSS при 5000 спрей-попыток ≤500 MB (evidence).

## 5. Success Criteria

- **SC-001**: ни один публично известный секрет из кода не участвует в подписи/хешировании (grep-пруф + тесты).
- **SC-002**: money-path инвариант суммы покрыт контрактным тестом (mismatch → PAID_REQUIRES_RESOLUTION).
- **SC-003**: `/api/admin/bookings/[id]` RESCHEDULE → 501 (тест).
- **SC-004**: все исходящие fetch money/notify-пути имеют таймаут (grep-пруф: 0 fetch без signal).
- **SC-005**: 418+ тестов зелёные, снапшоты идентичны, `npm audit` 0 H/C.

## 6. Зафиксированные Решения (Clarifications)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: RESCHEDULE — 501 vs 422 | **501 Not Implemented** | Семантически честно: функция не реализована (не «невалидный ввод»); клиентский контракт ≤007 заменит на 200 |
| Q2: Lockout eviction — TTL vs LRU-cap | **Оба**: TTL 15 мин + hard-cap 1000 LRU | TTL закрывает stale-рост, cap — жёсткий потолок при спрее |
| Q3: Reconcile окно | 7 дней + `updatedAt asc` + `take: 50` | Горизонт слотов канон; старейшие — первыми |
| Q4: FR-702 UNHASHED vs отказ логирования | **UNHASHED + boot-алерт** | Сохранение диагностики; деградация видна оператору |
