# Test Cases: 005 (ISO/IEC/IEEE 29119-3)

> Manual-тестировщик, staging/локально. Значения захардкожены; шаги атомарные; кейсы независимы (каждый сам выставляет предусловия). Test-карта Stripe: `4242 4242 4242 4242` (успех), `4000 0000 0000 0002` (decline). Окружение: `stripe listen --forward-to <host>/api/payments/stripe/webhook`.

## US1 — Auth Hardening

### TC-005-001: Логин владельца legacy-паролем → прозрачный пере-хеш scrypt→Argon2id
- **Traceability**: FR-501, T012/T020 | **Tier**: Smoke | **Priority**: P0 | **Type**: Functional | **Technique**: EP (positive)
- **Pre-conditions**: инстанс 004→005 мигрирован; OWNER `owner@qa-underundre.com` с паролем `Qa-Owner-2026!` (хеш scrypt, `passwordAlgo IS NULL`); БД-доступ (psql).
- **Test Data**: email `owner@qa-underundre.com`, пароль `Qa-Owner-2026!`.
- **Steps**: 1) `psql: SELECT "passwordAlgo" FROM account a JOIN "user" u ON a."userId"=u.id WHERE u.email='owner@qa-underundre.com';` → NULL. 2) Открыть `/admin/login`, ввести данные, Submit. 3) Повторный SELECT.
- **Expected**: логин 200, редирект `/admin/catalog`; после шага 3 `passwordAlgo = 'argon2id'`, хеш начинается `$argon2id$`.
- **Post**: выйти из админки.

### TC-005-002: Повторный логин после пере-хеша тем же паролем
- **Traceability**: FR-501 | **Tier**: Sanity | **Priority**: P1 | **Type**: Functional | **Technique**: EP
- **Pre**: TC-005-001 выполнен (пароль уже Argon2id).
- **Data**: те же креденшелы.
- **Steps**: выйти → войти снова.
- **Expected**: 200 с первого раза; `passwordAlgo` остаётся `argon2id`; время ответа в норме (<2 c локально).
- **Post**: logout.

### TC-005-003: Битый хеш → fail-closed
- **Traceability**: FR-501 | **Tier**: Regression | **Priority**: P1 | **Type**: Negative | **Technique**: Error Guessing
- **Pre**: тестовый OPERATOR `op@qa-underundre.com`; `psql: UPDATE account SET password='garbage-no-separator' WHERE ...'op@...'`.
- **Steps**: попытка логина `op@qa-underundre.com` / `Qa-Op-2026!`.
- **Expected**: 401 «Invalid email or password»; стектрейс в логах отсутствует; никаких 500.
- **Post**: восстановить хеш (или удалить аккаунт).

### TC-005-004: Per-account lockout 004 не сломан (регрессия)
- **Traceability**: FR-503 (фон 004) | **Tier**: Regression | **Priority**: P2 | **Type**: Negative | **Technique**: BVA (4/5 попыток)
- **Pre**: `lockqa@qa-underundre.com` существует.
- **Steps**: 4 неудачных логина (пароль `wrong-1..4`) → 5-й валидный логин успешен. Отдельно: 5 неудачных → 6-й даже с верным паролем.
- **Expected**: в первом случае успех (4 < порог); во втором — 429/lockout-ответ с retryAfterSeconds ≈ 900.
- **Post**: ждать 15 мин или перезапустить инстанс (in-memory).

### TC-005-005: Per-IP лимит: 6-я попытка с одного IP → 429 на 30 мин
- **Traceability**: FR-503, T021 | **Tier**: Smoke | **Priority**: P0 | **Type**: Boundary | **Technique**: BVA (5/MAX)
- **Pre**: свежий IP (перезапуск WiFi/VPN между кейсами); 6 разных несуществующих аккаунтов `u1..u6@qa-underundre.com`.
- **Steps**: 5 неудачных логинов (разные аккаунты, один IP, пароль `nope`). 6-я попытка (любой аккаунт).
- **Expected**: попытки 1–5 → 401; попытка 6 → **429** с `Retry-After: 1800`; текст «temporarily locked».
- **Post**: смена IP.

