# Test Cases: 007-code-review-fixes (ISO/IEC/IEEE 29119-3)

**Generated**: 2026-10-31 (`/speckit.test-design`) · **Slug-префикс**: TC-007-NNN · **Всего TC**: 22
**Соотношение Positive / Negative+Boundary**: 7 / 15 (32% / 68% — требование ≥40/60 выполнено)

**Общие предусловия (если не указано иное)**: чистый инстанс; все тесты — юнит/контрактные на моках (канон 006: jest + fake timers); env-матрица изолируется `process.env` save/restore в beforeEach.

---

## US1: Fail-closed секреты (FR-701, FR-702)

### TC-007-001: оба секрета отсутствуют → 503, 0 ссылок создано
- **Traceability**: FR-701 · Task T010 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: EP (env-absent)
- **Pre-conditions**: `STAFF_WEBHOOK_SECRET` и `ADMIN_TOKEN` удалены из env; авторизованный staff
- **Execution Steps**: 1) staff-бот вызывает reschedule-оффер по заказу `ORD-TEST-1`; 2) инспекция БД на новые magic-токены
- **Expected Result**: HTTP 503; лог `[RESCHEDULE_SECRET_UNCONFIGURED]`; 0 записей токенов; подпись с публично известным ключом невозможна
- **Post-conditions**: восстановить env

### TC-007-002: один секрет задан → fallback работает
- **Traceability**: FR-701 · Task T010 · **Tier**: Sanity · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: задан только `ADMIN_TOKEN="test-admin-token-007"`
- **Execution Steps**: вызвать reschedule-оффер
- **Expected Result**: 200; ссылка сгенерирована; подпись верифицируется ключом `test-admin-token-007` (unit-проверка HMAC)

### TC-007-003: оба секрета заданы → primary приоритет
- **Traceability**: FR-701 · Task T010 · **Tier**: Sanity · **Priority**: P2 · **Type**: Functional · **Technique**: Decision Table
- **Pre-conditions**: `STAFF_WEBHOOK_SECRET="whsec-staff-007"`, `ADMIN_TOKEN="test-admin-token-007"`
- **Expected Result**: подпись вычислена `STAFF_WEBHOOK_SECRET` (primary), не ADMIN_TOKEN

### TC-007-004: соль отсутствует → UNHASHED + boot-алерт
- **Traceability**: FR-702 · Task T011 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: EP
- **Pre-conditions**: `DELIVERY_LOG_SALT` и `ADMIN_TOKEN` удалены
- **Execution Steps**: записать delivery-лог для цели `+79990000000`
- **Expected Result**: поле цели = `UNHASHED` (не `sha256('undreseller-dl-salt'...)`); boot-алерт `[DELIVERY_LOG_SALT_UNCONFIGURED]`; строка `'undreseller-dl-salt'` отсутствует в исходниках lib (grep)

### TC-007-005: соль задана → хеш-псевдонимизация
- **Traceability**: FR-702 · Task T011 · **Tier**: Sanity · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: `DELIVERY_LOG_SALT="salt-007"`
- **Expected Result**: цель = детерминированный хеш от `salt-007` + `+79990000000`; повторная запись даёт тот же хеш

### TC-007-006: grep-пруф отсутствия дефолтных секретов
- **Traceability**: FR-701, FR-702 · Task T010, T011 · **Tier**: Smoke · **Priority**: P0 · **Type**: Security · **Technique**: Error Guessing
- **Execution Steps**: `grep -rn "default-sovereign-reschedule-secret\|undreseller-dl-salt" lib/`
- **Expected Result**: 0 вхождений

---

## US2: RESCHEDULE 501 (FR-703)

### TC-007-007: RESCHEDULE → 501, БД и audit не тронуты
- **Traceability**: FR-703 · Task T012 · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: EP
- **Pre-conditions**: букинг `bk-1` в БД (снапшот состояния); OPERATOR-сессия
- **Execution Steps**: 1) `PATCH /api/admin/bookings/bk-1` с body `{ "action": "RESCHEDULE" }`; 2) сравнить состояние БД и AuditEvent до/после
- **Expected Result**: 501 + `{"error":"RESCHEDULE is not implemented (planned <=007)"}`; байт-идентичное состояние строки заказа/reservation; 0 новых AuditEvent

---

## US3: Инвариант суммы (FR-704)

### TC-007-008: happy-path суммы совпадают — поведение без изменений
- **Traceability**: FR-704 · Task T013 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: заказ `totalMinor=15000, currency=USD`; мок webhook `amountMinor=15000, currency=USD`
- **Expected Result**: статус `PAID`, сток/слот по канону, `requiresOperatorAction: false` — байт-идентично до фикса

