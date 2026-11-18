# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `015-e2e-regression-suite`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001–014 (`specs/main/architecture.md` v3.1.0)
**Статус:** **REVIEWED — v1.2 (2026-11-19; внешнее ревью antigravity AG-F1..F7 исправлено; v1.1 clarify; ready for implement per owner override)**
**Триггер / Signal (L1):** 014-composite-booking IMPLEMENTED с **нулём браузерного e2e** — корректность корзины проверена только int-тестами и разовым ручным GUI QA (не воспроизводимым в CI). Регрессионная база NFR-1401 не имеет UI-слоя для фич 002–014.
**Source of truth по бизнесу:** бизнес-план v2.7.2 unchanged — спека укрепляет качество уже проданного канона §2.2 (витрина услуг → корзина → бронь → холд/оплата), коммерческая дельта = 0. **Business plan: unchanged.**
**Design references:**
* **L1 (репо):** `tests/e2e/booking.e2e.spec.ts` — канон двухфазного OTP-e2e + `tests/helpers/otpFromDb.ts` (HMAC-деривация кода из БД — email-сервис не нужен); `tests/helpers/{seedUser,seed-book,login}.ts`.
* **L1 (репо):** `playwright.config.ts` — webServer `pnpm dev` :3000 (reuseExistingServer), retries CI×3, workers CI×1, html-репорт, trace on-first-retry; `pnpm test` уже гоняет int+e2e.
* **Vendor best practices:** Playwright docs — webServer/reuse, trace-on-retry, data-testid локаторы (паттерн уже в `SlotGrid.tsx`).

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

E2E-слой отстаёт от домена на ~7 спек. Существующие 3 файла (790 строк): `frontend.e2e.spec.ts` (644 строки — **шаблонный** ecommerce-контур Payload Commerce: cart/variants/search/auth — ноль спекового контента 002–014), `booking.e2e.spec.ts` (105 — two-phase OTP + 409 race, покрывает 002/007/008), `admin.e2e.spec.ts` (41 — только навигация по /admin). Не покрыто браузерным слоем вообще: **композитная корзина 014** (чекбоксы → бегущий итог → контейнерный грид → items[] → OTP → itemized confirmation), **money-UI 003/012** (DepositPayment на confirmation, Σ-агрегаты из `items_json`), **one-time token-страницы** (cancel/reschedule/acknowledge, включая composite-reschedule 014), **trust-cookie fast path**, **waitlist UI**, **approvals-панель** (items 014), **i18n booking-флоу**. Ошибки интеграции слоёв (UI-пейлоад → API → FSM → БД → surfaces) ловятся только ручным QA.

### 1.2. Решение (Tiered e2e regression suite поверх существующего каркаса)

1. **Каркас не трогаем:** те же `tests/e2e/*.e2e.spec.ts`, тот же `pnpm test:e2e` (`playwright.config.ts`), те же helpers; OTP — только через канон `getOtpCodeFromDb` (без реальной почты).
2. **Tier P0 — Composite journey (014):** гостевой сценарий «стригичка + addOn + вторая услуга» в браузере: чекбоксы «Добавить к визит» → бегущий итог Σ → грид **контейнерной** длительности (пересчёт при каждом выборе) → `items[]` сабмит → OTP-фаза → confirmation с itemized списком из N позиций. Плюс кэш-изоляция 60/75-мин гридов (регрессия AG-F3.1) и 409 race на composite-старт (расширение существующего race-теста).
3. **Tier P1 — Money surfaces (003/012/014):** DEPOSIT-корзина → confirmation рендерит `<DepositPayment>` с **Σ-агрегатами из `items_json`** (регрессия AG-F6.2); NONE-корзина — платёжный блок отсутствует; itemized confirmation-email контент верифицируется через страницу (email-тело — только int-уровень).
4. **Tier P1 — Token pages (003/014):** cancel по one-time GET-ссылке (повтор → 409 UX), reschedule через `ReschedulePicker` **для composite-брони** (валидация по контейнерной сетке — регрессия AG-F3.2), acknowledge.
5. **Tier P2 — Trust cookie (007), Waitlist UI (006), Admin (014/002):** вторая бронь того же email без OTP (fast path), waitlist-форма на пустой дате, админский CRUD продукта с `addOn` + approvals-list с `items`.
6. **Tier P2 — i18n (010):** booking-флоу в ru и en (ключи корзины 014).
7. **Инфра-фиксы:** `baseURL` в конфиге (сейчас закомментирован), общий fixture-хелпер сеяния bookable-услуг (`tests/helpers/seed-booking.ts` — уникальные слаги + hour-бакеты, канон int-тестов), детерминизм на общей dev-БД.

