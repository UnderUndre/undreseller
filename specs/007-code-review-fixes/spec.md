# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `007-code-review-fixes`
**Ветка:** `main` (single-branch lineage — та же grandfathered IX-девиация, что 004/005/006)
**Путь к спеке:** `undreseller/specs/007-code-review-fixes/spec.md`
**Статус:** **DRAFT — REVISION 1.2 (2026-11-02; review remediation F1–F6: provider-aware Stars/Stripe invariant, lockout spray defense, buffer-length timing-safe, whatsapp timeout-abort, reschedule error typing, telegram 503 answer)**
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

Магические reschedule-ссылки и delivery-логи перестают работать с дефолтными секретами из кода: без сконфигурированного env-секрета подпись **невозможна** (генерация бросает fail-closed ошибку, логируется алерт при старте), хеш-псевдонимизация delivery-лога не выдаёт псевдо-безопасность с фиксированной строкой, а `verifyMagicRescheduleToken` при неконфигурированном секрете выдает ошибку конфигурации `RESCHEDULE_SECRET_UNCONFIGURED` вместо маскировки под `DECODE_FAILURE`.

**Acceptance Scenarios**:
1. **Given** env без `STAFF_WEBHOOK_SECRET`/`ADMIN_TOKEN`, **When** staff вызывает reschedule-оффер, **Then** отправляется `answerCallbackQuery` с предупреждением и роут отвечает HTTP 503 с diagnose-логом `[RESCHEDULE_SECRET_UNCONFIGURED]` (канон unconfigured-dependency 006 OAuth), никакая ссылка с публично известным ключом не создаётся, Telegram-клиент не зависает.
2. **Given** env без `DELIVERY_LOG_SALT`/`ADMIN_TOKEN`, **When** пишется delivery-лог, **Then** цели не «хешируются» фиксированной солью из кода — запись помечается `UNHASHED` и стартовый алерт warns при буте.
3. **Given** env без секрета, **When** вызов `verifyMagicRescheduleToken`, **Then** `{ valid: false, reason: 'RESCHEDULE_SECRET_UNCONFIGURED' }`.

**Why P0**: единственные fail-open секреты в кодовой базе; контраст с каноном fail-closed.

### US2 — Честный контракт admin bookings RESCHEDULE (P1 — data integrity)

`POST /api/admin/bookings/[id]` с `action: 'RESCHEDULE'` отвечает `501 Not Implemented` с diagnostics вместо тихого 200-но-оп.

**Acceptance Scenarios**:
1. **Given** букинг, **When** `RESCHEDULE` на admin-роут, **Then** 501 + JSON `{ error: "RESCHEDULE is not implemented (planned <=007)" }`, БД не изменена, audit `BOOKING_RESCHEDULE` не пишется (действия не было).

### US3 — Инвариант суммы платежа (P1 — money path)