### TC-005-006: Блокировка IP не задевает другой IP
- **Traceability**: FR-503 | **Tier**: Sanity | **Priority**: P1 | **Type**: Negative | **Technique**: EP (изоляция ключей)
- **Pre**: TC-005-005 выполнен (IP-A заблокирован).
- **Steps**: с IP-B (другая сеть) валидный логин `owner@qa-underundre.com` / `Qa-Owner-2026!`.
- **Expected**: 200 немедленно — per-IP лимит keyed по IP.
- **Post**: logout.

### TC-005-007: Независимость per-IP и per-account лимитов
- **Traceability**: FR-503 | **Tier**: Regression | **Priority**: P2 | **Type**: Negative | **Technique**: Decision Table (2×2)
- **Pre**: два IP (A, B), один аккаунт `victim@qa-underundre.com`.
- **Steps**: с IP-A — 5 неудачных по `victim` (IP-A блокируется, аккаунт — 5 фейлов per-account тоже). С IP-B — попытка `victim` с верным паролем.
- **Expected**: IP-B не заблокирован per-IP, но аккаунт может быть per-account-locked (оба лимита считаются независимо) — проверить какой ответ: 429 lockout аккаунта. Зафиксировать фактическое поведение против implementation.
- **Post**: перезапуск инстанса (сброс in-memory).

### TC-005-008: Деактивация OPERATOR режет живую сессию ≤1 запрос
- **Traceability**: FR-502, T013/T023 | **Tier**: Smoke | **Priority**: P0 | **Type**: Functional | **Technique**: State Transition
- **Pre**: OPERATOR `op@qa-underundre.com` залогинен, сидит в `/admin/catalog`; OWNER залогинен параллельно.
- **Steps**: 1) OWNER: `/admin/team` → деактивировать `op`. 2) OPERATOR не выходя: клик в любую вкладку админки.
- **Expected**: шаг 2 → редирект на `/admin/login` (401 сессии); в БД `SELECT sessionEpoch FROM "user" WHERE email='op@...'` = 2, строк в `session` у него 0; аудит `STAFF_SESSIONS_REVOKED` cause=deactivated.
- **Post**: —.

### TC-005-009: Понижение роли OPERATOR→PERFORMER тоже отзывает сессии
- **Traceability**: FR-502 | **Tier**: Sanity | **Priority**: P1 | **Type**: Functional | **Technique**: EP
- **Pre**: как TC-005-008, действие — смена роли.
- **Expected**: та же отсечка ≤1 запрос; cause=role_change.
- **Post**: вернуть роль.

### TC-005-010: Отзыв в момент живого запроса (гонка)
- **Traceability**: FR-502 | **Tier**: Extended | **Priority**: P2 | **Type**: Boundary | **Technique**: Race
- **Pre**: OPERATOR залогинен; на руках его cookie.
- **Steps**: одновременно (две вкладки devtools/curl): curl с cookie OPERATOR на `/api/admin/...` + OWNER жмёт deactivate.
- **Expected**: запрос либо успел до отзыва (200), либо отвергнут; НИКОГДА не 200 после завершения отзыва. Основная гарантия — unit-тест T013; ручная проверка на дым отсутствия дыры.
- **Post**: —.

### TC-005-011: Auth-события: полнота, ровно один раз, ноль PII
- **Traceability**: FR-505, T022 | **Tier**: Regression | **Priority**: P1 | **Type**: Functional/Security | **Technique**: EP (5 типов)
- **Pre**: прогнать по разу: успех, фейл, lockout аккаунта, IP-лимит, отзыв.
- **Steps**: `psql: SELECT action FROM "AuditEvent" WHERE action LIKE 'STAFF_%' ORDER BY "createdAt" DESC LIMIT 12;` + grep логов контейнера.
- **Expected**: присутствуют ровно по одному: `STAFF_SIGN_IN`, `STAFF_SIGN_IN_FAILED`, `STAFF_ACCOUNT_LOCKED`, `STAFF_IP_RATE_LIMITED`, `STAFF_SESSIONS_REVOKED`; в метаданных нет паролей/токенов; IP только вида `x.x.x.0/24`.
- **Post**: —.

### TC-005-012: Argon2 бенчмарк-гейт (Level 1 evidence)
- **Traceability**: FR-504a/NFR-5, T024 | **Tier**: Smoke | **Priority**: P0 | **Type**: Evidence | **Technique**: Measurement
- **Pre**: evidence-файл создан задачей T024.
- **Steps**: открыть `specs/005/evidence/argon2-benchmark.md`; сверить: 5 логинов + поллер, RSS пик, параметр env.
- **Expected**: пик ≤500 MB; дата ≤ merge-коммита US1; параметры (65536 KiB / 3 / 4) или ниже.
- **Post**: —.

