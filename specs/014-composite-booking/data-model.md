# Data Model & Schema Evolution: 014-composite-booking

**Date**: 2026-11-18 · **Strategy**: Expand-only (Constitution Principle X)

---

## 1. Entities & Field Changes

### 1.1. `SlotReservations` (`slot_reservations`) — MOD

| Field (TS) | Column (SQL) | Type | Nullable | Classification | Access / Write Guard |
| --- | --- | --- | --- | --- | --- |
| `itemsJson` | `items_json` | `jsonb` | `NULL` (legacy single-item rows) | Internal (данные магазина, 0 PII клиента) | Field-level `create/update: () => false`; пишет только `bookingService` |

Snapshot-контракт (fixируется на момент брони):
```json
[
  { "productId": "12", "title": "Замена смесителя", "durationMin": 60,
    "priceInUSD": 100, "depositAmount": 0, "addOn": false },
  { "productId": "15", "title": "Установка фильтра", "durationMin": 0,
    "priceInUSD": 0, "depositAmount": 0, "addOn": true }
]
```
- Порядок: primary первым, далее в порядке `items[]` (Clarifications).
- **Деньги (fix AG-F2):** `orders.amount` = канон 003/012 **списываемая** сумма (`0` NONE / `Σ depositAmount` DEPOSIT / `Σ priceInUSD` FULL_PREPAYMENT); полная стоимость корзины `totalPriceMinor` — производная от snapshot (Σ `priceInUSD` по позициям), отдаётся в ответе/surfaces, НЕ пишется в `orders.amount` — иначе `assertProviderAmountMatch` роняет DEPOSIT-вебхук (`AMOUNT_MISMATCH`) и `charge.refunded` ложно считает полный возврат частичным.
- `item_id` (существующее поле) = **primary productId** — существующие lookup'ы cutoff/refund/email по `item_id` работают без изменений.
- **Compat-правило чтения:** `items_json IS NULL` → single-item позиция из `item_id` (JOIN products) — все surfaces обязаны обрабатывать обе формы.

### 1.2. `BookingIntents` (`booking_intents`) — MOD

| Field (TS) | Column (SQL) | Type | Nullable | Write Guard |
| --- | --- | --- | --- | --- |
| `itemsJson` | `items_json` | `jsonb` | `NULL` | Только `intentService` (raw-SQL канон 007); create/update коллекции закрыты |

Содержимое: `[{ "productId": "12" }, { "productId": "15" }]` — ТОЛЬКО ids (без snapshot цен: фаза 2 re-derives из живых продуктов, Clarifications Q1). Фаза 1 валидирует состав сервером; фаза 2 гидратирует ids из БД + integrity-check `slotEnd − slotStart === Σ durationMin`, иначе intent → dead.

### 1.3. `Products` — MOD (без SQL-миграции, Payload-коллекция)

| Field (TS) | Type | Default | Валидатор |
| --- | --- | --- | --- |
| `addOn` | checkbox | `false` | admin condition `bookable === true`; при `addOn=true` `durationMin ≥ 0`, иначе канон `≥ 5` |

> Поле живёт в шаблонной таблице `products` — `payload migrate` push/диф генерирует колонку `add_on boolean`; миграция 014 включит её в Expand-only `up()` (идемпотентно) для prod-пути `payload migrate`. **Twin-column (fix AG-F1):** по канону миграции `20261113` (`version_deposit_amount`) колонка добавляется парами — `products.add_on` **и** `_products_v.version_add_on boolean DEFAULT false`; без twin-колонки версионная таблица падает PostgreSQL `42703` при любом create/update продукта в админке.

---

## 2. State Transitions — БЕЗ ИЗМЕНЕНИЙ

`bookingFsm.ts` не трогается: контейнер = одна бронь, один FSM-трек (`FREE` или однородный `PREPAID`), один `Order`, одна `SlotReservation`. `ai_triage_status` контура 013 не меняется. Единственный status-writer остаётся `bookingService`.

---

## 3. 4-Phase Expand/Contract Migration Strategy (Principle X)

1. **Phase 1 (Expand — реализуется в 014):**
   - `ALTER TABLE slot_reservations ADD COLUMN IF NOT EXISTS items_json jsonb;`
   - `ALTER TABLE booking_intents ADD COLUMN IF NOT EXISTS items_json jsonb;`
   - `ALTER TABLE products ADD COLUMN IF NOT EXISTS add_on boolean DEFAULT false;`
   - `ALTER TABLE "_products_v" ADD COLUMN IF NOT EXISTS "version_add_on" boolean DEFAULT false;` (twin-column канон 20261113, fix AG-F1)
   - Идемпотентно; ни одного enum/drop/rename (PG-квирк 008 F7 не задевается).
2. **Phase 2 (Dual-Write):** не требуется — новых значений у старых строк нет; чтение dual-совместимо (`items_json IS NULL` → single-item fallback).
3. **Phase 3 (Backfill):** не требуется (исторические брони остаются NULL = legacy single-item).
4. **Phase 4 (Contract):** не применимо (ничего не удаляется).
5. **Rollback (`down()`):** `ALTER TABLE ... DROP COLUMN IF EXISTS items_json` ×2 + `DROP COLUMN IF EXISTS add_on` + `ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_add_on";` — строго новое.