`fulfillPayment` сверяет сумму и валюту верифицированного webhook'а с заказом с учётом специфики провайдера:
- Для **TELEGRAM_STARS**: сверяется `currency === 'XTR'` и `amountMinor === (order.starsPrice ?? Math.max(1, Math.round(order.totalMinor / 2)))` (Stars оперирует целыми единицами XTR, тогда как заказ номинирован в фиате).
- Для остальных провайдеров (**STRIPE**, **CRYPTO_GATEWAY**): `amountMinor === order.totalMinor && currency.toUpperCase() === order.currency.toUpperCase()`.
- В `app/api/payments/stripe/webhook/route.ts` валюта извлекается из `parsed.currency` (не хардкодится `'USD'`).
Расхождение → `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request + алерт (канон OVERBOOKED-пути), **никогда** тихое `PAID`.

**Acceptance Scenarios**:
1. **Given** webhook с `amountMinor != order.totalMinor` (или несовпадением Stars XTR), **When** fulfillment, **Then** статус `PAID_REQUIRES_RESOLUTION`, `requiresOperatorAction: true`, оператор-алерт, сток/слот по канону collision-пути.
2. **Given** суммы совпадают (фиат или XTR), **When** fulfillment, **Then** статус `PAID` (0 регрессий, 418 тестов зелёные).
3. **Given** заказ `USD` и webhook Stripe `EUR`, **Then** — как (1) (mismatch по валюте = тот же путь).
4. **Given** заказ `USD` с `totalMinor: 10000` и webhook Telegram Stars `amountMinor: 5000, currency: 'XTR'`, **Then** статус `PAID` (валидный расчёт звезд, нет ложного mismatch).

### US4 — Сетевые таймауты на исходящих вызовах (P2 — SRE)

Все исходящие `fetch()` в money/notify-пути имеют таймаут: Resend (email), NOWPayments invoice creation, WhatsApp client — `AbortSignal.timeout(10_000)`; таймаут → `FAILED` delivery-статус по существующим веткам (не бросает 500 на route). В `whatsappClient` при `AbortError`/`TimeoutError` цикл retry прерывается немедленно без ожидания 30+ секунд.

**Acceptance Scenarios**:
1. **Given** зависший upstream (мок-сервер без ответа), **When** отправка email или WhatsApp, **Then** ≤10.5 с статус `FAILED` + delivery-лог, HTTP-обработчик не висит, лишние попытки не крутятся.
2. **Given** штатный upstream, **Then** 0 поведенческих изменений.

### US5 — Гигиена контура аутентификации (P2 — security hardening)

1. **Lockout-реестр bounded**: `Map` в `staffSignIn` с eviction (TTL 15 мин после последней записи / hard-cap 1000 записей LRU-вытеснение). Попытки фиксируются только для существующих пользователей `User`/`StaffMember` (спрей несуществующих адресов не засоряет реестр). При насыщении 1000 активных локов вытесняется запись с минимальным `lockedUntil` — бюджет ≤500 MB RSS гарантирован.
2. **WhatsApp GET verify timing-safe**: `hub.verify_token` сравнивается через проверку длины буферов `bufA.length === bufB.length` + `timingSafeEqual`, не `===` (чеклист security-auditor §1, ноль RangeError на multi-byte строках).

**Acceptance Scenarios**:
1. **Given** 5000 неудачных попыток с разными email (включая спрей по несуществующим адресам), **When** замер RSS/размера Map, **Then** Map ≤1000 записей, RSS в бюджете.
2. **Given** валидный verify_token, **When** GET-хендшейк, **Then** 200 + challenge; **Given** 5000 неверных токенов разной длины и multi-byte символов, **Then** 403 на всех, ни одного RangeError/500.

### US6 — Reconcile-окно GC-push (P3 — SRE)

Окно `gcal-reconcile` расширяется с 24 ч до 7 дней (горизонт слотов канон NFR-001) с сохранением `take: 50` и сортировкой по `updatedAt asc` — self-healing покрывает брони, изменённые в период простоя воркера.

**Acceptance Scenarios**:
1. **Given** бронь BOOKED изменена 3 дня назад с GC-событием, отставшим от scheduleVersion, **When** reconcile-цикл, **Then** push происходит (идемпотентный upsert), GC-событие синхронно.

---

## 3. Edge Cases

- **Оба секрета заданы частично** (`ADMIN_TOKEN` есть, `STAFF_WEBHOOK_SECRET` нет): fallback-цепочка сохраняется для *существующих* значений — fail-closed только при полном отсутствии.
- **Telegram Stars и Stripe в инварианте**: Telegram Stars использует деноминацию в XTR (`amountMinor === (order.starsPrice ?? Math.round(order.totalMinor / 2))` и `currency === 'XTR'`), тогда как Stripe и Crypto используют номинал фиата заказа (`amountMinor === order.totalMinor` и равенство валюты без учета регистра).
- **`AbortSignal.timeout` и retry в WhatsApp**: сетевой таймаут `AbortError`/`TimeoutError` немедленно завершает цикл попыток (break) — защита от мультипликации задержки 3×10 с.
- **501 на RESCHEDULE**: существующие клиенты (админка) не отправляют RESCHEDULE (UI-кнопки нет) — breaking-поверхности нет; контракт задокументирован в error-body.
- **Reconcile 7 дней**: `take: 50` + `updatedAt asc` — старейшие чинятся первыми; шторм после простоя дренируется циклами по 50.
- **timing-safe verify_token**: сравнение байтовых длин буферов `Buffer.from(a).length !== Buffer.from(b).length` до `timingSafeEqual` (ноль RangeError даже при multi-byte UTF-8).
- **Lockout eviction vs брутфорс и спрей**: попытки регистрируются только для существующих пользователей `User`/`StaffMember`; при 1000 активных локах вытесняется запись с ближайшим временем разблокировки (`min(lockedUntil)`).

## 4. Requirements

### Functional Requirements
- **FR-701 (Fail-closed reschedule secret)**: `getRescheduleSecret()` бросает при отсутствии обоих env-секретов; `verifyMagicRescheduleToken` возвращает `{ valid: false, reason: 'RESCHEDULE_SECRET_UNCONFIGURED' }`; формат ошибки логируется `[RESCHEDULE_SECRET_UNCONFIGURED]`; HTTP-слой staff webhook шлет alert-ответ на callback query и отвечает **503**; тест «секрет отсутствует → 503, 0 ссылок создано».
- **FR-702 (Delivery-log salt fail-closed)**: отсутствие `DELIVERY_LOG_SALT` и `ADMIN_TOKEN` → записи с целью `UNHASHED` + boot-алерт; **не** используется `'undreseller-dl-salt'`.
- **FR-703 (RESCHEDULE 501)**: admin bookings `[id]` → `501` + JSON error; 0 мутаций БД; 0 audit-записей действия.
- **FR-704 (Amount invariant)**: `fulfillPayment` валидирует сумму и валюту с учётом провайдера: для `TELEGRAM_STARS` — `amountMinor === (order.starsPrice ?? Math.max(1, Math.round(order.totalMinor / 2))) && currency === 'XTR'`; для остальных провайдеров — `amountMinor === order.totalMinor && currency.toUpperCase() === order.currency.toUpperCase()`; в Stripe webhook роуте валюта берётся из данных платежа (`parsed.currency`); при несовпадении → `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request `idempotencyKey: amount_mismatch_<orderId>_<providerRef>`; совпадение — поведение без изменений.
- **FR-705 (Fetch timeouts)**: `AbortSignal.timeout(10_000)` на Resend send, NOWPayments invoice create, WhatsApp client; в WhatsApp client таймаут прерывает цикл повторов; таймаут → существующий FAILED-путь.
- **FR-706 (Lockout registry bounded)**: запись попыток только для существующих пользователей; eviction записей старше 15 мин; hard-cap 1000 записей (LRU); при насыщении активными локами вытесняется `min(lockedUntil)`; тест на границу.
- **FR-707 (WhatsApp verify timing-safe)**: проверка равенства длин `Buffer.byteLength` + `timingSafeEqual` на `hub.verify_token`.
- **FR-708 (Reconcile window 7d)**: `since = now - 7d`, `orderBy: updatedAt asc`, `take: 50`.