## US2 — Stripe (Critical)

### TC-005-013: Prepaid-бронь → Checkout открывается, TTL ровно 15 мин
- **Traceability**: FR-510/FR-511, T030 | **Tier**: Smoke | **Priority**: P0 | **Type**: Functional/Boundary | **Technique**: BVA (TTL)
- **Pre**: `PAYMENT_PROVIDERS=STRIPE`; сервис «Консультация 60 мин» $50.00 с `requiresFullPrepayment=true`; `stripe listen` активен.
- **Steps**: витрина → слот → оформить → редирект на `checkout.stripe.com`; таймер сессии на странице.
- **Expected**: Stripe-страница с картой и (при зарегистрированном домене) Apple Pay; обратный отсчёт ≈ **15:00** (не 30:00); в БД резервация `PAYMENT_PENDING`, `holdExpiresAt ≈ now+15m`.
- **Post**: не платить (для этого кейса).

### TC-005-014: Оплата 4242 → BOOKED/PAID + связка + уведомления
- **Traceability**: FSM-§3/FR-514, T031 | **Tier**: Smoke | **Priority**: P0 | **Type**: Functional | **Technique**: EP (positive) + State Transition
- **Pre**: TC-005-013 дошёл до Checkout.
- **Steps**: карта `4242 4242 4242 4242`, any future CVC/zip → Pay → вернуться в инстанс.
- **Expected**: `SlotReservation.status=BOOKED`, `Order.status=PAID`; `PaymentAllocationLink(provider='STRIPE')`; TG-уведомление клиенту и staff-боту; `InboxEvent(dedupeKey='stripe_evt_...')`.
- **Post**: —.

### TC-005-015: Replay ×3 того же event → deduplicated, состояние неизменно
- **Traceability**: FR-514, T031/T032 | **Tier**: Smoke | **Priority**: P0 | **Type**: Negative | **Technique**: Error Guessing (replay)
- **Pre**: TC-005-014 завершён; event id из `stripe listen`.
- **Steps**: `stripe events resend evt_<id>` трижды подряд.
- **Expected**: каждый ответ `{deduplicated:true}`; в БД ровно одна строка `PaymentAllocationLink` по заказу, статусы не изменились, вторых уведомлений нет.
- **Post**: —.

### TC-005-016: Declined карта → статусы не меняются + TG-напоминание
- **Traceability**: FSM-§3, T031 | **Tier**: Sanity | **Priority**: P1 | **Type**: Negative | **Technique**: Decision Table
- **Pre**: новый заказ до Checkout (как TC-005-013).
- **Steps**: карта `4000 0000 0000 0002` → Pay.
- **Expected**: `payment_intent.payment_failed` обработан; `SlotReservation` остаётся `PAYMENT_PENDING`, `Order` — прежний; клиенту TG «платёж не прошёл, попробуйте ещё» в течение 1 мин; холд жив до 15 мин.
- **Post**: отпустить холд (не платить).

### TC-005-017: Истечение сессии (не платить) → слот освобождён
- **Traceability**: FSM-§3, T031 | **Tier**: Sanity | **Priority**: P1 | **Type**: Boundary | **Technique**: State Transition (timeout)
- **Pre**: заказ до Checkout; зафиксировать дату/время слота.
- **Steps**: закрыть Checkout не платя; подождать 15–16 мин (или эмулировать `stripe events resend` для `checkout.session.expired` тестового события).
- **Expected**: `status=RELEASED`, `Order=PAYMENT_EXPIRED`; слот снова виден в слотах этой даты (`includeUnavailable=1` его не показывает как занятый).
- **Post**: —.

### TC-005-018: Оплата на 14-й минуте (граница TTL) → штатное BOOKED
- **Traceability**: FR-511 | **Tier**: Extended | **Priority**: P1 | **Type**: Boundary | **Technique**: BVA (MIN+1 до MAX)
- **Pre**: как TC-005-013; таймер на руках.
- **Steps**: ждать до отсчёта ~01:00–00:30, оплатить 4242.
- **Expected**: BOOKED/PAID штатно; НЕ уходит в late-payment/FR-432 (сессия и холд истекают синхронно).
- **Post**: —.