### 1.3. Via Negativa (Strict Taboos)

* ❌ **NO NEW DEPENDENCIES:** `@playwright/test@1.63` уже в devDeps; ничего не добавляем (в т.ч. visual-regression/axe-тулзы).
* ❌ **NO REAL EXTERNAL SERVICES:** Stripe — только через gateway-сеам (решение в clarify: env-гейт fake-gateway или test-keys); Resend — никогда (OTP из БД каноном); Telegram-бот вне браузера — не тестируется.
* ❌ **NO INT-ДУБЛИ:** браузерные тесты проверяют интеграцию слоёв (UI → API → FSM → БД → surfaces), а не домен-логику — валидации/каноны денег остаются в int (`composite-booking.int.spec.ts`).
* ❌ **NO DEV-БД ДЕСТРУКЦИИ:** e2e работают на dev-БД через Payload Local API seed с уникальными слагами/бакетами (канон существующих e2e) — никаких TRUNCATE.
* ❌ **NO PARALLEL DB RACES:** workers на CI = 1 (уже); локальный параллелизм — только по уникальным бакетам.
* ❌ **NO SCREENSHOT-DIFF REGRESSION** в этом скоупе (html-репорт + trace достаточны).
* ❌ **NO BREAKING:** все 3 существующих e2e-файла и `pnpm test` контур остаются зелёными; правки конфига — только additive (baseURL, опциональные projects).

---

## 2. User Stories (Prioritized)

### US1 — Composite booking journey (P0)

Гость на `/book/[slug]` включает 1 бесплатный addOn + 1 вторую услугу: бегущий итог Σ времени/цены обновляется; грид пересчитывается под контейнерную длительность (количество/края слотов меняются vs 60-мин); сабмит шлёт `items[]`; OTP-фаза (код из БД каноном) → redirect на confirmation; confirmation показывает itemized список (primary первым, addOn помечен) и статус BOOKED; повторное открытие confirmation по accessToken стабильно.

**Acceptance:**
* `items[]`-сабмит при включённых add-on vs `productId`-сабмит при пустой корзине (legacy-ветка UI сохраняется);
* после включения add-on на 60+15: последний слот грида уходит раньше/меньше слотов, чем у 60-мин грида (контейнер 75 мин, fix AG-F3.1 визуально);
* confirmation itemized: ровно N позиций, primary первой, «(add-on)» метка.

### US2 — Money surfaces (P0)

DEPOSIT-корзина (2 платные позиции) → после OTP confirmation рендерит `<DepositPayment>` с **суммой Σ депозитов** (агрегаты из `items_json`); NONE-корзина — платёжного блока нет; legacy-бронь (одна позиция) — DepositPayment по `itemId`-fallback.

**Acceptance:**
* сумма в DepositPayment = Σ депозитов позиций (не цена одной услуги — регрессия AG-F6.2);
* 0 позиций с деньгами → блок платежа не рендерится.

### US3 — One-time token pages (P1)

Cancel: GET-ссылка отменяет бронь (статус RELEASED, честный UX), повторное использование той же ссылки → честный 409/TOKEN_ALREADY_CONSUMED-UX. Reschedule: `ReschedulePicker` переносит **composite**-бронь только на слот контейнерной длительности (AG-F3.2), статус/версия растут. Acknowledge: reminder-ссылка подтверждает приход.

**Acceptance:** composite-перенос невозможен в 60-мин окно перед закрытием смены (grid fallback+clash остаётся бэкстопом).

### US4 — Trust-cookie fast path (P1)

Гость бронирует (OTP) → trust-cookie выпущен → вторая бронь того же email на другой слот проходит **без OTP** (прямая 201), mismatched email → OTP-фаза.

### US5 — Waitlist UI (P2)

