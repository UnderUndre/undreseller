# Implementation Plan: 014 (composite-booking)

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom

**Branch**: `main` (single-branch lineage — IX-девиация, как 001–013) | **Date**: 2026-11-18 | **Spec**: rev 1.1 (clarified; `requirements-audit.md` PASS run #1)
**Input**: `spec.md` rev 1.1 + `requirements-audit.md` PASS + `research.md` (YClients/Fresha/Setmore BP-1..BP-5 + легаси-002 L1) + `data-model.md` + `contracts/composite-booking.md`

---

## Summary

Комплексная бронь-контейнер (Option 0): `items[]` (1..6 позиций) с суммарной длительностью в ОДНОЙ `SlotReservation` + одном `Order`:
1. **Схема (Expand-only):** `SlotReservations.itemsJson` (snapshot позиций), `BookingIntents.itemsJson` (состав для 007-гидратации), `Product.addOn` (durationMin ≥ 0 при addOn); миграция + `down()`.
2. **Composite intake (US1):** `compositeService.ts` (PURE) — деривация корзины (Σ duration/price/deposit, primary, caps, однородный режим) + валидатор; intake на 3 путях брони; intent drift-check (`slotEnd − slotStart ≠ Σ` → intent dead).
3. **Composite availability (US2):** resolver override `composite` → pure `computeSlots` (ядро не меняется); max-buffers; grid = слоты контейнерной длительности; 409 гонка как сегодня.
4. **Money path (US3):** `orders.amount` = канон 003/012 списываемой суммы (`0` NONE / `Σ depositAmount` DEPOSIT / `Σ priceInUSD` FULL — совместимо с `assertProviderAmountMatch`/`charge.refunded`/тестами 003/012, fix AG-F2); `totalPriceMinor` — производная в `items_json`/ответе; PaymentIntent = Σ (FULL) или Σ depositAmount (DEPOSIT); idempotency `HMAC(email + sorted(itemIds с дубликатами) + start)` + fallback для прямых вызовов (fix AG-F7.2); cancel/refund контейнера целиком по primary cutoff (`item_id = primary productId` — существующие lookup'ы 003 работают без изменений).
5. **Surfaces (US5):** itemized staff-карточка / confirmation email / approvals / confirmation-страница; `/book/[slug]` multi-select чекбоксы с бегущим итогом (грид пересчитывается под Σ); legacy-строки с `items_json IS NULL` читаются как single-item по `item_id`.
6. **013/GDPR (US6):** aiTriage `item_id = primary`, промпт = primary title; `gdprPurge` без изменений; верификационные тесты.

---

## Technical Context

- **Language/Version**: TypeScript 5.7.2 / Next.js 16.4.1 / Payload 3.93.0 / PostgreSQL 16 (unchanged)
- **New Dependencies**: **0**
- **Testing**: Vitest int (`tests/int/composite-booking.int.spec.ts`) + существующие 212 как регрессионный baseline

## Architectural Topology (Conway / Modular Monolith)

- Без изменений: монолит, 0 новых сервисов/контейнеров; composite = надстройка над существующим booking-контуром (`items[]` → тот же INSERT, тот же FSM-трек, тот же GiST/advisory).

## Constitution Check

| Принцип | Статус | Примечание |
| --- | --- | --- |
| I–V | PASS | 0 deps, токенно-экономно, без дублей конфигов |
| VI | ON TRACK | analyze + ≥ 2 external до implement |
| VII | PASS | Артефакты в `specs/014-composite-booking/` |
| VII-B | PASS | **BP unchanged**: §2.2 канон («мульти-сервисная корзина») реализуется, дельты нет |
| VIII | PASS | `specs/main/architecture.md` обновлён |
| IX | DEVIATION (lineage) | как 001–013 |
| X | **PASS** | Expand-only: `ADD COLUMN IF NOT EXISTS items_json jsonb` ×2 + `products.add_on` + twin `_products_v.version_add_on` (fix AG-F1); enum'ов новых нет (PG-квирк 008 F7 не задевается); `down()` дропает только новое |
| XI | PASS | Spike = 0 (research.md §4) |
| XII | **PASS** | requirements-audit PASS + preliminary-rtm + qa/ (29119) |
| XIII | PASS | WIP ≤ 2; реализует платформенную канон-фичу, не кастом клиента |

## STRIDE Threat Model (NIST SP 800-218 PW.1)

| Threat | Vector | Mitigation |
| --- | --- | --- |
| **Spoofing** | Подмена `items[]` в теле фазы 2 | Гидратация состава из `booking_intents.items_json` (007 F5); тело фазы 2 игнорируется |
| **Tampering** | Клиент шлёт произвольные цены/длительности | Цены/длительности читаются сервером из продуктов; клиент передаёт только ids; caps 6/480 fail-closed |
| **Repudiation** | «Я бронировал другой состав» | `items_json` snapshot на брони (title/duration/price) — itemized evidence в card/email/approvals |
| **Information Disclosure** | PII в snapshot | `items_json` = только данные магазина; confirmation по `accessToken` (существующий гейт); approvals OPERATOR+ |
| **Denial of Service** | Гигантские корзины / абьюз грида | Кэпы `MAX_ITEMS=6`, `MAX_COMPOSITE_MIN=480` ДО intent; rate limit 10/60s без изменений; 0 новых SQL на availability |
| **Elevation of Privilege** | addOn-инъекция / обход approvals | `addOn` валидируется сервером; OUT_CALL контейнера → `PENDING_APPROVAL`; mixed modes → 422 |

## Database Migration Strategy (Principle X)

- Детали: [`data-model.md`](./data-model.md). Одна Expand-only миграция: `ADD COLUMN IF NOT EXISTS items_json jsonb` на `slot_reservations` + `booking_intents`; `products.add_on boolean DEFAULT false` **+ twin-column `_products_v.version_add_on`** (канон 20261113 — без неё версионная таблица падает `42703`, fix AG-F1); `down()` дропает только новое. Legacy-строки `items_json IS NULL` читаются как single-item по `item_id` (compat-правило FR-1405/US5).

## Observability & ORR

- **Logging**: структурный `payload.logger` без PII (канон); валидационные отказы корзины логируются кодом (`MIXED_PAYMENT_MODES` и др.) без составов.
- **Telemetry**: `booking.create` audit уже пишет `fulfillment/resourceId`; расширяется `itemsCount` (число позиций) — без составов.
- **SLO/Failover**: booking p95 без деградации (валидация pure); при drift intent → честный `INTENT_DEAD` (клиент повторяет); rollback: `down()` миграции + git revert, legacy-чтение совместимо.

## Risks

| Риск | Вероятность | Митигация |
| --- | --- | --- |
| Composite-грид расходится с grid-валидацией брони (два источника истины) | Средняя | Один и тот же `resolveAvailability(composite)` на phase 1 / trust-cookie / verify — единый канон |
| Drift продуктов между фазами | Низкая | Integrity-check `slotEnd − slotStart === Σ durationMin` → intent dead |
| Per-item refund зоопарк | Снят | Via Negativa: только контейнер целиком |
| Legacy строки без snapshot | Средняя | Compat-правило: `items_json IS NULL` → single-item из `item_id` (тест) |

## Next

`/speckit.tasks` → tasks.md (dependency graph, lanes, dispatch).

> **Drift note (2026-11-19, analyze L1 carried → resolved):** финальные суммы корзины показываются клиенту на OTP-шаге из ответа фазы 1 / `expiresAt`-карточки (реализация в T1413/T1432); re-derive на фазе 2 может изменить сумму — UI обязан показать её на шаге подтверждения до списания.