### TC-005-019: Возврат через Dashboard → CANCELLED + RefundOperation
- **Traceability**: FR-515, T031 | **Tier**: Smoke | **Priority**: P0 | **Type**: Functional | **Technique**: State Transition
- **Pre**: оплаченный заказ TC-005-014.
- **Steps**: Stripe Dashboard (test mode) → Payments → refund $50.00 (partial: $10.00 — вторым прогоном).
- **Expected**: `charge.refunded` → заказ `CANCELLED` (полный) с `RefundOperation(kind='STRIPE', actor='stripe_dashboard')`; слот свободен; обе стороны уведомлены. Partial: статус по решению §3 — зафиксировать фактический (ожидание: остаётся PAID, RefundOperation записан).
- **Post**: —.

### TC-005-020: Подделка подписи вебхука → 401, ноль эффектов
- **Traceability**: FR-512, T031 | **Tier**: Smoke | **Priority**: P0 | **Type**: Security/Negative | **Technique**: Attack
- **Pre**: curl на руках; заказ в `PAYMENT_PENDING`.
- **Steps**: `curl -X POST <host>/api/payments/stripe/webhook -H 'stripe-signature: t=1,v1=deadbeef' -d '{"type":"checkout.session.completed","data":{}}'`.
- **Expected**: 401; БД без изменений (сравнить статусы до/после); security-запись в логах; повтор с отсутствующим заголовком — тоже 401.
- **Post**: —.

### TC-005-021: Stripe недоступен при создании инвойса → 503, холд НЕ поставлен
- **Traceability**: FR-511a, T033 | **Tier**: Sanity | **Priority**: P0 | **Type**: Negative | **Technique**: Сбой зависимости
- **Pre**: `STRIPE_SECRET_KEY=sk_test_invalid` (рестарт не нужен, если env читается на вызове — иначе перезапуск); prepaid-сервис активен.
- **Steps**: попытка бронирования prepaid-услуги.
- **Expected**: HTTP 503 с retry-сообщением (не 500, не «тихий» заказ); слот на дату остаётся свободным (проверить `/api/booking/slots`); аудит `STRIPE_INVOICE_FAILED`.
- **Post**: вернуть валидный ключ.

### TC-005-022: Кошелёк Apple Pay виден в Checkout (deployment-гейт)
- **Traceability**: FR-511 | **Tier**: Extended | **Priority**: P2 | **Type**: Functional | **Technique**: EP
- **Pre**: домен staging зарегистрирован в Stripe → Settings → Payment domains; Safari/iPhone.
- **Steps**: дойти до Checkout, открыть на iPhone/Safari.
- **Expected**: кнопка Apple Pay присутствует; оплата через wallet проходит в тот же FSM-путь (TC-005-014 эквивалент).
- **Post**: —.

### TC-005-023: Выбор способа при 2 провайдерах; прямой путь при 1
- **Traceability**: FR-516, T034 | **Tier**: Sanity | **Priority**: P1 | **Type**: Functional | **Technique**: Decision Table (1 vs N)
- **Pre**: конфиг A: `PAYMENT_PROVIDERS=NOWPAYMENTS,STRIPE`; конфиг B: `PAYMENT_PROVIDERS=STRIPE`.
- **Steps**: в обоих конфигах дойти до оплаты prepaid-услуги.
- **Expected**: A — выбор «Крипта / Карта» перед редиректом; B — сразу Checkout Stripe без выбора.
- **Post**: вернуть рабочий конфиг.

### TC-005-024: Гонка completed + expired → ровно один переход
- **Traceability**: FR-514/FSM-§3, T032 | **Tier**: Extended | **Priority**: P1 | **Type**: Boundary | **Technique**: Race
- **Pre**: заказ в `PAYMENT_PENDING`; два тестовых события на руках (`stripe trigger checkout.session.completed` и эмуляция expired).
- **Steps**: отправить оба почти одновременно (два окна `stripe listen`/resend).
- **Expected**: итог строго один из {BOOKED, RELEASED} — по тому, что первым прошло дедуп-инсерт; второй — no-op/deduplicated; НИКОГДА оба эффекта. (Главная гарантия — unit T032; ручной прогон на дым.)
- **Post**: —.