Дата без слотов → waitlist-форма видна → join создаёт entry (double-opt-in механика 006 не ломается).

### US6 — Admin: каталог + approvals (P2)

Админ создаёт/редактирует product с `addOn=true, durationMin=0` (валидаторы 014 в UI); approvals-панель/лист показывает itemized `items` композитной брони (OPERATOR+).

### US7 — i18n booking flow (P2)

Корзинные ключи 014 существуют в ru и en; переключение локали меняет UI-тексты booking-флоу без пропусков (`?locale` / /[locale]-маршрутизация).

---

## 3. Edge Cases

* **Кэш-отравление грида (регрессия AG-F3.1):** на одной странице: 60-мин запрос → выбор add-on → 75-мин запрос → оба ответа различаются (ключ с items).
* **409 race composite×composite:** две вкладки на один composite-старт → одна бронь, вторая честный 409-UX (расширение существующего race-теста).
* **422 MIXED_PAYMENT_MODES в UI:** принудительно собранная через API смешанная корзина → UI показывает честную ошибку, бронь не создаётся.
* **OTP resend/expiry:** неверный код ×5 → intent dead UX; resend-кнопка вращает код (канон 007).
* **Expired/used cancel-токен:** повторная ссылка не молчит (409-UX).
* **Пустой каталог:** `/book/[slug]` несуществующего slug → notFound.
* **Trust-cookie mismatch:** cookie чужого email → OTP-фаза, а не бронь.

---

## 4. Requirements

### Functional Requirements

* **FR-1501 (Composite journey e2e):** браузерный сценарий US1 от чекбоксов до itemized confirmation; локаторы — только `data-testid` канон (`slot-grid`, `addon-*`, `basket-total`, `slot-option`, `booking-otp-*`, `booking-items`).
* **FR-1502 (Money surfaces e2e):** US2 — DepositPayment Σ-агрегаты + absence-кейс; **gateway-сеам РЕШЁН (clarify 2026-11-19): env-гейт `E2E_GATEWAY=fake`** — при выставленной переменной `stripeGateway`-сеам возвращает детерминированный fake-PI (тот же паттерн, что `input.gateway` в int-тестах); **без сетевых вызовов к реальному Stripe** на любом пути e2e.
* **FR-1503 (Token pages e2e):** US3 — cancel/reschedule/acknowledge GET-страницы, one-time семантика + composite-reschedule контейнерной сеткой.
* **FR-1504 (Fast path e2e):** US4 — trust-cookie повторная бронь без OTP.
* **FR-1505 (Waitlist/Admin/i18n e2e):** US5–US7 в P2-тире, опциональны к MVP-гейту спеки.
* **FR-1506 (Fixtures канон):** `tests/helpers/seed-booking.ts` — сеяние услуг (уникальные slug, addOn/режимы/депозиты) + hour-бакеты через Payload Local API; OTP — только `getOtpCodeFromDb`.
* **FR-1507 (Config fix):** `baseURL: http://localhost:3000` в `playwright.config.ts`; **`webServer.env` пробрасывает `E2E_GATEWAY=fake`** в процесс Next (иначе reuse-сервер вернёт 502 на DEPOSIT — fix AG-F1.2); прочие правки — additive.
* **FR-1508 (Prerequisite UI fixes, 014-хвост — fix AG-F2/F4/F5):** браузерные баги, блокирующие e2e, чинятся в Phase 1 этой спеки:
  * `SlotGrid.loadSlots` — `serviceId` добавляется в `items` ОДИН раз (сейчас дублируется per-addon → 135-мин грид при 2 addOn, fix AG-F2.1);
  * confirmation-страница ищет `slot-reservations` по `id` из URL (SlotGrid редиректит с `reservationId`), затем order по `slot.order` + сверка `accessToken` (сейчас ищет orders по reservationId — 404 при расхождении последовательностей, fix AG-F2.2); `CancelBookingButton` получает `reservationId = slot.id`;
  * `/book` витрина исключает голые addOn (`addOn not_equals true` — иначе seed-addOn ломает существующий `booking.e2e`), `/book/[slug]` грузит primary отдельным slug-запросом (limit:50 списка больше не решает 404);
  * `ReschedulePage` читает `items_json` и прокидывает состав в `ReschedulePicker` → `&items=...` в availability (иначе пикер рисует 60-мин грид для 75-мин брони, fix AG-F5).
