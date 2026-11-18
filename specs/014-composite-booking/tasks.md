# Tasks: 014-composite-booking

**Input**: `spec.md` rev 1.1, `plan.md`, `data-model.md`, `contracts/composite-booking.md`, `research.md`, `requirements-audit.md` PASS
**Organization**: Phase 1 Setup → Phase 2 Schema (Expand) → Phase 3 US1/US2 (Composite Core) → Phase 4 US3 (Money) → Phase 5 US5/US6 (Surfaces & Compat) → Phase 6 Tests, Security, Verification, Docs.

---

## Phase 1: Setup

- [ ] T1401 [SETUP] Define `MAX_ITEMS = 6` and `MAX_COMPOSITE_MIN = 480` constants and composite TypeScript types (`CompositeItem`, `DerivedComposite`) in `src/lib/booking/compositeService.ts` skeleton

## Phase 2: Foundational Schema (Expand-only — Principle X)

- [ ] T1402 [DB] Add `addOn` checkbox (default false, condition bookable) with `durationMin ≥ 0 when addOn` validator to `src/collections/Products/index.ts` — заменить field-config хардкод `min: 5` → `min: 0` на `durationMin` (бизнес-граница `≥5`/`≥0` остаётся в `validate`, иначе Admin UI не даст сохранить `addOn=true, durationMin=0`, fix AG-F1.2); ослабить валидатор `depositAmount`: разрешить `0` при `addOn=true && (priceInUSD ?? 0) === 0` (fix AG-F4.2)
- [ ] T1403 [DB] Add field-locked `itemsJson` (jsonb) to `src/collections/SlotReservations.ts` and raw-SQL-write `itemsJson` to `src/collections/BookingIntents.ts`
- [ ] T1404 [DB] Create idempotent Expand-only migration (`ADD COLUMN IF NOT EXISTS items_json jsonb` ×2, `add_on boolean DEFAULT false` on products **+ twin `"_products_v" ADD COLUMN IF NOT EXISTS "version_add_on" boolean DEFAULT false`** — канон 20261113 `version_deposit_amount`, иначе `42703` на версионной таблице, fix AG-F1.1) with `down()` (дроп всех четырёх) in `src/migrations/20261118_000002_composite_booking.ts` and register in `src/migrations/index.ts`

## Phase 3: US1/US2 — Composite Core (P0, Risk 16)

**Goal**: валидированная корзина `items[]` с composite-гридом на всех путях брони.
**Independent Test**: `items=["A","B"]` на свободном старте → intent/бронь контейнера Σ длительности; все отказы 422 происходят ДО intent.

