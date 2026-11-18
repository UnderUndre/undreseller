# Interface Contracts: 014-composite-booking

**Date**: 2026-11-18

---

## 1. Public HTTP API Delta: `POST /api/booking`

- **Request body (additive)**:
  ```json
  {
    "items": ["12", "15"],
    "start": "2026-12-01T10:00:00.000Z",
    "customerName": "Ivan", "customerPhone": "+971501234567", "customerEmail": "ivan@example.com",
    "customerNotes": "Фильтр уже куплен"
  }
  ```
- **Правила приёма**:
  - `productId` (старый контракт) при отсутствии `items` = `items=[productId]` (побитовая совместимость).
  - `productId` И `items` одновременно → `400 VALIDATION_FAILED` (однозначность).
  - `items` не массив строк / пустой → `400 VALIDATION_FAILED`.
- **Валидационные отказы (fail-closed ДО intent, все `422` + error-shape снапшот)**:
  - `COMPOSITE_INVALID` — позиция не существует / не bookable / deletedAt **в мульти-корзине (`items.length ≥ 2`)**.
  - `COMPOSITE_TOO_LONG` — `Σ durationMin > 480` или `items.length > 6`.
  - `MIXED_PAYMENT_MODES` — неоднородный paymentMode (бесплатные addOn-позиции `addOn && priceInUSD===0 && depositAmount===0` **нейтральны**: наследуют режим корзины, не триггерят отказ — fix AG-F4.1).
  - `ADDON_ONLY_BASKET` — **нет ни одной не-addOn позиции ИЛИ `Σ durationMin < 5`** (позиционный порядок не важен; `[addOnId, primaryId]` легален и нормализуется primary-first — fix AG-F5).
  - `INVALID_DEPOSIT_AMOUNT` — DEPOSIT-корзина с `Σ depositAmount = 0` или FULL_PREPAYMENT с `Σ priceInUSD = 0` (fix AG-F4.3).
- **Legacy parity (fix AG-F5.2)**: одиночный вход (`productId` или `items.length === 1`) при несуществующем/deleted продукте → `404 SERVICE_NOT_FOUND`, при `bookable !== true` → `422 SERVICE_NOT_BOOKABLE` (канон `route.ts:140-141` / `booking-service.int.spec.ts:100-114`); новые 422-коды — только для мульти-корзин.
- **Response (201/202, additive)**: существующие поля + `items: [{ productId, title, durationMin, priceInUSD, depositAmount, addOn }]` + `totalDurationMin` + `totalPriceInUSD` (+ `totalDepositInUSD` при DEPOSIT) — полная стоимость корзины; `orders.amount` остаётся каноном 003/012 списываемой суммы и в ответе не переопределяется (fix AG-F2). `accessToken`/токены — как сегодня.

## 2. `GET /api/availability` Delta

- Параметр `items` (повторяемый query-param: `?service=12&items=12&items=15&date=...`): сервер деривит composite duration (Σ) + max-buffers и возвращает грид контейнерной длительности. Без `items` — поведение без изменений. Невалидный состав → `422 COMPOSITE_INVALID` / `COMPOSITE_TOO_LONG`. Вызов с `items[]` без `service` легален: `effectiveService = service ?? items[0]` (fix AG-F3.1). **Кэш**: `cacheKey` обязан включать канонизированный `items` (`${service}:${items.join(',')}:${date}:${resourceId}`) — иначе 60-мин грид кэшируется под ключом, который затем читает 90-мин запрос (и наоборот; fix AG-F3.1). **Reschedule** (`fix AG-F3.2`): `rescheduleBooking` валидирует новый слот через `resolveAvailability` с composite override `{ durationMin: total_duration_min, bufferBeforeMin, bufferAfterMin }` из строки — grid-валидация контейнера, не primary-позиции.

## 3. `GET /api/approvals` Delta (OPERATOR+)

- Каждый элемент массива получает additive `items: [{ productId, title, durationMin, priceInUSD, addOn }] | null` (null = legacy single-item → клиент-UI рисует из `serviceTitle`).

## 4. Internal Contract: `compositeService.ts` (PURE)

- `deriveComposite(items: string[], products: ProductRow[]): { ok: true, composite } | { ok: false, code }`:
  - `composite = { itemIds, primaryItemId, totalDurationMin, bufferBeforeMin: max, bufferAfterMin: max, paymentMode, totalPriceMinor: toAmountMinor(Σ priceInUSD), chargeableAmountMinor: NONE→0 | DEPOSIT→totalDepositMinor | FULL_PREPAYMENT→totalPriceMinor, totalDepositMinor, items: snapshot[] }` — `chargeableAmountMinor` пишется в `orders.amount` (канон 003/012, fix AG-F2); `totalPriceMinor` — производная для surfaces/ответа;
  - коды отказов: `COMPOSITE_INVALID / ADDON_ONLY_BASKET / COMPOSITE_TOO_LONG / MIXED_PAYMENT_MODES / INVALID_DEPOSIT_AMOUNT / VALIDATION_FAILED`;
  - бесплатные addOn (`addOn && priceInUSD===0 && depositAmount===0`) нейтральны к `paymentMode` — наследуют режим корзины (fix AG-F4.1); zero-гвард: DEPOSIT требует `totalDepositMinor > 0`, FULL_PREPAYMENT — `totalPriceMinor > 0` (fix AG-F4.3).
- Никакого I/O — продукты подаются вызывающим (чистота канона FSM/availability/invariants).

## 5. Booking Pipeline Anchors (что НЕ меняется)

- FSM `transitionBookingFsm` / kernel; GiST EXCLUDE + `pg_advisory_xact_lock`; Stripe webhooks CAS; reminders/CAS; outbox; GDPR purge; 007 OTP/trust-cookie механика; 013 ai-triage claim/status-машина.