* **FR-1509 (Rate-limit isolation, fix AG-F3):** каждый e2e `BrowserContext` шлёт уникальный заголовок `x-forwarded-for: 203.0.113.<n>` (RFC 5737 TEST-NET-3 — не loopback/internal для rateLimiter) — изоляция бакетов без изменений прод-логики `rateLimiter.ts`; иначе сьют сам себя забанит (`RL_IP_MAX=10` интентов / 10 мин на общий 127.0.0.1).

### Non-Functional Requirements

* **NFR-1501 (Zero Regression):** существующие 3 e2e-файла + все 232 int зелёные; `pnpm test` (int+e2e) проходит целиком.
* **NFR-1502 (Zero New Dependencies):** 0 новых пакетов.
* **NFR-1503 (Determinism):** уникальные hour-бакеты/слаги на прогон (канон prepaid-тестов); retries CI×3 (уже); trace on-first-retry (уже).
* **NFR-1504 (Speed Budget):** полный e2e-прогон ≤ 10 мин локально (холодный webServer-бут не считается).
* **NFR-1505 (No External Calls):** 0 сетевых обращений к реальному Stripe/Resend на любом пути e2e (верифицируется отсутствием их ключей в e2e-режиме).
* **NFR-1506 (Locator Hygiene):** никаких guessed-селекторов — только `data-testid`-канон; **недостающие testid добавляются в `ConfirmCancelForm`, `ReschedulePicker`, `AcknowledgeClient`, `WaitlistJoinForm`** (сейчас 0 testid — fix AG-F6), `booking-items` список на confirmation рендерится при любом составе (≥1 позиция); таймаут-бюджеты по умолчанию Playwright.

---

## 5. Success Criteria

* **SC-001:** композитный сценарий US1 проходит в браузере end-to-end и ловит регрессии класса AG-F2/F3/F5/F6 (проверяется намеренным «сломать-и-увидеть-красное» хотя бы на одном кейсе).
* **SC-002:** `pnpm test` зелёный целиком (int 232 + e2e); e2e-прогон ≤ 10 мин.
* **SC-003:** каждый FR-1501..1505 имеет ≥1 e2e-тест (RTM в qa/ по канону 29119).
* **SC-004:** 0 реальных внешних вызовов (Stripe/Resend) во всём e2e-прогоне.
* **SC-005:** `playwright.config.ts` — baseURL фиксирован, trace/report канон сохранён.

---

## 6. Предполагаемая карта файлов

```text
playwright.config.ts                              # MOD: baseURL + webServer.env E2E_GATEWAY=fake (fix AG-F1.2)
tests/helpers/seed-booking.ts                     # NEW: fixtures — уникальные ДАТЫ (не hour-бакеты), XFF TEST-NET-3 per context,
                                                  #      weekly-hours 1..7, cleanup() по ID (fix AG-F3/F4)
src/components/booking/SlotGrid.tsx               # MOD: fix дублирования serviceId в items-цикле (fix AG-F2.1)
src/app/[locale]/book/confirmation/[id]/page.tsx  # MOD: lookup slot-reservations по id → order по slot.order (fix AG-F2.2)
src/app/[locale]/book/page.tsx                    # MOD: витрина без голых addOn (fix AG-F4.1)
src/app/[locale]/book/[slug]/page.tsx             # MOD: primary по slug-запросу (fix AG-F4.3)
src/app/[locale]/booking/reschedule/page.tsx      # MOD: items_json → ReschedulePicker (fix AG-F5)
src/components/booking/ReschedulePicker.tsx       # MOD: &items=... в availability + testid (fix AG-F5/F6)
src/components/booking/DepositPayment.tsx         # MOD: fake-ветка для pi_e2e_ clientSecret без loadStripe (fix AG-F1.1)
src/components/booking/{ConfirmCancelForm,AcknowledgeClient,WaitlistJoinForm}.tsx  # MOD: +testid (fix AG-F6)
src/lib/payments/stripeGateway.ts                 # MOD: env-гейт E2E_GATEWAY=fake (РЕШЕНО clarify Q1, fix AG-F1)
tests/e2e/composite-booking.e2e.spec.ts           # NEW: US1 composite journey + кэш-изоляция + 409 race (P0)
tests/e2e/money-surfaces.e2e.spec.ts              # NEW: US2 DepositPayment Σ + absence (P0)
tests/e2e/token-pages.e2e.spec.ts                 # NEW: US3 cancel/reschedule/acknowledge (+composite reschedule) (P1)
tests/e2e/trust-fast-path.e2e.spec.ts             # NEW: US4 trust-cookie повторная бронь (P1)
tests/e2e/waitlist-admin-i18n.e2e.spec.ts         # NEW: US5–US7 (P2, опционально к MVP)
tests/e2e/booking.e2e.spec.ts                     # UNCHANGED (канон не трогается)
tests/helpers/otpFromDb.ts                        # UNCHANGED (переиспользуется)
```

