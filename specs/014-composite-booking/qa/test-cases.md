# Test Case Specifications (ISO/IEC/IEEE 29119-3): 014-composite-booking

> **Соотношение**: 9 Positive / 15 Negative+Boundary = 24 TC (`38% / 62%` — порог ≥ 40/60 негативных соблюдён с учётом pure-валидаторов).

---

### TC-014-001: Expand-only миграция up ×2 + down на чистой и существующей БД

- **Traceability**: FR-1401, NFR-1404, T1404
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: чистая `undreseller_test` с миграциями 001–013.
- **Test Data**: миграция `20261118_000002_composite_booking`.
- **Execution Steps**: 1) `payload migrate`; 2) повторный `up()`; 3) `down()`; 4) проверка колонок.
- **Expected Result**: шаги 1–2 без ошибок; после 3 удалены только `items_json` ×2, `products.add_on` и `_products_v.version_add_on` (twin-column, fix AG-F1); данные 001–013 целы.
- **Post-conditions**: повторный `up()`.

### TC-014-002: Валидатор `Product.addOn` (durationMin 0 разрешён только при addOn)

- **Traceability**: FR-1401, T1402
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Negative/Boundary · **Technique**: BVA
- **Test Data**: A: `addOn=false, durationMin=0` → reject; B: `addOn=true, durationMin=0` → accept; C: `addOn=true, durationMin=4` → accept; D: `addOn=false, durationMin=4` → reject.
- **Expected Result**: строго по валидатору коллекции (4 кейса).

### TC-014-003: Legacy parity — `productId` одиночный побитово идентичен

- **Traceability**: FR-1402, NFR-1406, T1413, T1420
- **Tier**: [Smoke] · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Execution Steps**: бронь по `productId="A"` до/после 014 (test fixtures) — сравнить статус, amount, paymentIntent (mock), письмо, карточку.
- **Expected Result**: побитовая идентичность; `items` в ответе = 1 позиция.

### TC-014-004: Happy path composite — Σ длительность, Σ цена, snapshot

- **Traceability**: FR-1402/1404, T1420
- **Tier**: [Smoke] · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Test Data**: A(60min/$100,NONE) + B(15min/$20,NONE) → старт валидный.
- **Expected Result**: `201`; одна SlotReservation 75 мин; `orders.amount = 0` (NONE — канон списываемой суммы 003/012, fix AG-F2); `totalPriceInUSD = 120` в ответе; `items_json` = 2 позиции (primary первым); response `totalDurationMin=75`.

### TC-014-005: AddOn-позиция не двигает span и добавляет цену

- **Traceability**: FR-1402/1405, T1410
- **Tier**: [Smoke] · **Priority**: P0 · **Type**: Functional/Boundary · **Technique**: BVA
- **Test Data**: A(60min/$100) + addOn(0min/$15).
- **Expected Result**: span 60 мин; `orders.amount = 0` (NONE — канон списываемой суммы, fix AG-F2), `totalPriceInUSD = 115` в ответе; snapshot содержит addOn с `durationMin: 0`.

### TC-014-006: `ADDON_ONLY_BASKET` — корзина из одних addOn

- **Traceability**: FR-1402, NFR-1405, T1413
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Negative · **Technique**: EP
- **Expected Result**: `422 ADDON_ONLY_BASKET`; 0 строк в `booking_intents`/`slot_reservations`/`orders`.

### TC-014-007: `MIXED_PAYMENT_MODES` — неоднородный режим

- **Traceability**: FR-1402, Via Negativa, T1410
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Negative · **Technique**: EP
- **Test Data**: A(DEPOSIT) + B(NONE).
- **Expected Result**: `422 MIXED_PAYMENT_MODES`, 0 строк.

### TC-014-008: BVA капов — 6/7 позиций, Σ=480/481

- **Traceability**: FR-1402, T1410
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA
- **Test Data**: 6 позиций Σ≤480 → accept; 7 позиций → `422 COMPOSITE_TOO_LONG`; Σ=480 → accept; Σ=481 → `422 COMPOSITE_TOO_LONG`.
- **Expected Result**: строго по капам; отказы до intent.

### TC-014-009: Фаза 2 — подмена items игнорируется; drift → intent dead

- **Traceability**: FR-1402 (007 F5), T1412
- **Tier**: [Regression] · **Priority**: P0 · **Type**: Security · **Technique**: State Transition
- **Execution Steps**: фаза 1 с `items=[A,B]` → фаза 2 `{intentId, otp, items: [C]}`; отдельно: изменить `durationMin` продукта A в БД → фаза 2.
- **Expected Result**: кейс 1: состав из БД (A,B), подмена проигнорирована; кейс 2: `INTENT_DEAD`, 0 броней.

### TC-014-010: Composite grid — слоты контейнерной длительности на квант-сетке

- **Traceability**: FR-1403, T1411
- **Tier**: [Smoke] · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA
- **Test Data**: день 9:00–18:00, quantum 30, Σ=75.
- **Expected Result**: слоты 9:00/9:30/10:00… с `end = start+75`; `GET /api/availability?items=…` идентичен внутреннему гриду.

### TC-014-011: Max-buffers контейнера отодвигают соседей

- **Traceability**: FR-1403, T1411
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA
- **Test Data**: A(bufferAfter=10) + B(bufferAfter=0); существующая бронь вплотную до старта.
- **Expected Result**: контейнер не стартует в зазор < 10 мин после чужой брони (max buffer применён).

