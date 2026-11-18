# Security Check — 014-composite-booking (T1441, NIST SP 800-218 PW.1)

**Date**: 2026-11-19 · **Reviewer**: security pass per plan.md §STRIDE · **Commit**: implementation tree on `main`

## STRIDE evidence matrix

| Threat | Vector | Mitigation (implemented) | Evidence |
| --- | --- | --- | --- |
| **Spoofing** | Подмена `items[]` в теле фазы 2 | `verifyIntentBooking` гидратирует состав СТРОГО из `booking_intents.items_json` (007 F5); тело фазы 2 структурно игнорируется | `intentService.ts` verifyIntentBooking — `intentItems` из строки БД; `booking/route.ts` phase-2 comment; `composite-booking.int.spec.ts` (drift + spoof игнор через hydration) |
| **Tampering** | Клиент шлёт произвольные цены/длительности/`addOn` | Клиент передаёт ТОЛЬКО ids; длительности/цены/режимы читаются сервером из продуктов (`deriveBasket`/`createBooking` fetch-by-ids); caps 6/480 fail-closed ДО intent | `compositeService.deriveComposite` (PURE); `bookingService.createBooking` composite fetch; int-тесты caps + invalid positions |
| **Repudiation** | «Я бронировал другой состав» | `items_json` snapshot на брони (title/duration/price per позиция) — itemized evidence в card/email/approvals/confirmation | `bookingService` INSERT `items_json`; `bookingEmail.ts` letter from snapshot; `approvals/route.ts` items payload; int-тест `audit carries itemsCount` |
| **Information Disclosure** | PII в snapshot / чужая бронь по ключу | `items_json` = только данные магазина (0 PII); idempotency-key owner-match (008 F-BE-02) сохранён; GDPR purge не расширялся | `compositeService` snapshot builder (нет customer-полей); `findBookingByIdempotencyKey` owner match; TC-014-024 канон (purge не задевает items_json) |
| **Denial of Service** | Гигантские корзины / абьюз грида | `MAX_ITEMS=6` / `MAX_COMPOSITE_MIN=480` fail-closed до intent (route + service + derive); RL 10/60s availability + booking без изменений; availability cacheKey канонизирован (без poisoning — AG-F3.1) | `compositeService` caps; `booking/route.ts` items validation 400/422; `availability/route.ts` cacheKey |
| **Elevation of Privilege** | addOn-инъекция / обход approvals / money-bypass | `addOn`/`paymentMode`/`depositAmount` читаются сервером (products, не тело); mixed modes → 422; `INVALID_DEPOSIT_AMOUNT` zero-гвард (Stripe amountMinor:0 не создаётся); OUT_CALL контейнера → PENDING_APPROVAL; **`orders.amount` = chargeable канон 003/012 — вебхук fail-closed `assertProviderAmountMatch` не подрывается** | `deriveComposite` uniform-mode + zero-guard; int-тесты `DEPOSIT basket`, `free addOn neutrality`, `race 201+409` |

## Money-path invariants re-verified (fix AG-F2)

- `orders.amount` = **chargeable** сумма (0 / Σ deposit / Σ price по режиму) — совместимо с `assertProviderAmountMatch` и `charge.refunded` (webhooks fail-closed).
- `totalPriceMinor` — производная; НЕ пишется в `orders.amount`; отдаётся в ответе/письме/confirmation.
- Int-тесты: `orders.amount = 0` (NONE composite), `= 3500` (DEPOSIT Σ), PaymentIntent amountMinor = Σ депозитов.

## Residual risks (accepted)

- Composite race на один старт → честный 409 (GiST + advisory), покрыто int-тестом.
- Drift между фазами → intent dead + audit (COMPOSITE_DRIFT); клиент повторяет бронь.
- bookingEmail JOIN приведён к `p.id::text = sr.item_id` (латентный int=varchar баг 003 закрыт в 014, AG-F7.3).
