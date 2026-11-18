# Requirements Audit Report: 014-composite-booking

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1)
- **Audit Date**: 2026-11-18
- **Audited**: `specs/014-composite-booking/spec.md` rev 1.1 (`FR-1401..1406`, `NFR-1401..1406`, `SC-001..006`)

---

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Обнаружено нарушений: **0**.
- Все требования квантованы детерминированными порогами:
  - `FR-1402`: `1 ≤ items.length ≤ 6` (`MAX_ITEMS = 6`), `Σ durationMin ≥ 5`, `Σ durationMin ≤ 480` (`MAX_COMPOSITE_MIN`), детерминированные коды `422 MIXED_PAYMENT_MODES / ADDON_ONLY_BASKET / COMPOSITE_TOO_LONG / COMPOSITE_INVALID`, `400 VALIDATION_FAILED` при одновременном `productId+items`.
  - `FR-1403`: composite-грид на чистом `computeSlots` (параметризован), `GET /api/availability p95 < 50 ms` (`NFR-1403`), ровно один `201` + один `409` в гонке.
  - `FR-1404`: `Order.amount = Σ priceInUSD` в minor units, PaymentIntent = `Σ depositAmount` при DEPOSIT, idempotency-ключ = `HMAC(email + sorted(items) + startIso)`.
  - `FR-1405`: staff-карточка ≤ 4 строк позиций + `+N ещё`; itemized surfaces из snapshot.
  - `FR-1406`: `pnpm eval:ai` и 013 int-тесты без правок ведут себя идентично.
  - `NFR-1401..1406`: `212+` int-тестов зелёных, 0 новых deps, Expand-only миграция с `down()`, fail-closed валидация ДО создания intent.

### 2. Матрица конфликтов (Gate 2: Consistency Cross-Check)

| ID 1 | ID 2 | Суть потенциального конфликта | Вердикт |
| :--- | :--- | :--- | :--- |
| FR-1404 (refund контейнера, cutoff primary) | 003 canon (`cancellationCutoffHours` per product, refund full amount) | Риск per-item cutoff/refund зоопарка | ✅ Разрешено: контейнер = ОДНА бронь; cutoff primary позиции; refund всей суммы; per-item refund запрещён Via Negativa §1.3 |
| FR-1402 (phase 2 re-derive цен) | 007 F5 (гидратация фазы 2 строго из БД) | Риск подмены состава/цен в теле фазы 2 | ✅ Разрешено: состав (ids) гидратируется из `booking_intents.items_json`; цены re-derive из живых продуктов сервером; drift длительности → intent dead (Edge Case зафиксирован) |
| FR-1403 (composite grid) | FR-205 / NFR-1403 (`availability p95 < 50 ms`) | Риск доп. SQL на composite-грид | ✅ Разрешено: та же одна выборка busy + pure `computeSlots` с подменёнными параметрами; 0 новых запросов |
| FR-1402 (`productId` + `items` одновременно → 400) | NFR-1406 (backward compat) | Риск сломать текущий контракт | ✅ Разрешено: одиночный `productId` = `items=[productId]` побитово; конфликт только при явной двойной передаче |
| FR-1406 (013 без изменений) | US5 (serviceName для триажа) | Риск задеть 013-контур | ✅ Изолировано: `item_id = primary productId`, промпт = primary title; 013 int-тесты остаются зелёными без правок |
| FR-1401 (`items_json` snapshot) | GDPR purge (008/013) | Риск PII в snapshot | ✅ Разрешено: `items_json` содержит только данные магазина (title/price/duration); customer-поля purge не меняются |

### 3. Анализ полноты (Gate 3: Completeness & Boundary Coverage)

- **Edge-cases**: **ДА** — дубликаты (qty), одни addOn, Σ > 480, Σ не влезает в день (пустой грид), drift цен/длительности между фазами, гонка composite span (409), смежные брони с буферами, trust-cookie + items, подмена items в фазе 2, одновременный `productId+items`, OUT_CALL контейнер, GDPR purge.
- **Fallback-стратегии**: **ДА** — intent dead при drift; 409 при проигранной гонке; honest `noSlotsAvailable`; fail-closed валидация ДО intent.
- **Границы**: N=1 (single item = legacy path), N=6 (кап), Σ=480 (кап), durationMin=0 (addOn), durationMin=5 (минимум не-addOn) — зафиксированы.

### 4. Однозначность терминологии (Gate 4: Unambiguity)

- Единый словарь: `items[]` (API) ↔ `items_json` (БД) ↔ «позиции» (UI); `primary` = первая не-addOn позиция; `addOn` = позиция с опциональным durationMin=0; «контейнер» = единственная SlotReservation корзины. Нарушений: **0**.

### 5. Итоговый статус гейта

- **GATE VERDICT**: **PASS**
- **Business plan**: `Business plan: unchanged` — фича реализует §2.2 BP-канона («мульти-сервисная корзина с шагом 30 минут»); дельты ICP/цен/рельсов нет.
- **Next step**: `/speckit.plan`.