### TC-005-025: Minor units: KWD/JPY в line_items без ×100
- **Traceability**: FR-511/FR-513, T030 | **Tier**: Extended | **Priority**: P1 | **Type**: Boundary | **Technique**: BVA (scale 0 и 3)
- **Pre**: тестовый инстанс с `ShopSettings.currency='KWD'`, услуга 25.000 KWD (=25000 fils); JPY-вариант 1000 JPY.
- **Steps**: дойти до Checkout в обоих.
- **Expected**: Stripe-страница показывает «KWD 25.000» (unit_amount=25000) и «¥1,000» (unit_amount=1000); после оплаты PaymentAllocationLink суммы совпадают.
- **Post**: вернуть USD.

### TC-005-026: Freeze-канон: замороженный крипто-холд + Stripe-expired другого заказа — без ложных переходов
- **Traceability**: FSM-§3 | **Tier**: Extended | **Priority**: P2 | **Type**: Negative | **Technique**: Cross-track
- **Pre**: заказ-1 NOWPayments в `confirming` (заморожен); заказ-2 Stripe-сессия истекает.
- **Steps**: дождаться/триггернуть `checkout.session.expired` заказа-2.
- **Expected**: заказ-2 → RELEASED; заказ-1 остаётся заморожен (никаких изменений). Изоляция треков.
- **Post**: —.

## US3 — zod@4

### TC-005-027: Снапшоты форм 400 идентичны (гейт)
- **Traceability**: FR-522, T040/T042 | **Tier**: Smoke | **Priority**: P0 | **Type**: Evidence | **Technique**: Snapshot diff
- **Pre**: задачи T040–T042 выполнены.
- **Steps**: CI-артефакт/локально `npx jest tests/unit/api-error-shapes.snapshot.test.ts`.
- **Expected**: зелёный; diff форм между zod3-снапшотом и zod4-прогоном = 0.
- **Post**: —.

### TC-005-028: npm audit 0 H/C + лицензии PASS
- **Traceability**: FR-520/NFR-3, T041 | **Tier**: Smoke | **Priority**: P0 | **Type**: Evidence
- **Steps**: `npm audit` → вывод; `node scripts/verify-licenses.mjs`.
- **Expected**: 0 High, 0 Critical (GHSA-mrhx закрыт); лицензионный гейт PASS (stripe MIT, argon2 MIT/Apache-2.0 в реестре).
- **Post**: —.

### TC-005-029: Регресс границы FR-425: OUT_CALL без адреса → та же 400-форма
- **Traceability**: FR-521/FR-522 | **Tier**: Regression | **Priority**: P1 | **Type**: Negative | **Technique**: BVA
- **Steps**: `curl -X POST /api/booking -d '{"itemId":"<svc-out>","fulfillmentMode":"OUT_CALL"}'` (без serviceAddress).
- **Expected**: 400; поле `serviceAddress` в fieldErrors (форма как до миграции — свера со снапшотом).
- **Post**: —.

## US4 — Консолидация API

### TC-005-030: Старый путь → 308 + заголовки
- **Traceability**: FR-530, T051 | **Tier**: Smoke | **Priority**: P0 | **Type**: Functional | **Technique**: Contract
- **Steps**: `curl -i -X POST <host>/api/booking/lock -d '<валидный body>'`.
- **Expected**: 308; `Location: /api/booking`; `Deprecation: true`; `Sunset: <дата, деплой+90d>`; тело не выполняет бизнес-логику.
- **Post**: —.

### TC-005-031: Поведение через redirect ≡ прямой путь
- **Traceability**: FR-530/531, T050 | **Tier**: Sanity | **Priority**: P1 | **Type**: Functional | **Technique**: Equivalence
- **Steps**: одна и та же валидная бронь: (a) через `/api/booking/lock` c `-L`, (b) через `/api/booking`.
- **Expected**: идентичные ответы/статусы/снапшоты в БД.
- **Post**: отменить брони.

### TC-005-032: Двойное бронирование через оба пути → 409
- **Traceability**: FR-531 | **Tier**: Regression | **Priority**: P1 | **Type**: Negative | **Technique**: Race
- **Steps**: занять слот; повторная бронь того же слота через `/api/booking` и через `/lock -L`.
- **Expected**: оба → 409 `SLOT_UNAVAILABLE` (GiST 23P01).
- **Post**: —.

## US5 — Polish