### Non-Functional Requirements
- **NFR-701 (Zero regression)**: 418+ тестов зелёные; 7 снапшотов 400-форм идентичны; `npm audit` 0 H/C; `tsc` чист.
- **NFR-702 (No new deps)**: `package.json` dependencies без изменений.
- **NFR-703 (Budget)**: замер RSS при 5000 спрей-попыток ≤500 MB; сырой json-лог замера — `specs/007-code-review-fixes/evidence/lockout-rss.json` (Level 1 Evidence, Constitution XII).

## 5. Success Criteria

- **SC-001**: ни один публично известный секрет из кода не участвует в подписи/хешировании (grep-пруф + тесты).
- **SC-002**: money-path инвариант суммы покрыт контрактными тестами (Telegram Stars happy/mismatch, Stripe multi-currency, crypto gateway).
- **SC-003**: `/api/admin/bookings/[id]` RESCHEDULE → 501 (тест).
- **SC-004**: все исходящие fetch money/notify-пути имеют таймаут (grep-пруф: 0 fetch без signal, WhatsApp timeout ≤10.5 с).
- **SC-005**: 418+ тестов зелёные, снапшоты идентичны, `npm audit` 0 H/C.

## 6. Зафиксированные Решения (Clarifications)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: RESCHEDULE — 501 vs 422 | **501 Not Implemented** | Семантически честно: функция не реализована (не «невалидный ввод»); клиентский контракт ≤007 заменит на 200 |
| Q2: Lockout eviction — TTL vs LRU-cap | **Оба**: TTL 15 мин + hard-cap 1000 LRU + `userExists` guard + `min(lockedUntil)` fallback | Закрывает и утечку, и брутфорс, и спрей-DoS по несуществующим адресам |
| Q3: Reconcile окно | 7 дней + `updatedAt asc` + `take: 50` | Горизонт слотов канон; старейшие — первыми |
| Q4: FR-702 UNHASHED vs отказ логирования | **UNHASHED + boot-алерт** | Сохранение диагностики; деградация видна оператору |
| Q5: Stars/Stripe валюта в инварианте | **Provider-aware инвариант** | Stars использует `XTR` и целые звёзды; Stripe передаёт валюту сессии |