### TC-014-012: Гонка composite×composite на один старт → 201 + 409

- **Traceability**: FR-1403, NFR-1405, T1420
- **Tier**: [Regression] · **Priority**: P0 · **Type**: Concurrency · **Technique**: State Transition
- **Execution Steps**: два параллельных POST одной корзины на один старт.
- **Expected Result**: ровно один `201`, второй `409 SLOT_TAKEN`; 0 double-booking (GiST бэкстоп).

### TC-014-013: Смежные брони с нулевыми буферами легальны (GiST adjacency)

- **Traceability**: FR-1403, T1411
- **Tier**: [Sanity] · **Priority**: P2 · **Type**: Boundary · **Technique**: EP
- **Expected Result**: контейнер 9:00–10:15 и чужая бронь 10:15–11:00 сосуществуют (стык без пересечения).

### TC-014-014: DEPOSIT-корзина — PaymentIntent = Σ depositAmount

- **Traceability**: FR-1404, T1420
- **Tier**: [Smoke] · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Test Data**: A(DEPOSIT dep$25) + B(DEPOSIT dep$10), все DEPOSIT.
- **Expected Result**: один PaymentIntent `3500` minor; `orders.amount = 3500` (Σ депозитов — канон списываемой суммы, fix AG-F2: иначе `assertProviderAmountMatch` падает `AMOUNT_MISMATCH` и бронь никогда не CONFIRMED); FSM PREPAID track; вебхук → CONFIRMED контейнера.

### TC-014-015: FULL_PREPAYMENT корзина — PaymentIntent = Σ price

- **Traceability**: FR-1404, T1420
- **Tier**: [Smoke] · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Expected Result**: PaymentIntent = Σ priceInUSD; `orders.amount = Σ priceInUSD` (FULL_PREPAYMENT — списываемая = полная, fix AG-F2); depositAmount позиций игнорируются.

### TC-014-016: Idempotency по составу — сортировка и повтор

- **Traceability**: FR-1404, T1420
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Boundary · **Technique**: EP
- **Execution Steps**: бронь `items=[A,B]` → повтор `items=[B,A]` тот же email/старт.
- **Expected Result**: возврат существующей брони (тот же reservationId), 0 новых строк; другой состав/старт = новая бронь.

### TC-014-017: Отмена контейнера — refund по primary cutoff, вся сумма

- **Traceability**: FR-1404, 003 canon, T1420
- **Tier**: [Regression] · **Priority**: P0 · **Type**: Functional · **Technique**: State Transition
- **Test Data**: primary cutoff=3h; DEPOSIT-корзина оплачена; отмена за 4ч / за 2ч.
- **Expected Result**: за 4ч → refund полной суммы депозита; за 2ч → удержание; per-item refund отсутствует.

### TC-014-018: OUT_CALL контейнер → PENDING_APPROVAL, staff approve/release

- **Traceability**: FR-1402, T1420
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Expected Result**: хоть одна outCall позиция → `PENDING_APPROVAL`; approve → BOOKED; reject → RELEASED (+waitlist notify как сегодня).

### TC-014-019: Itemized staff-карточка (primary первым, ≤4 строк + «+N ещё»)

- **Traceability**: FR-1405, T1430
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: UI/Functional · **Technique**: EP
- **Expected Result**: карточка содержит primary строку + addOn/доп-строки в порядкеClarifications; 6 позиций (максимум корзины `MAX_ITEMS=6`) → 4 строки + `+2 ещё` (fix AG-F8; 7 позиций отсекается `422 COMPOSITE_TOO_LONG` на входе).

### TC-014-020: Itemized confirmation email из snapshot + legacy fallback

- **Traceability**: FR-1405, T1430
- **Tier**: [Sanity] · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Expected Result**: письмо показывает состав/цены из `items_json`; строка с `items_json IS NULL` (legacy) рендерит single-item по `item_id`.

### TC-014-021: `/book/[slug]` multi-select UI — бегущий итог и пересчёт грида

- **Traceability**: FR-1405, T1432
- **Tier**: [Smoke] · **Priority**: P1 · **Type**: UI-UX · **Technique**: EP
- **Execution Steps**: открыть услугу → тикнуть addOn и вторую услугу → проверить итог Σ и перезагрузку грида под Σ.
- **Expected Result**: итог обновляется; сабмит шлёт `items[]`; i18n ru/en присутствует.

### TC-014-022: Approvals payload с items (OPERATOR+), legacy null

- **Traceability**: FR-1405, T1431
- **Tier**: [Sanity] · **Priority**: P2 · **Type**: Functional · **Technique**: EP
- **Expected Result**: composite-бронь отдаёт массив `items`; legacy-бронь — `items: null` (UI рисует из serviceTitle).

### TC-014-023: 013 compatibility — aiTriage по primary, составы не задеты

- **Traceability**: FR-1406, T1433
- **Tier**: [Regression] · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Expected Result**: триаж composite-брони ищет product по primary `item_id`; `pnpm eval:ai` датасет без изменений; все 013 int-тесты зелёные.

### TC-014-024: GDPR purge не задевает `items_json`

- **Traceability**: FR-1406, T1433
- **Tier**: [Regression] · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA
- **Execution Steps**: RELEASED бронь 91 день с заполненным `items_json` → `runGdprPurge`.
- **Expected Result**: customer-поля анонимизированы, `items_json` сохранён (0 PII клиента).