### TC-005-033: Переключатель reject-политики без рестарта (3 режима)
- **Traceability**: FR-540, T060 | **Tier**: Sanity | **Priority**: P1 | **Type**: Functional | **Technique**: Decision Table (3×1)
- **Pre**: OPERATOR в `/admin/settings` (OPERATIONAL-секция); тестовая бронь от клиента.
- **Steps**: для каждого `NOTIFY_CUSTOMER / SILENT / STAFF_ONLY` (переключатель → Save): отклонить броню в staff-боте.
- **Expected**: NOTIFY_CUSTOMER — клиенту приходит отказ; SILENT — ничего клиенту; STAFF_ONLY — уведомление только в staff-чат. Смена вступает в силу без рестарта. PERFORMER переключатель не видит; PATCH с PERFORMER-сессией → 403.
- **Post**: вернуть NOTIFY_CUSTOMER.

### TC-005-034: uk-локаль: хром + плюралы + контент авторский
- **Traceability**: FR-541, T061 | **Tier**: Sanity | **Priority**: P2 | **Type**: Functional | **Technique**: EP + ICU
- **Steps**: переключить язык на uk (или `NEXT_LOCALE=uk`); страница с 1/2/5 доступными слотами.
- **Expected**: хром uk («Каталог», «Запис»); плюралы «1 слот / 2 слоти / 5 слотів»; названия услуг — как заданы владельцем (не переводятся).
- **Post**: вернуть ru.

### TC-005-035: uk parity-гейт
- **Traceability**: FR-541 | **Tier**: Sanity | **Priority**: P2 | **Type**: Evidence
- **Steps**: `node scripts/i18n-coverage-gate.mjs --locales ru,en,uk`.
- **Expected**: PASS (100% резолв, паритет, ICU other).
- **Post**: —.

### TC-005-036: formatMinor: KWD 3 decimals / JPY 0 на витрине
- **Traceability**: FR-542, T062 | **Tier**: Sanity | **Priority**: P1 | **Type**: Boundary | **Technique**: BVA
- **Pre**: тест-инстанс currency=KWD, услуга 25.500 KWD; JPY-вариант.
- **Steps**: витрина → карточка; админ-каталог; staff-бот карточка заказа.
- **Expected**: везде «KWD 25.500» и «¥1,000» — ни одного «25.50 KWD»/«¥10.00» (×100-мусор).
- **Post**: вернуть USD.

## US6 — Orphan cleanup

### TC-005-037: Чистая база без P2021 (evidence)
- **Traceability**: FR-550, T070 | **Tier**: Smoke | **Priority**: P0 | **Type**: Evidence
- **Steps**: CI/локально: свежая scratch-БД → `npx prisma migrate dev` (или deploy) после удаления моделей.
- **Expected**: применяются все миграции 001→005 без ошибок; в `prisma.schema` нет 14 моделей; `npx tsc --noEmit` зелёный.
- **Post**: —.

### TC-005-038: rg-гейт CI: 0 ссылок на orphan-модели
- **Traceability**: FR-550, T002 | **Tier**: Regression | **Priority**: P1 | **Type**: Evidence
- **Steps**: прогнать CI-джобу (или локально rg-команду из T002).
- **Expected**: exit 0, ноль совпадений в `app lib scripts components`.
- **Post**: —.

## Exploratory Charters (Critical-контур)

### CH-005-01: Stripe webhook fuzzing (60 мин)
Цель: сломать вебхук неожиданным вводом. Области: неизвестные `event.type` (шлём curl'ом с валидной подписью тест-секрета), `metadata.orderId` несуществующий/чужой/пустой, `amount` = 0/отрицательное/строка, чужая валюта, повтор 100× один id подряд, тело 1 MB. Ожидание: каждое — 2xx no-op или 4xx, ноль побочных записей, ноль 500.

### CH-005-02: Auth-эндпоинт abuse (45 мин)
Цель: обход лимитов/инъекции. Области: 5 попыток с разных X-Forwarded-For (спуф заголовка — задокументировать, доверяет ли прокси), пароли 10k символов/unicode/NULL-byte (Argon2 не падает), параллельные логины 10 потоков (мьютекс держит RSS), логин во время Argon2-верификации другого (блокировки очереди), кривые JSON-тела. Ожидание: без 500, без утечки секретов в лог, RSS ≤500 MB.