### TC-007-009: недоплата на 1 minor → PAID_REQUIRES_RESOLUTION (BVA)
- **Traceability**: FR-704 · Task T013 · **Tier**: Regression · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA (14999/15000/15001)
- **Test Data**: amountMinor = 14999 | 15000 | 15001
- **Expected Result**: 14999 → `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + RefundOperation `idempotencyKey: amount_mismatch_<orderId>_<providerRef>`; 15000 и 15001 → `PAID` (переплата 15001 — тоже mismatch? нет: инвариант равенства, 15001 → mismatch-путь)
- **Post-conditions**: очистить тестовые RefundOperation

### TC-007-010: валюта mismatch → тот же путь
- **Traceability**: FR-704 · Task T013 · **Tier**: Sanity · **Priority**: P1 · **Type**: Negative · **Technique**: EP
- **Test Data**: заказ USD, webhook currency=EUR, суммы равны
- **Expected Result**: `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION`; PaymentEvent записан (ledger факта)

### TC-007-011: ретрай того же providerRef после mismatch → ALREADY_PAID no-op
- **Traceability**: FR-704 · Task T013 · **Tier**: Regression · **Priority**: P1 · **Type**: Error Guessing · **Technique**: State Transition
- **Execution Steps**: 1) mismatch-платёж (TC-009); 2) повторный webhook с тем же `providerRef`
- **Expected Result**: `ALREADY_PAID`, вторая RefundOperation не создана (idempotencyKey UNIQUE)

---

## US4: Таймауты fetch (FR-705)

### TC-007-012: зависший upstream → FAILED ≤10.5 с
- **Traceability**: FR-705 · Task T014 · **Tier**: Sanity · **Priority**: P1 · **Type**: Boundary · **Technique**: Error Guessing (network hang)
- **Pre-conditions**: мок-сервер без ответа (или mock fetch без resolve); fake timers
- **Execution Steps**: 1) отправка email через Resend-адаптер; 2) промотать время на 10.1 с
- **Expected Result**: `AbortError` → статус `FAILED` + delivery-лог с errorCode; вызов не висит дольше 10.5 с; то же для NOWPayments invoice create и WhatsApp client (3 под-кейса)

### TC-007-013: grep-пруф сигнатуры таймаутов
- **Traceability**: FR-705 · Task T014 · **Tier**: Smoke · **Priority**: P1 · **Type**: Security · **Technique**: EP
- **Execution Steps**: `grep -rn "AbortSignal.timeout" lib/email/emailProvider.ts lib/payments/nowpayments.ts lib/bot/whatsappClient.ts`
- **Expected Result**: 3 вхождения (по одному на файл)

---

## US5: Lockout registry + WhatsApp verify (FR-706, FR-707)

### TC-007-014: BVA размера реестра 999/1000/1001
- **Traceability**: FR-706 · Task T015 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA
- **Execution Steps**: заполнить lockout-реестр 999 → 1000 → 1001 записями (разные email, все с истёкшими локами)
- **Expected Result**: 999/1000 — все хранятся; 1001 — самая старая вытеснена, размер = 1000

### TC-007-015: активный лок не вытесняется
- **Traceability**: FR-706 · Task T015 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: Error Guessing
- **Pre-conditions**: email `victim@test` — 5 фейлов → `lockedUntil` в будущем; реестр заполнен до cap
- **Execution Steps**: добавить новые записи до вытеснения
- **Expected Result**: `victim@test` с активным `lockedUntil` остаётся в реестре (брутфорс-защита не ослаблена); вытесняются только expired-записи

### TC-007-016: спрей 5000 email → Map ≤1000 + RSS evidence
- **Traceability**: FR-706, NFR-703 · Task T015, T021 · **Tier**: Extended · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (насыщение)
- **Execution Steps**: 5000 неудачных попыток с уникальными email; замер `lockoutRegistry.size` и `process.memoryUsage().rss` до/после
- **Expected Result**: size ≤1000; RSS ≤500 MB; сырой json → `evidence/lockout-rss.json` (до/после/size)

### TC-007-017: валидный verify_token → 200 + challenge
- **Traceability**: FR-707 · Task T016 · **Tier**: Smoke · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Test Data**: `WHATSAPP_VERIFY_TOKEN="vt-007"`, GET `?hub.mode=subscribe&hub.verify_token=vt-007&hub.challenge=CH-123`
- **Expected Result**: 200, body `CH-123`

### TC-007-018: неверный/разной длины токен → 403, ноль RangeError
- **Traceability**: FR-707 · Task T016 · **Tier**: Regression · **Priority**: P1 · **Type**: Security · **Technique**: BVA
- **Test Data**: `vt-00` (короче), `vt-007-x` (длиннее), `vt-007` с модифицированным байтом, пустой
- **Expected Result**: 403 на все; лог 0 RangeError/500; отсутствие timing- leakage не проверяем инструментально (length-guard документирован)

---

## US6: Reconcile окно (FR-708)

### TC-007-019: бронь изменённая 3 дня назад попадает в sweep
- **Traceability**: FR-708 · Task T017 · **Tier**: Smoke · **Priority**: P2 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: BOOKED-заказ с `updatedAt = now-3d`, мок GC
- **Expected Result**: заказ в выборке reconcile; push вызван; окно 7 дней покрывает

### TC-007-020: шторм 60 заказов дренируется батчами
- **Traceability**: FR-708 · Task T017 · **Tier**: Sanity · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA (take 50)
- **Pre-conditions**: 60 BOOKED-заказов в окне
- **Expected Result**: за один цикл обработано ≤50, отсортированных `updatedAt asc`; оставшиеся 10 — в следующем цикле

---

## CI-гейты (NFR)

### TC-007-021: полный regression-гейт
- **Traceability**: NFR-701 · Task все · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: EP (гейт)
- **Execution Steps**: `npm run validate && npm test && npm audit --audit-level=high`
- **Expected Result**: tsc 0 ошибок; ≥52 suites / ≥436 tests PASS; 7 снапшотов 400-форм идентичны; audit exit 0

### TC-007-022: 0 новых dependencies
- **Traceability**: NFR-702 · Task все · **Tier**: Smoke · **Priority**: P2 · **Type**: Functional · **Technique**: EP
- **Execution Steps**: `git diff <base> -- package.json`
- **Expected Result**: секция dependencies/devDependencies без изменений (только фиксы кода)

---

## Defect Report Template (для прогонов)

```
[DEF-###] Severity: Blocker|Critical|Major|Minor
Environment: staging/preview + commit SHA
Related TC: TC-007-NNN
Steps to Reproduce: ...
Actual vs Expected: ...
Level 1 Evidence: raw log / curl / response JSON
```
