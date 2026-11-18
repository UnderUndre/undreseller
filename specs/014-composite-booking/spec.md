# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `014-composite-booking`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001–010 + 012–013 (`specs/main/architecture.md` v3.1.0)
**Статус:** **REVIEWED — v1.2 (2026-11-19; внешнее ревью antigravity AG-F1..F8 исправлено; v1.1 clarify 2026-11-18; ready for re-analyze → implement)**
**Триггер / Signal (L1):** запрос от реального клиента: комплексный выбор услуг как корзина, часть услуг в одном таймслоте («замена смесителя + установка фильтра = 1 час»), часть отдельным слотом («замена/починка туалета»), выбор длительности (30 мин / час) и автоматический расчёт цены.
**Source of truth по бизнесу:** `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.7.2 — **§2.2 канонический сквозной процесс уже включает «мульти-сервисную корзину с шагом 30 минут»**; фича реализует канон, коммерческая дельта = 0 (ICP / цены / рельсы / Scope Knife не меняются). **Business plan: unchanged.**
**Design references:**
* **L1:** `undreseller-legacy/specs/002-service-cart-and-staff-bot/spec.md` — легаси уже проектировало мульти-сервисную корзину (непрерывный интервал суммарной длительности + сетка 30 мин + GiST на resourceId); портируется дизайн-контур, код не портируется (Prisma/Next 15 dead weight).
* **Vendor best practices:** [research.md](./research.md) — YClients (сумма длительностей, один блок в журнале), Fresha/Setmore (позиционирование, extra time), Setmore booking sequence (Option 1, вне скоупа).

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

`POST /api/booking` принимает ровно один `productId` ([bookingService.ts](../../../src/lib/booking/bookingService.ts) `CreateBookingInput`): клиент не может записаться на «комплекс» (несколько работ в одном визите с суммарной длительностью и суммарной ценой). Реальный клиент формулирует потребность как корзину: базовая работа задаёт слот, доп-работы «включены в час» (не добавляют времени), необязательные расширения идут отдельным слотом. Легаси-002 это проектировало (L1), но в ребейз на Payload контур корзины не переносился.

Ограничения, которые нельзя ломать: FSM `bookingFsm.ts` (pure, two-track), GiST EXCLUDE `(resource_id, tstzrange) WHERE active` + advisory lock, 007 trust gate (фаза 2 гидратирует всё из БД), канон «один режим оплаты на PaymentIntent».

### 1.2. Решение (Option 0 — Composite Booking, один слот-контейнер)

1. **Вход `items[]`:** `POST /api/booking` принимает опциональный `items: string[]` (1..6 productIds). Один `productId` (текущий контракт) интерпретируется как `items=[productId]` — побитовая обратная совместимость. Порядок в `items[]` = порядок позиций; дубликат id = +1 количество.
2. **Слот-контейнер:** одна `SlotReservation` на суммарный интервал `Σ durationMin`; «включённые в час» доп-услуги — новый флаг `Product.addOn` (durationMin может быть 0, не двигает span, добавляет свою цену); buffers контейнера = max по позициям. Availability считается pure `computeSlots` с composite-параметрами (функция уже параметризована, правок ядро не требует).
3. **Цены и режим оплаты:** `orders.amount` сохраняет канон 003/012 — **списываемая** сумма в minor units (`0` при NONE, `Σ depositAmount` при DEPOSIT, `Σ priceInUSD` при FULL_PREPAYMENT), совместимо с `assertProviderAmountMatch`, `charge.refunded` и int-тестами 003/012 (fix AG-F2); полная стоимость `totalPriceMinor = toAmountMinor(Σ priceInUSD)` деривится в `deriveComposite`, хранится per-позиционно в `items_json` и отдаётся в ответе. Режим корзины строго однородный (`NONE | FULL_PREPAYMENT | DEPOSIT`); смешение → `422 MIXED_PAYMENT_MODES` без создания интента.
4. **Второй слот:** в Option 0 отдельные работы = отдельные брони (клиент делает вторую запись). Связанность двух броней — опциональное поле `linkedReservationId` (nullable, информационное) — НЕ входит в этот скоуп (см. §7 Open Questions).
5. **Surfaces:** staff-карточка и confirmation-email показывают itemized список позиций с итогом; `/book/[slug]` получает чекбоксы «Добавить к визиту» с бегущим итогом времени/цены.
6. **AI triage (013) и GDPR:** не меняются (item_id = primary productId; `items_json` не содержит PII клиента).

### 1.3. Via Negativa (Strict Taboos)

* ❌ **NO FSM CHANGES:** одна бронь = один FSM-трек; никаких статусов «частично отменена»; kernel `bookingFsm.ts` не трогается.
* ❌ **NO MULTI-ORDER:** одна бронь = один `Order` + одна `SlotReservation`. N броней под одним Order / booking sequence (Setmore-паттерн) — Option 1, отдельная спека по L1-сигналу.
* ❌ **NO GOODS IN BOOKING CONTAINER:** товары магазина (`/shop`, carts, Stripe Elements) остаются отдельным контуром; в слот-контейнер попадают только `bookable` услуги.
* ❌ **NO MIXED PAYMENT MODES:** одна корзина = один `paymentMode` (весь NONE / весь FULL_PREPAYMENT / весь DEPOSIT); split-платежи per item запрещены.
* ❌ **NO NEW DEPENDENCIES:** 0 новых npm-пакетов; только Expand-only миграция (Constitution X).
* ❌ **NO BREAKING CONTRACT:** существующий контракт `productId` работает побитово идентично; все `212` int-тестов остаются зелёными; error-shapes расширяются только добавлением кодов (`MIXED_PAYMENT_MODES`, `COMPOSITE_TOO_LONG`, `COMPOSITE_INVALID`, `ADDON_ONLY_BASKET`, `INVALID_DEPOSIT_AMOUNT`).
* ❌ **NO TG-BOT CATALOG CRUD:** управление каталогом остаётся в Payload `/admin`; TG-бот каталог не редактирует (решение brainstorm 2026-11-18).

---

## 2. User Stories (Prioritized)

### US1 — Composite intake и валидация корзины (P0)

`POST /api/booking` (все три пути: фаза 1 OTP, trust-cookie fast path, фаза 2 verify) принимает опциональный `items: string[]`:
* валидация: `1 ≤ items.length ≤ 6` (кап `MAX_ITEMS`), каждый id — существующий, активный, `bookable=true`, не `deletedAt`; не-string элемент → `400 VALIDATION_FAILED`;
* если передан и `productId`, и `items` — приоритет у `items` (или 400; зафиксировать: **400 VALIDATION_FAILED при одновременной передаче**, однозначность контракта);
* `ADDON_ONLY_BASKET` (`422`) = в корзине **нет ни одной не-addOn позиции** ИЛИ `Σ durationMin < 5` (позиционный порядок не важен — `[addOnId, primaryId]` легален и нормализуется primary-first; fix AG-F5);
* `Σ durationMin ≤ 480` (кап `MAX_COMPOSITE_MIN`) → иначе `422 COMPOSITE_TOO_LONG`;
* однородный `paymentMode` → иначе `422 MIXED_PAYMENT_MODES`;
* phase 1 (OTP): `items` (productIds) сохраняются в `BookingIntents.items_json`, `slotEnd = start + Σ durationMin`; фаза 2 гидратирует состав строго из БД (канон 007 F5 — `items` в теле фазы 2 игнорируются), re-fetch продуктов, повторная деривация; integrity-check: `slotEnd − slotStart === Σ durationMin` иначе intent → **атомарный `UPDATE … SET status='dead'` + `audit_events(intent.dead, reason: COMPOSITE_DRIFT)` ДО выброса `INTENT_DEAD 403`** (иначе pending-интент висит в лимите `LIVE_CAP_PER_EMAIL`, fix AG-F7.1);
* composite grid-валидация тем же каноном (`resolveAvailability` + `computeSlots` с composite-параметрами) на обоих путях.

**Acceptance:**
* `items=["A"]` даёт побитово идентичный результат текущей брони по `productId="A"` (статусы, суммы, FSM, письма).
* `items=["A","B"]` при `A=60min/$100`, `B=15min/$20` (обе NONE) → одна бронь `75 min`, `orders.amount=0` / `totalPriceInUSD=120` (канон списываемой суммы, fix AG-F2), одна staff-карточка.
* Смешение `paymentMode` (`A=DEPOSIT`, `B=NONE`) → `422 MIXED_PAYMENT_MODES`, 0 строк в БД.

### US2 — Composite availability (P0)

`resolveAvailability` получает опциональный `composite?: { durationMin, bufferBeforeMin, bufferAfterMin }`:
* при заданном `composite` pure `computeSlots` вызывается с этими параметрами вместо `product.durationMin/buffers` (ядру правка не нужна — оно уже параметризовано);
* `bufferBeforeMin/AfterMin` контейнера = max по позициям; busy-интервалы чужих броней учитываются как сегодня (расширенные их буферами);
* старт корзины валидируется как слот контейнерной длительности (`grid.slots.find(start)`), GiST/advisory отгоняют гонку как сегодня (`409 SLOT_TAKEN` на весь контейнер).

**Acceptance:**
* День 9:00–18:00, quantum 30, позиции 60+15 → слоты на 75 мин по сетке 30; смежная бронь с bufferAfter=10 отодвигает контейнер на 10 мин.
* Гонка двух вкладок на один composite-старт → ровно один 201, второй `409 SLOT_TAKEN`.

### US3 — Цены, депозиты и money path (P0)

* `orders.amount` = канон 003/012 списываемой суммы в minor units (`0` при NONE, `Σ depositAmount` при DEPOSIT, `Σ priceInUSD` при FULL_PREPAYMENT — совместимо с `assertProviderAmountMatch`/`charge.refunded` и int-тестами 003/012, fix AG-F2); `totalPriceMinor = toAmountMinor(Σ priceInUSD)` деривится в `deriveComposite` и отдаётся на surfaces;
* `FULL_PREPAYMENT`: PaymentIntent на `Σ priceInUSD`; `DEPOSIT`: PaymentIntent на `Σ depositAmount` (каждая позиция с `depositAmount>0` вносит свою часть; валидация `Σ deposit ≤ Σ price`); `NONE`: без PaymentIntent; **бесплатные addOn-позиции** (`addOn=true`, `priceInUSD=0`, `depositAmount=0`) нейтральны к `paymentMode` — наследуют режим корзины и не триггерят `MIXED_PAYMENT_MODES` (fix AG-F4); zero-гвард: DEPOSIT-корзина требует `Σ depositAmount > 0` (иначе `422 INVALID_DEPOSIT_AMOUNT`), FULL_PREPAYMENT — `Σ priceInUSD > 0`;
* серверный `idempotencyKey = HMAC(email + sorted(itemIds) + startIso)` — повтор той же корзины на тот же слот идемпотентен, другой состав = другая бронь;
* отмена/возврат контейнера целиком по канону 003: `cancellationCutoffHours` берётся у **primary** позиции (первая не-addOn в `items[]`); refund = вся уплаченная сумма, per-item refunds запрещены (Via Negativa);
* `EMAIL_REQUIRED` при prepaid/deposit корзине — как сегодня.

**Acceptance:**
* DEPOSIT-корзина `A( dep $25) + B( dep $10 )` → PaymentIntent `3500` minor; `orders.amount=3500` (канон списываемой суммы, fix AG-F2); вебхук → CONFIRMED контейнера.
* Повтор `createBooking` с тем же email+составом+стартом возвращает существующую бронь без второй записи.

### US4 — Product.addOn и админка (P0)

* `Product.addOn` (checkbox, default `false`, admin condition `bookable === true`): при `addOn=true` валидатор разрешает `durationMin ≥ 0` (иначе канон `≥ 5`);
* addOn не может быть primary: primary = первая не-addOn позиция, snapshot нормализуется primary-first (передача `[addOnId, primaryId]` легальна); `ADDON_ONLY_BASKET` — предикат состава (нет не-addOn позиции или `Σ < 5`), НЕ позиционный (fix AG-F5); бесплатный addOn (`priceInUSD=0`, `depositAmount=0`) нейтрален к `paymentMode` (наследует режим корзины, fix AG-F4);
* Payload `/admin` — единственный интерфейс управления каталогом (услуги и addOn создаются там же); TG-бот каталог не трогает.

**Acceptance:** «Установка фильтра» с `addOn=true, durationMin=0, priceInUSD=0` добавляется к брони «Замена смесителя 60 мин» без изменения span и суммы; выбор «30 мин» vs «час» решается отдельными продуктами («Смеситель 30 мин», «Смеситель + фильтр 60 мин») — ноль новой схемы.

### US5 — Itemized surfaces (P1)

* `staffCard`: itemized карточка — primary строка + до 3 строк addOn/доп-позиций + `+N ещё`, итоговая длительность; состав зашит в текст (outbox-канон не меняется);
* confirmation email: itemized список позиций + итог (позиции из snapshot `items_json`, не из живых продуктов — цены фиксируются на момент брони);
* `GET /api/approvals` и confirmation-страница: показывают `items` (title/duration/price per позиция + итог);
* `/book/[slug]` UI: под гридом блок «Добавить к визиту» — чекбоксы других активных bookable услуг (addOn помечены «включено»), бегущий итог `Σ время / Σ цена`, сабмит отправляет `items[]`; i18n `ru/en`.

**Acceptance:** бронь корзины в Telegram и письме показывает ровно тот состав и суммы, что были на момент подтверждения.

### US6 — Совместимость 013 AI triage и GDPR (P0, верификационная)

* `aiTriage`: `item_id = primary productId`, промпт-сервис = primary title (без «+N доп.» — FR-1406, aiTriage.ts не модифицируется; fix AG-F8); статус-машина триажа, PII-санитайзер, SSRF-guard — без изменений;
* `gdprPurge`: `items_json` не содержит PII клиента (только title/price магазина) — purge-политики не расширяются; интеграционный тест фиксирует, что ночной purge не задевает `items_json`.

**Acceptance:** `pnpm eval:ai` и весь 013-контур ведут себя идентично до/после 014 на тех же кейсах.

---

## 3. Edge Cases

* **Дубликаты в `items[]`:** `["A","A"]` = 2 позиции одной услуги (qty через повтор); кап 6 учитывает дубликаты; idempotency-ключ сортирует состав — повтор в другом порядке тот же ключ.
* **Корзина из одних addOn:** `422 ADDON_ONLY_BASKET`, 0 строк.
* **DEPOSIT-корзина без денег** (все `depositAmount=0`) или FULL_PREPAYMENT с `Σ price=0`: `422 INVALID_DEPOSIT_AMOUNT`, 0 строк — Stripe `amountMinor: 0` не создаётся (fix AG-F4).
* **Σ длительности > 480 мин:** `422 COMPOSITE_TOO_LONG`; Σ не влезает в рабочий день → грид пуст (`noSlotsAvailable`), honest UI.
* **Смена цены/режима продукта между фазой 1 и фазой 2:** фаза 2 re-derives из живых продуктов; если `Σ duration` перестал совпадать с `slotEnd` интента → intent dead (`INTENT_DEAD`), клиент заново; цена может «поехать» осознанно (фиксируется в clarify).
* **Одновременная передача `productId` и `items`:** `400 VALIDATION_FAILED` (однозначность).
* **Гонка composite vs однопозиционная бронь на пересекающийся интервал:** GiST 23P01/23505 → 409 у проигравшего — обе брони честны.
* **Смежные брони с буферами:** контейнер валидируется своим max-буфером; соседние вплотную без буферов пропускаются GiST (стык легален).
* **Trust-cookie + items:** fast path валидирует состав и грид так же, как OTP-путь; подмена `items` в теле фазы 2 игнорируется (гидратация из `booking_intents`).
* **Отмена контейнера с DEPOSIT:** refund всей суммы депозита по cutoff primary позиции; частичный refund запрещён.
* **`items[]` на услуге с `outCallEnabled`:** контейнер = OUT_CALL (`PENDING_APPROVAL`) при хотя бы одной выездной позиции.
* **GDPR:** ночной purge обнуляет customer-поля как сегодня; `items_json` переживает анонимизацию (без PII).

---

## 4. Requirements

### Functional Requirements

* **FR-1401 (Schema — Expand-only):**
  * `SlotReservations.itemsJson` (`json`, nullable, `access.create/update: () => false`, `admin.readOnly`) — snapshot позиций на момент брони: `[{ productId, title, durationMin, priceInUSD, depositAmount, addOn }]` (itemized-канон BP-2);
  * `BookingIntents.itemsJson` (`json`, nullable) — `[{ productId }]`, write только через `intentService` (raw-SQL канон 007);
  * `Product.addOn` (checkbox, default `false`, condition `bookable`); валидатор `durationMin`: `≥ 0` при `addOn=true`, `≥ 5` иначе;
  * миграция Expand-only (`ADD COLUMN IF NOT EXISTS items_json jsonb` × 2 таблицы, `products.add_on boolean DEFAULT false` **+ twin-column `_products_v.version_add_on boolean DEFAULT false`** — канон миграции 20261113 `version_deposit_amount`: без неё версионная таблица падает `42703` при любом create/update продукта, fix AG-F1) + `down()` (дроп только нового); PG enums не трогаются.

* **FR-1402 (Composite intake & validation):** `items?: string[]`, кап `MAX_ITEMS = 6`, `MAX_COMPOSITE_MIN = 480`; валидация существования/active/bookable; одновременный `productId+items` → 400; однородный `paymentMode` → иначе `422 MIXED_PAYMENT_MODES` (бесплатные addOn нейтральны, AG-F4); `ADDON_ONLY_BASKET` = нет не-addOn позиции или `Σ < 5`; `COMPOSITE_TOO_LONG`; zero-гвард `INVALID_DEPOSIT_AMOUNT` (AG-F4); серверная деривация `Σ duration / Σ price / Σ deposit / primary`; legacy parity (fix AG-F5.2): одиночный вход (`productId` или `items.length === 1`) сохраняет `404 SERVICE_NOT_FOUND` / `422 SERVICE_NOT_BOOKABLE`, `422 COMPOSITE_INVALID` — невалидные позиции мульти-корзины (≥2).

* **FR-1403 (Composite availability):** `resolveAvailability(..., composite?)` — подмена `service{durationMin,buffers}` в pure `computeSlots` (ядро не меняется); composite grid-валидация на OTP-фазе 1, trust-cookie fast path и при verify; slotEnd интента = `start + Σ duration`; availability-cache: `cacheKey` включает канонизированный `items` (`${service}:${items.join(',')}:${date}:${resourceId}` — иначе 60-мин кэш отравит 90-мин запрос и наоборот, fix AG-F3.1); `items[]` без `service` легален (`effectiveService = service ?? items[0]`); `rescheduleBooking` валидирует новый слот composite-override из строки (`total_duration_min`/buffers) — иначе 120-мин контейнер пролезает в 60-мин окно перед закрытием смены (fix AG-F3.2).

* **FR-1404 (Money path):** `orders.amount` = канон 003/012 списываемой суммы (`0` NONE / `Σ depositAmount` DEPOSIT / `Σ priceInUSD` FULL_PREPAYMENT — fix AG-F2, совместимо с `assertProviderAmountMatch`, `charge.refunded` и int-тестами 003/012); `totalPriceMinor = toAmountMinor(Σ priceInUSD)` — производная в `items_json`/ответе; PaymentIntent на Σ (FULL_PREPAYMENT) или Σ depositAmount (DEPOSIT); серверный idempotencyKey `HMAC(email + sorted(itemIds с сохранением дубликатов) + startIso)` (fallback `booking-idem:${email}:${itemIds}:${startIso}` при прямом вызове без ключа — fix AG-F7.2); FSM-трек по однородному режиму; cancel/refund контейнера целиком, cutoff primary позиции; deterministic refund idempotencyKey канона 003 не меняется.

* **FR-1405 (Surfaces):** itemized staff-карточка (≤4 строки + «+N ещё»), itemized confirmation email из snapshot, items в `/api/approvals` и на confirmation-странице, `/book/[slug]` multi-select UI с бегущим итогом + i18n ru/en; server-page `/book/[slug]` грузит active bookable продукты и фильтрует чекбоксы по совместимому режиму (тот же `paymentMode` или бесплатный addOn — заведомо невалидные чекбоксы не рендерятся, fix AG-F6.1); confirmation-страница передаёт в `<DepositPayment>` агрегаты из `items_json` (`Σ depositAmount`, `Σ priceInUSD`, `paymentMode`) с legacy-fallback по `item_id` (fix AG-F6.2).

* **FR-1406 (013 compatibility):** aiTriage `item_id` = primary, промпт = primary title; `gdprPurge` без расширений на `items_json`; все 013 int-тесты зелёные без правок.

### Non-Functional Requirements

* **NFR-1401 (Zero Regression):** `pnpm validate/lint/build` = 0; `pnpm test:int` ≥ 212 существующих зелёных + новые composite-тесты.
* **NFR-1402 (Zero New Dependencies):** 0 новых пакетов в `package.json#dependencies`.
* **NFR-1403 (Availability Perf):** composite-availability не добавляет SQL-запросов (та же выборка busy + pure compute); `GET /api/availability p95 < 50 ms` сохраняется.
* **NFR-1404 (Expand-only):** миграция идемпотентна, `down()` дропает только новое; PG enum-квирк (008 F7) не задевается (enum'ов новых нет).
* **NFR-1405 (Fail-closed):** все валидационные отказы корзины (`MIXED_PAYMENT_MODES`, `COMPOSITE_TOO_LONG`, `ADDON_ONLY_BASKET`, `COMPOSITE_INVALID`, `INVALID_DEPOSIT_AMOUNT`) происходят ДО создания intent/строк БД; error-shapes снапшот расширяется до мерджа.
* **NFR-1406 (Backward Compat):** однопозиционный путь побитово идентичен текущему (контракт, письма, карточки, FSM); коды `404 SERVICE_NOT_FOUND` / `422 SERVICE_NOT_BOOKABLE` одиночного входа сохраняются (fix AG-F5.2); error-shapes не переименовываются.

---

## 5. Success Criteria

* **SC-001:** бронь `items=["смеситель-60","фильтр-addOn"]` создаёт одну бронь 60 мин с суммой цены смесителя; staff-карточка и письмо показывают обе позиции.
* **SC-002:** «туалет» отдельным слотом = вторая бронь того же клиента; обе брони видны в `/api/approvals` и держат независимые `scheduleVersion`.
* **SC-003:** выбор «30 мин vs час» через два продукта работает без кода 014 (канон YClients «комплекс как услуга»).
* **SC-004:** DEPOSIT-корзина: PaymentIntent = Σ депозитов; вебхук CONFIRMED; отмена до cutoff primary → refund всей суммы.
* **SC-005:** смешанный режим → `422 MIXED_PAYMENT_MODES`, 0 строк в БД; `items[] > 6` / `Σ > 480` → соответствующие 422.
* **SC-006:** `212/212` старых int-тестов зелёные; гонка двух клиентов на один composite-старт → 201 + 409.

---

## 6. Предполагаемая карта файлов

```text
src/collections/SlotReservations.ts              # MOD: itemsJson (jsonb, field-locked)
src/collections/BookingIntents.ts                # MOD: itemsJson (jsonb, raw-SQL write)
src/collections/Products/index.ts                # MOD: addOn checkbox + durationMin validator (≥0 при addOn)
src/migrations/<ts>_composite_booking.ts         # NEW: Expand-only items_json ×2 + down()
src/migrations/index.ts                          # MOD: регистрация
src/lib/availability/resolver.ts                 # MOD: composite override в computeSlots
src/lib/booking/compositeService.ts              # NEW: PURE деривация корзины (Σ/caps/modes/primary) + валидатор
src/lib/booking/bookingService.ts                # MOD: items[] вход, snapshot items_json, Σ суммы, idempotency состав
src/lib/booking/intentService.ts                 # MOD: items_json на фазе 1, гидратация на фазе 2, integrity check
src/app/api/booking/route.ts                     # MOD: items intake (фаза 1 + trust-cookie), 4xx-коды
src/app/api/availability/route.ts                # MOD: composite-параметры запроса (items[] → Σ)
src/lib/telegram/staffCard.ts                    # MOD: itemized карточка
src/lib/email/templates.ts                       # MOD: itemized confirmation
src/jobs/bookingEmail.ts                         # MOD: прокидка items snapshot
src/app/api/approvals/route.ts                   # MOD: items в payload
src/app/[locale]/book/confirmation/[id]/page.tsx # MOD: itemized список + агрегаты Σ в <DepositPayment>
src/app/[locale]/book/[slug]/page.tsx            # MOD: primaryService + availableAddOns (фильтр paymentMode) в SlotGrid
src/components/booking/SlotGrid.tsx              # MOD: блок «Добавить к визиту» + бегущий итог
src/components/booking/types.ts                  # MOD: CompositeItemDTO
src/i18n/locales/{ru,en}.json                    # MOD: строки корзины
tests/int/composite-booking.int.spec.ts          # NEW: матрица US1–US6
```

---

## 7. Open Questions / Для этапа `/speckit.clarify`

1. **Цена между фазами:** при смене `priceInUSD` продукта между фазой 1 и фазой 2 — брать цену фазы 2 (re-derive, рекомендация) или фиксировать snapshot на фазе 1 в интенте? → **A (РЕШЕНО 2026-11-18):** фаза 2, re-derive из живых продуктов (канон «всё из БД на момент брони»); drift длительности (`slotEnd − slotStart ≠ Σ durationMin`) → intent dead.
2. **`linkedReservationId`:** вводить ли nullable-поле «связанная бронь» в этом скоупе? → **A (РЕШЕНО):** отложено в Option 1 (информационное поле без механики = мусор).
3. **Порядок позиций в карточке:** → **A (РЕШЕНО):** primary (первая не-addOn) первым, далее позиции в порядке `items[]`.
4. **Капы:** → **A (РЕШЕНО):** константы кода `MAX_ITEMS = 6`, `MAX_COMPOSITE_MIN = 480` (в `ShopSettings` уводить по L1-сигналу).

## Clarifications

### Session 2026-11-18
- Q: Источник скоупа → A: L1-запрос реального клиента (корзина услуг: часть в одном слоте, часть отдельным; 30 мин/час; авторасчёт цены) + §2.2 BP-канона («мульти-сервисная корзина с шагом 30 минут») + дизайн-контур легаси-002 (L1).
- Q: Option выбор → A: Option 0 «Composite Booking» (один слот-контейнер, N позиций, Σ длительность); Option 1 (N броней под одним Order) и Option 2 (segment scheduler) — вне скоупа, Via Negativa §1.3.
- Q: Цена между фазами → A: фаза 2 re-derives из живых продуктов; drift длительности → intent dead (`INTENT_DEAD`), клиент повторяет бронь.
- Q: `linkedReservationId` → A: отложено в Option 1; «второй слот» в Option 0 = отдельная бронь того же клиента.
- Q: Порядок позиций в surfaces → A: primary первым, затем в порядке `items[]`; staff-карточка ≤ 4 строк позиций + `+N ещё`.
- Q: Капы → A: константы кода `MAX_ITEMS = 6`, `MAX_COMPOSITE_MIN = 480`; дубликат id в `items[]` = +1 количество, кап учитывает дубликаты; idempotency-ключ сортирует состав (повтор в другом порядке = тот же ключ).