- [ ] T1410 [BE] [US1] Implement PURE `deriveComposite` (Σ duration/price/deposit, primary-first ordering, max-buffers, uniform paymentMode — **бесплатные addOn-позиции (`addOn && priceInUSD===0 && depositAmount===0`) нейтральны к режиму: наследуют `paymentMode` корзины и не триггерят `MIXED_PAYMENT_MODES`, fix AG-F4.1**; caps, snapshot builder) and validation error codes — включая **`INVALID_DEPOSIT_AMOUNT` (DEPOSIT: `Σ depositAmount > 0`; FULL: `Σ priceInUSD > 0`, иначе Stripe `amountMinor:0` падает 502, fix AG-F4.3)** и `totalPriceMinor = toAmountMinor(Σ priceInUSD)` + `chargeableAmountMinor` (канон 003/012: NONE→0 / DEPOSIT→Σ deposit / FULL→Σ price, fix AG-F2) — in `src/lib/booking/compositeService.ts`
- [ ] T1411 [BE] [US2] Add `composite` override to `ResolveAvailabilityInput` and thread it through `resolveAvailability` → pure `computeSlots` in `src/lib/availability/resolver.ts`; accept repeated `items` query-params in `src/app/api/availability/route.ts` — **включить канонизированный `items` в `cacheKey` (`${service}:${items.join(',')}:${date}:${resourceId}` — иначе 60-мин кэш отравит 90-мин запрос, fix AG-F3.1)** и разрешить вызов с `items[]` без `service` (`effectiveService = service ?? items[0]`, иначе 400 на route.ts:26)`
- [ ] T1412 [BE] [US1] Persist `items_json` (`[{productId}]`) in phase 1 and hydrate from DB with `slotEnd − slotStart === Σ durationMin` drift-check (intent dead) in `src/lib/booking/intentService.ts` — **SELECT дополняется `slot_end, items_json`; при drift — атомарный `UPDATE booking_intents SET status='dead' WHERE id=… AND status='pending'` + `audit_events(intent.dead, reason: COMPOSITE_DRIFT)` ДО выброса `INTENT_DEAD 403`** (иначе pending-интент висит в `LIVE_CAP_PER_EMAIL`, fix AG-F7.1)
- [ ] T1413 [BE] [US1] Parse `items` on phase 1 and trust-cookie paths with mutual-exclusion (`productId`+`items` → 400) and pre-intent 422 fail-closed codes in `src/app/api/booking/route.ts`

## Phase 4: US3 — Money Path (P0, Risk 15)

- [ ] T1420 [BE] [US3] Extend `CreateBookingInput` with `items`, store itemized `items_json` snapshot, set **`orders.amount` = chargeable amount по канону 003/012 (`0` NONE / `Σ depositAmount` DEPOSIT / `Σ priceInUSD` FULL — совместимо с `assertProviderAmountMatch`/`charge.refunded`/тестами `prepaid-booking.int.spec.ts:95` и `deposit-flow.int.spec.ts:121`, fix AG-F2; НЕ `Σ priceInUSD`)**, PaymentIntent = Σ (FULL) / Σ depositAmount (DEPOSIT), server idempotency key `HMAC(email + sorted(itemIds с сохранением дубликатов) + startIso)` + **fallback `booking-idem:${email}:${itemIds}:${startIso}` при прямом вызове без ключа (fix AG-F7.2)**, `item_id = primary productId` in `src/lib/booking/bookingService.ts`; **`findBookingByIdempotencyKey` выбирает `items_json, total_duration_min` и `BookingResult` отдаёт `items` + `totalDurationMin` (идемпотентный повтор не теряет состав, fix AG-F7.2); `rescheduleBooking` (line ~1070) передаёт в `resolveAvailability` composite override `{ durationMin: total_duration_min, bufferBeforeMin, bufferAfterMin }` из строки (иначе 120-мин контейнер валидируется 60-мин сеткой, fix AG-F3.2); `enqueueStaffCard` получает `items` массив**

## Phase 5: US5/US6 — Surfaces & Compat (P1)

- [ ] T1430 [BE] [US5] Render itemized staff card (≤4 lines + `+N ещё`, primary first) in `src/lib/telegram/staffCard.ts` and itemized confirmation email from snapshot (legacy `items_json IS NULL` → single-item fallback via `item_id`) in `src/lib/email/templates.ts` + `src/jobs/bookingEmail.ts` — **исправить тип-небезопасный JOIN в `bookingEmail.ts:43`: `LEFT JOIN products p ON p.id::text = sr.item_id` (products.id = serial, sr.item_id = varchar — латентный баг 003, fix AG-F7.3)**
- [ ] T1431 [BE] [US5] Expose `items` (or null legacy) in `GET /api/approvals` payload in `src/app/api/approvals/route.ts` and on confirmation page `src/app/[locale]/book/confirmation/[id]/page.tsx` — **`<DepositPayment>` получает агрегаты из `items_json` (`Σ depositAmount`, `Σ priceInUSD`, `paymentMode`) с legacy-fallback по `itemId: text` (SlotReservations.ts:64, поле НЕ relationship `item` — fix AG-F6.2), иначе форма оплаты покажет сумму одной услуги**
- [ ] T1432 [FE] [US5] Add «Добавить к визиту» checkbox block with running Σ duration/price total, grid recompute for composite duration, and items[] submit in `src/components/booking/SlotGrid.tsx` + `src/components/booking/types.ts` + `src/i18n/locales/{ru,en}.json` — **server-page `src/app/[locale]/book/[slug]/page.tsx` (MOD): грузит active bookable продукты, фильтрует совместимые по `paymentMode` (или бесплатный addOn) и передаёт `primaryService: CompositeItemDTO` + `availableAddOns: CompositeItemDTO[]` в `<SlotGrid>` (fix AG-F6.1)**
- [ ] T1433 [BE] [US6] Extend `booking.create` audit metadata with `itemsCount` and add 013/GDPR compatibility tests (aiTriage primary product, purge untouched) in `src/lib/booking/bookingService.ts`

## Phase 6: Tests, Security, Verification & Docs

- [ ] T1440 [E2E] Implement composite integration matrix (legacy parity, Σ/primary/addOn/modes/caps BVA, composite grid, 409 race, intent drift, DEPOSIT Σ, refund container by primary cutoff, legacy NULL-snapshot fallback, 013 compat) in `tests/int/composite-booking.int.spec.ts`
- [ ] T1441 [SEC] Verify STRIDE mitigations (phase-2 items spoof blocked, server-side derivation, caps fail-closed, audit `itemsCount`) and record evidence in `specs/014-composite-booking/qa/security-check.md`
- [ ] T1442 [OPS] Run migration up/down on clean DB and full gates (`pnpm generate:types`, `validate`, `lint`, `test:int`, `build`) with 0 errors; extend error-shapes snapshot (`MIXED_PAYMENT_MODES`, `COMPOSITE_TOO_LONG`, `ADDON_ONLY_BASKET`, `COMPOSITE_INVALID`, `INVALID_DEPOSIT_AMOUNT`)
- [ ] T1443 [DOC] Update `specs/main/architecture.md` and `specs/main/requirements.md` as-built for 014 after implementation

---

## Dependency Graph

```text
T1401 → T1410
T1402 → T1404
T1403 → T1404
T1404 → T1412
T1404 → T1420
T1410 → T1411
T1410 → T1412
T1410 → T1413
T1410 → T1420
T1411 → T1413
T1412 → T1413
T1411 + T1413 → T1420
T1404 → T1433
T1420 → T1430
T1420 → T1431
T1420 → T1432
T1420 → T1433
T1430 → T1433
T1410 + T1411 + T1413 + T1420 → T1440
T1430 + T1432 + T1440 → T1441
T1433 + T1440 → T1442
T1442 → T1443
```

### Graph Self-Validation
- [x] All Task IDs exist (`T1401..T1404`, `T1410..T1413`, `T1420`, `T1430..T1433`, `T1440..T1443`).
- [x] No chained arrows on a single line; only `→` and `+` operators used.
- [x] Zero cycles; zero orphans; `[SEC]`/`[E2E]` strictly after implementation tasks.
- [x] Shared files: `bookingService.ts` затрагивают `T1420` → `T1430` (enqueueStaffCard items) → `T1433` (audit itemsCount) — сериализованы ребром `T1430 → T1433` (fix AG-F7.3, конфликт файлов устранён порядком); `staffCard`/`templates` → только T1430.

**Critical Path**: `T1402 → T1404 → T1412 → T1413 → T1420 → T1440 → T1442 → T1443` (8 задач). **Total**: 17 задач.

---

## Parallel Lanes

| Lane | Tasks | Blocked By |
| --- | --- | --- |
| Lane 1 (Schema) | `T1402`, `T1403` → `T1404` | — |
| Lane 2 (Core) | `T1401`, `T1410` → `T1411` → `T1413`; `T1412` | `T1404`, `T1410` |
| Lane 3 (Money) | `T1420` | `T1404`, `T1410`, `T1411`, `T1413` |
| Lane 4 (Surfaces) | `T1430`, `T1431`, `T1432`, `T1433` | `T1420` |
| Lane 5 (Verify & Docs) | `T1440` → `T1441` → `T1442` → `T1443` | `T1420`, `T1430`, `T1432` |

---

## Agent Summary

| Agent | Task Count | Task IDs | Start Condition |
| --- | :---: | --- | --- |
| `[SETUP]` | 1 | `T1401` | Immediate |
| `[DB]` | 3 | `T1402`, `T1403`, `T1404` | Immediate |
| `[BE]` | 9 | `T1410`, `T1411`, `T1412`, `T1413`, `T1420`, `T1430`, `T1431`, `T1433`, `T1442` (gates) | After schema/core deps |
| `[FE]` | 1 | `T1432` | After `T1420` |
| `[E2E]` | 1 | `T1440` | After `T1420` |
| `[SEC]` | 1 | `T1441` | After `T1440` |
| `[OPS]` | 1 | `T1442` | After `T1440`, `T1441` |
| `[DOC]` | 1 | `T1443` | After `T1442` |

---

## Agent Dispatch Plan

| Agent | Subagent / Role | Context Sections | Task IDs | Target Files |
| --- | --- | --- | --- | --- |
| `[DB]` | `database-architect` | `data-model.md` | `T1402..T1404` | `Products/index.ts`, `SlotReservations.ts`, `BookingIntents.ts`, `src/migrations/` |
| `[BE]` | `backend-specialist` | `spec.md` US1–US4, `contracts/composite-booking.md` | `T1410..T1413`, `T1420`, `T1430`, `T1431`, `T1433` | `src/lib/booking/*`, `src/lib/availability/*`, `src/app/api/*`, `src/lib/telegram/staffCard.ts`, `src/lib/email/*`, `src/jobs/bookingEmail.ts` |
| `[FE]` | `frontend-specialist` | `spec.md` US5, `contracts/composite-booking.md` §1 | `T1432` | `SlotGrid.tsx`, `types.ts`, `locales/{ru,en}.json` |
| `[E2E]` | `test-engineer` | `qa/test-cases.md`, `qa/rtm-matrix.md` | `T1440` | `tests/int/composite-booking.int.spec.ts` |
| `[SEC]` | `security-auditor` | `plan.md` §STRIDE | `T1441` | `qa/security-check.md` |
| `[OPS]` | `devops-engineer` | `plan.md` §ORR, `quickstart.md` | `T1442` | gates + migration rollback |
| `[DOC]` | `documentation-writer` | `specs/main/*` | `T1443` | `specs/main/{architecture,requirements}.md` |

---

## Suggested MVP Scope

- **MVP**: `T1401..T1420` + `T1440` + `T1442` — корзина работает end-to-end (API + грид + деньги).
- **Full Feature**: + `T1430..T1433` (itemized surfaces, UI-блок, 013-audit) + `T1441`, `T1443`.