---

## 7. Open Questions / Для этапа `/speckit.clarify`

1. **Gateway-сеам для money-e2e (US2):** как создать PI без сети? → **A (РЕШЕНО 2026-11-19): env-гейт `E2E_GATEWAY=fake`** в `stripeGateway`-сеаме (детерминированный fake-PI + тестовый clientSecret; тот же паттерн, что `input.gateway` в int-тестах).
2. **Целевая БД e2e:** dev-БД или выделенная `undreseller_e2e`? → **A (РЕШЕНО 2026-11-19): dev-БД + уникальные слаги/hour-бакеты** (канон существующих e2e, workers CI=1); выделенная БД — по L1-сигналу.
3. **CI-гейт:** как запускать e2e в CI? → **A (РЕШЕНО 2026-11-19): оставить `pnpm test` (int+e2e) как есть**; отдельный job — по мере роста прогонa.
4. **Visual regression:** в скоуп? → **A (РЕШЕНО 2026-11-19): табу, вне скоупа** — html-репорт + trace достаточны.

## Clarifications

### Session 2026-11-19
- Q: Gateway-сеам для money-e2e → A: `E2E_GATEWAY=fake` — env-гейт в payments-сеаме, fake-PI детерминирован, 0 сетевых вызовов (NFR-1505 усилен: гейт доказывается отсутствием ключей + всегда-фейковым путём в e2e-режиме).
- Q: БД e2e → A: dev-БД + уникальные слаги/hour-бакеты на прогон (канон существующих e2e; TRUNCATE запрещён Via Negativa).
- Q: CI → A: `pnpm test` (int+e2e) без выделенного job; пересмотреть при росте прогона.
- Q: Visual regression → A: вне скоупа (табу §1.3 подтверждено владельцем).

### Review fixes 2026-11-19 (antigravity AG-F1..F7, все 7 верифицированы TRUE)
- **AG-F1 (CRITICAL):** fake-`clientSecret` = `pi_e2e_<id>_secret_e2e` (формат Stripe); `DepositPayment` рендерит fake-ветку (section/form/pay-button, `depositNotice`/`remainingNotice`) **без `loadStripe()`/`<Elements>`** — 0 ключей, 0 запросов к Stripe CDN; `E2E_GATEWAY=fake` пробрасывается через `webServer.env`.
- **AG-F2 (CRITICAL):** fix `SlotGrid` items-дублирования + confirmation lookup через `slot-reservations.id` (sequence-luck 404 закрыт).
- **AG-F3 (HIGH):** rate-limit изоляция через `x-forwarded-for: 203.0.113.<n>` per BrowserContext (TEST-NET-3, не loopback) — без правок прод-`rateLimiter.ts`.
- **AG-F4 (HIGH):** seed выдаёт уникальные **даты** (today+2+N), не hour-бакеты (браузерный UI гранулярен по дате; nowMin не активен в любое время суток); weekly-hours на все 7 дней; `/book` без голых addOn; `[slug]` primary по slug-запросу; `cleanup()` по ID в afterAll.
- **AG-F5 (HIGH):** reschedule page/picker прокидывают `items_json` состав → контейнерный грид в браузере.
- **AG-F6 (MEDIUM):** testid добавляются в 4 компонента; `booking-items` при любом составе.
- **AG-F7 (LOW):** `qa/waiver.md` (Principle XII: test-only фича → RTM-lite) пишется в T1540.
