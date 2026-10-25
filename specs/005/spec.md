# 📋 ЧАСТЬ 1: СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `005-stripe-adapter-and-sovereign-auth`
**Ветка:** `005-stripe-adapter-and-sovereign-auth`
**Путь к спеке:** `undreseller/specs/005/spec.md`
**Статус:** **DRAFT — REVISION 2.1 (post-004 alignment + external review round 1, 2026-10-25)**. Ревизия 1 признана частично устаревшей (писалась до релиза 004). Rev 2.1 закрывает ревью-раунд 1: sessionEpoch Model A, Argon2id бенчмарк-гейт, dashboard-driven payment methods, retention-контракт дедупа InboxEvent, grep-гейт FR-550, график 308→410, auth-обсервабилити, форма replay-теста.
**Архитектурный фундамент:** `SPEC-ARCH-INVARIANTS-2026`; контракты и FSM релиза 004 (`specs/004-release-readiness/`)
**Рантайм:** Node.js 22 LTS (`node:22-alpine`), PostgreSQL 16, Prisma ORM (единственная ORM)
**Source of truth по бизнесу:** `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v18.6 (fiat-эквайринг — capability уже поставляемого шаблона, не новый SKU)

---

## 1. Контекст, Бизнес-Обоснование и Границы (Why & Bounds)

### 1.1. Проблема и бизнес-оправдание
Клиенты шаблона (и флагман `shop.underundre.com`) теряют бронирования и получают no-show там, где крипта/Stars неприемлемы: нужен фиатный эквайринг (карты Visa/MC/Apple Pay) для депозитов и полных предоплат. Сторонние облака авторизации (Clerk, Auth0) недопустимы: суверенитет данных, SaaS-налог $0.02/MAU, санкционные риски.

Плюс: релиз 004 закрыл 60 из 63 задач, но оставил хвосты (см. §1.4), которые логично доезжают в 005 тем же составом.

### 1.2. Решение
1. **Stripe-адаптер** в существующий провайдер-нейтральный платёжный слой 004 (`lib/payments/providerContract.ts`): третий провайдер в реестре рядом с NOWPayments и Telegram Stars. Никакого параллельного платёжного слоя.
2. **Харднинг суверенной аутентификации персонала** поверх as-built 004 (scrypt-логин уже работает): Argon2id-пере-хеш, мгновенный массовый отзыв сессий, per-IP anti-bruteforce поверх per-account lockout.
3. **Долговые хвосты 004/003:** миграция zod@4, консолидация booking-API, polish-пакет.

### 1.3. Границы скоупа и законы Via Negativa (Strict Taboos)
* ❌ **ЗАКОН ОДНОЙ ORM:** 100% схемы, миграций и транзакций — **Prisma**. Drizzle запрещён.
* ❌ **ZERO CUSTOMER ACCOUNTS:** клиентам аккаунты запрещены; гостевой checkout без паролей.
* ❌ **NO NEW IDENTITY TABLES:** новые таблицы идентичности (`StaffUser`/`StaffSession` из ревизии 1) **не создаются** — используем as-built `User`/`Account`/`Session` + `StaffMember` (lineage 003/004). Харднинг — на существующих таблицах.
* ❌ **PERFORMER-ДОСТУП — ПО RBAC-МАТРИЦЕ 004** (замена табу «NO WEB ADMIN FOR PERFORMERS» ревизии 1): PERFORMER входит в веб-админку с минимальными правами (свои брони, свой профиль); мутации каталога/настроек → 403 серверно. Полная матрица — `specs/004-release-readiness/qa/` (TC-004 RBAC) и `lib/security/staffRbac.ts`.
* ❌ **STRIPE = ИНФРАСТРУКТУРНЫЙ АДАПТЕР,** не бизнес-интеграция: правило Sprint B «≤1 внешняя бизнес-интеграция» не расходуется.
* ❌ **NO RECURRENT SUBSCRIPTIONS:** Stripe Billing-подписки запрещены; только `mode: "payment"`.
* ❌ **NO PARALLEL DEDUP:** таблица `ProcessedExternalEvent` из ревизии 1 не создаётся — идемпотентность вебхуков через существующий `InboxEvent` (UNIQUE `eventId`, контракт 004 data-model §1.2).
* ❌ **NO NEW PAYMENT TABLES:** платёжная связка — существующие `PaymentEvent`/`PaymentAllocationLink`/`RefundOperation`; идентификаторы Stripe-сессий живут в `PaymentAllocationLink.providerPaymentId`.

### 1.4. Хвосты, вошедшие в скоуп (источник: 004 close-out)
| # | Хвост | Источник |
|---|---|---|
| D1 | Миграция zod 3.25 → 4.x (снимает последний audit-high GHSA-mrhx-c7xc-m3w5) | 004 T003/T113 mitigation note |
| D2 | Консолидация `/api/booking/lock` vs `/api/booking` (один эндпоинт) | 004 plan.md §Phase 4 — «005-scheduled» |
| D3 | `STAFF_REJECT_NOTIFY_MODE` env → колонка `ShopSettings` (per-instance политика, FR-429) | 004 T093 deviation |
| D4 | uk-локаль (data-only: `messages/uk.json` + гейт) | 004 D1/FR-411 «uk post-launch» |
| D5 | FE-форматирование минор-юнитов JPY(0)/KWD(3) на витрине/чекауте (BE уже на registry-скейле) | 004 T026 follow-up |
| D6 | Решение по 14 schema-only моделям 003 без миграций (мина P2021) | 004 backlog-carried-over §«Состояние на диске» |

**Вне скоупа 005:** Tier-2 коммерческие паки 003 (fulfillment/payment-plans/quotes/party/change-requests/compliance) — остаются в `004 backlog-carried-over-0032.md` за Demand Gate T069; OTel-трейсинг (остаётся пост-релизным); staging-операции T111/T112/T115 (ops, не спека); multi-replica rate limiting (Redis — только при `REPLICA_COUNT>1`, не планируется).

---

## 2. Архитектура Данных (Prisma: только аддитивные изменения)

Существующая схема — база. Новые таблицы: **ноль**. Изменения:

```prisma
// ShopSettings (MODIFIED) — D3: политика уведомлений при отказе (FR-429)
// enum StaffRejectNotifyMode { NOTIFY_CUSTOMER  SILENT  STAFF_ONLY }
model ShopSettings {
  // ...существующие поля 004...
  staffRejectNotifyMode StaffRejectNotifyMode @default(NOTIFY_CLIENT) // замена env-варианта
}

// Account (MODIFIED) — маркер хеш-алгоритма для Story 1 (пере-хеш при следующем логине)
model Account {
  // ...существующие поля...
  passwordAlgo String? // null = scrypt (legacy, 004), "argon2id" = после пере-хеша
}

// User (MODIFIED) — мгновенный массовый отзыв (Story 1)
model User {
  // ...существующие поля...
  sessionEpoch Int @default(1) // инкремент = все сессии пользователя недействительны
}

// Session (MODIFIED) — снимок epoch на момент создания (Модель А: int-равенство)
model Session {
  // ...существующие поля...
  epochCreated Int @default(1) // записывается = user.sessionEpoch при логине
}
```

**Миграция:** одна expand-фаза `20261101000000_005_stripe_and_hardening/` (+`down.sql`), аддитивно, по канону Constitution X (как 004). Enum `StaffRejectNotifyMode` — новый тип; бизнес-значение по умолчанию `NOTIFY_CLIENT` сохраняет поведение 004.

**Stripe в БД не требует НИЧЕГО нового:** `PaymentAllocationLink(provider="STRIPE", providerPaymentId=<cs_...|pi_...>, allocationKind)` — связка; статусы живут в FSM-полях `Order`/`SlotReservation`; аудит возвратов — `RefundOperation`.

---

## 3. Матрица Маппинга FSM (Stripe Event → Booking FSM 004)

Маппинг через `lib/kernel/bookingFsm.ts` (DB-значения; спек-уровень `CONFIRMED` = DB `BOOKED` — конвенция 004/antigravity F1):

| Событие Stripe (`event.type`) | Проверка в коде | Эффект (DB-термины) | Действие системы |
| :--- | :--- | :--- | :--- |
| `checkout.session.completed` | сумма/валюта = квоте (registry minor units); `orderId` из metadata валиден | reservation `PAYMENT_PENDING` → `BOOKED`; order → `PAID` | `PaymentAllocationLink` upsert, уведомления клиенту и мастеру (dispatcher 004), идемпотентно (InboxEvent) |
| `checkout.session.expired` | reservation в `PAYMENT_PENDING`/`HELD`, hold не заморожен (`holdFrozenAt` null) | → `RELEASED`; order → `PAYMENT_EXPIRED` | Слот освобождается sweeper'ом (существующий путь 004) |
| `payment_intent.payment_failed` | — | статусы не меняем | Ожидание ретрая клиента до истечения TTL сессии (30 мин); TG-напоминание |
| `charge.refunded` | найден `PaymentAllocationLink` по `pi_...` | order → `PAID_REQUIRES_RESOLUTION` → `CANCELLED`; `RefundOperation` (kind STRIPE, actor `stripe_dashboard`) | Слот освобождается, audit, уведомления обеим сторонам |

Гонки закрывает существующий паттерн: транзакция в `acquireResourceSlotLock` + GiST; дедуп — `InboxEvent.dedupeKey = stripe_<event.id>` до любых записей (как NOWPayments в 004).

**Долговечность дедупа (retention-контракт).** `InboxEvent` никогда не удаляется: nightlyPurge только скрабит `payloadJson` терминальных (SENT/FAILED) строк старше 7 дней — `deleteMany` по inboxEvent в кодовой базе отсутствует (verified: `lib/jobs/inngest.ts` + grep). Уникальный `dedupeKey` живёт вечно, поэтому переотправка Stripe хоть через год дедупится. Второй барьер — корректность не зависит от дедупа: FSM-переходы условные (`updateMany({ where: { status: 'PAYMENT_PENDING' } })`), реплей `completed` по уже `BOOKED`-брони = no-op даже при гипотетической утере дедуп-строки. Правило на будущее (инвариант в guard-тест миграций): любое изменение ретеншена InboxEvent, вводящее удаление строк, обязано исключать webhook-дедуп-строки (`dedupeKey LIKE 'stripe_%' / 'nowpayments_%' / 'stars_%'`) — либо дедуп переезжает в отдельную вечную таблицу.

---

## 4. Требования к Компонентам (Acceptance Criteria)

### Story 1: Харднинг суверенной аутентификации (FR-501..504)
* **FR-501 Argon2id:** параметры 64 MB / 3 iter / 4 lanes. При каждом логине: если `Account.passwordAlgo != "argon2id"` — проверить по legacy scrypt, при успехе пере-хешировать в Argon2id и проставить маркер (zero-downtime миграция хешей, bootstrap-owner lineage сохраняется).
* **FR-502 Мгновенный массовый отзыв (Модель А — int-epoch, единственная):** `revokeAllStaffAccess(userId)`: `sessionEpoch += 1` + `session.deleteMany({ userId })`. При каждом логине в создаваемую сессию пишется снимок `epochCreated = user.sessionEpoch`; валидация в `resolveStaffSession` — строгое равенство `session.epochCreated === user.sessionEpoch`. Никаких timestamp-сравнений: `deleteMany` — основная защита, `epochCreated` — страховка от гонок (сессия, созданная между инкрементом и deleteMany, всё равно отвергается). Вызовы: деактивация сотрудника, понижение роли, компрометация.
* **FR-503 Anti-bruteforce per-IP (дополнение к per-account lockout 004):** `/api/auth/sign-in` — sliding window через существующий `lib/security/rateLimit.ts`: 5 неудач / IP / 15 мин → 429 на 30 мин. Per-account lockout 004 (5 → 15 мин) остаётся; ограничения независимы.
* **FR-504 Break-glass ADMIN_TOKEN** не меняется (grace-ротация 003 сохраняется).
* **FR-504a Argon2id на слабых VPS (обязательный бенчмарк):** параметры по умолчанию 64 MB / 3 iter / 4 lanes конфигурируются через env (`ARGON2_M_KIB`, `ARGON2_T`, `ARGON2_P`) с захардкоженным полом OWASP (>=19 MiB, >=2 iter). Верификации Argon2 сериализуются (мьютекс, <=1 параллельно на процесс) — пик памяти = 1x cost, а не N логинов x 64 MB. Acceptance: микро-бенчмарк на целевом CPX-классе (<=500 MB RSS при 5 последовательных логинах + живой TG-поллер; замер process.memoryUsage().rss до/после) фиксируется в evidence-файле ДО merged.
* **FR-505 Auth-обсервабилити (audit-events, PII-redacted через `emitAuditEvent` 004):** обязательные события — `STAFF_LOGIN_SUCCESS`, `STAFF_LOGIN_FAILED` (уже эмитятся в 004 — расширить), `STAFF_ACCOUNT_LOCKED` (per-account), `STAFF_IP_RATE_LIMITED` (per-IP), `STAFF_SESSIONS_REVOKED` (epoch-отзыв, cause: deactivated | role_change | compromise). Через deny-list logger: ноль паролей/токенов; IP — только маскированный /24.
* **Тесты:** пере-хеш scrypt→argon2id на живом логине; epoch-отзыв режет живую сессию; per-IP лимит не блокирует другого IP; lockout'ы не конфликтуют; каждое событие FR-505 эмитится ровно один раз с корректной cause.

### Story 2: Stripe-адаптер за контрактом 004 (FR-510..516)
* **FR-510 Адаптер `lib/payments/stripe.ts implements PaymentProvider`:** `id: "STRIPE"`, capabilities `{ fiat: true, crypto: false, refunds: "manual" }`; саморегистрация `registerPaymentProviderFactory("STRIPE", ...)`.
* **FR-511 `createInvoice`** → Stripe Checkout Session (`mode: "payment"`, TTL 30 мин, `line_items` из registry minor units — никакого ×100; `metadata: { orderId }`; success/cancel URL на инстанс). `payment_method_types` **не передаётся** — Hosted Checkout сам показывает методы, включённые в Stripe-аккаунте (dashboard-driven). Это осознанное решение, а не «только физические карты»: кошельки (Apple Pay / Google Pay) появляются автоматически после регистрации домена инстанса в Dashboard (payment domains); прочие методы (Link, iDEAL и т.п.) — исключительно конфигом аккаунта, без правок кода. Требование к деплою: домен инстанса зарегистрирован в Stripe. Возвращает `paymentUrl` = session.url (провайдерский, не рукодельный — канон 004).
* **FR-512 `verifyCallback`** — `stripe-signature` (HMAC-SHA256, timing-safe, `STRIPE_WEBHOOK_SECRET`); тело строго из `req.text()`.
* **FR-513 `parseCallback`** → нейтральный `CallbackStatus`: `completed→finished`, `expired→expired`, `payment_failed→failed`, `charge.refunded→finished` (с признаком refund в payload-обёртке). Суммы — в registry minor units.
* **FR-514 Вебхук `POST /api/payments/stripe/webhook`:** дедуп первым шагом (`InboxEvent` insert ON CONFLICT — ноль эффектов при реплее ×100), затем FSM-таблица §3. Invalid signature → 401 + security-лог, zero processing.
* **FR-515 Возвраты — вручную в Stripe Dashboard** (Q4 ревизии 1 сохраняется): вебхук ловит `charge.refunded`, пишет `RefundOperation(kind: STRIPE, actor: "stripe_dashboard")`, переводит по §3.
* **FR-516 Выбор провайдера:** `PAYMENT_PROVIDERS` может включать `STRIPE` (инстанс сам решает, включён ли фиат). Zero-provider/флаговые семантики 004 (`FEATURE_FLAG_PAYMENT_PROVIDER_CUTOVER`, killswitch) не меняются. Тесты — по контракту `payment-provider.md` 004 (тот же stubbed-gateway матрикс + fiat-специфика: 3DS-редирект не нужен для Hosted Checkout).
* **Тесты:** адаптер в полной матрице `payment-gateway-contract.test.ts`-паттерне; **replay-тест в форме конкурентного залпа** `await Promise.all(Array.from({ length: 100 }, () => handler(rawBody, sig)))` против stateful-мока БД — ровно один `PaymentAllocationLink`/переход, 99 ответов `deduplicated: true`; JPY (0)/KWD (3) в чекауте.

### Story 3: Долг D1 — миграция zod@4 (FR-520..522)
* **FR-520:** zod → 4.x latest; `npm audit` → 0 High/Critical (снимает GHSA-mrhx; payload caps 004 остаются как defense-in-depth).
* **FR-521:** миграция breaking-изменений: `z.record` двухаргументный синтаксис, `error.flatten()` → `z.flattenError`, `.strict()`/`.passthrough()` → `z.strictObject`/`z.looseObject`, `coerce`-поведение — по фактическому списку в changelog zod 4; все точки: `lib/validation/*`, `app/api/**`, `config/shop.config.ts`, shared-схемы админки.
* **FR-522:** контрактная стабильность: все существующие 400-ответы API сохраняют форму (fieldErrors) — фиксируется снапшот-тестами по ключевым схемам (booking create, admin schemas, presign).
* **Тесты:** полный jest-сьют зелёный; снапшоты форм ошибок до/после идентичны.

### Story 4: Долг D2 — консолидация booking API (FR-530..531)
* **FR-530:** `/api/booking/lock` (легаси 003) поглощается `/api/booking`: один эндпоинт, один zod-контракт, одна service-точка входа. Расписание жёсткое: **релиз 005** — старый путь отдаёт 308 на новый + заголовки `Deprecation: true` и `Sunset: <деплой 005 + 90 дней>`; **ближайший релиз после Sunset, не позже 006** — 410 Gone. Никаких вечных 308.
* **FR-531:** дедупликация логики: одна реализация conflict-проверки (GiST/23P01→409), один источник буферов; тесты обоих путей до удаления.
* **Тесты:** контрактные тесты старого пути (redirect + preserved behavior) и нового.

### Story 5: Долги D3–D5 — polish-пакет (FR-540..542)
* **FR-540 (D3):** `ShopSettings.staffRejectNotifyMode` (enum, default `NOTIFY_CLIENT`) замещает env `STAFF_REJECT_NOTIFY_MODE`: чтение в staff-actions, UI-переключатель в `/admin/settings` (OPERATIONAL-секция, OPERATOR+), OWNER-гейт не нужен (не foundation). Миграция значений: env → колонка один раз при деплое (backfill-скрипт, idempotent).
* **FR-541 (D4):** uk-локаль как данные: `messages/uk.json` (ICU few/many), гейт `--locales ru,en,uk` зелёный, переключатель локали тройной там, где включена; контент-строки остаются авторскими (FR-414 lineage).
* **FR-542 (D5):** FE-форматирование сумм по registry-скейлу: утилита `formatMinor(amountMinor, currency)` на CurrencyMetadata.minorUnit (JPY 0, KWD 3, USD 2) в каталоге/чекауте/admin/бот-карточках — вместо assumptions о 2 decimals.
* **Тесты:** политика уведомлений (3 режима) на server-уровне; uk-гейт; formatMinor BVA (0/1/max minor units).

### Story 6: Долг D6 — приговор 14 orphan-моделям 003 (FR-550)
Schema-only модели (Offering…OperatorAction) без миграций = мина P2021 (миграция упадёт при первом `migrate dev`). Решение по умолчанию (Via Negativa): **вычистить из `schema.prisma`** до момента планирования соответствующего пака (они вернутся из спеки 003 вместе со своими миграциями git-историей). Альтернатива (консолидированная additive-миграция) — только если пак планируется следующим релизом. Фиксируется решением в retro-заметке + задача на вычистку с проверкой, что ничего не импортирует эти модели.
**Проверка безопасности вычистки (acceptance; предварительно снята 2026-10-25 — 0 совпадений):** `rg -n "\b(Offering|OfferingVariant|ServicePolicy|BundleComponent|InventoryBalance|InventoryMovement|OrderLine|PaymentPlan|PaymentMilestone|PaymentAllocation|FulfillmentPlan|FulfillmentSegment|CompletionEvidence|OperatorAction)\b" app lib scripts components` → 0 совпадений (word-boundary) + `npx prisma generate && npx tsc --noEmit` зелёный после регенерации клиента. Джоба-гейт повторяет rg в CI, чтобы новый код не начал импортировать модели, помеченные на удаление.

---

## 5. Зафиксированные Решения (Clarifications Matrix)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Архитектура сессий | As-built 004 (`User`/`Account`/`Session` + `StaffMember`), без новых таблиц; харднинг Argon2id + `sessionEpoch`-отзыв | Одна система идентичности; ревизия 1 создавала параллельную (двойной логин, двойной QA) |
| Q2: Регистрация | Публичная регистрация закрыта (без изменений): OWNER — `scripts/bootstrap-owner.ts`, OPERATOR — OWNER через админку (004) | Нулевой спам-риск |
| Q3: Мультивалютность | `ShopSettings.currency` + CurrencyMetadata registry (004); Stripe получает minor units как есть | Ядро не зависит от юрисдикции |
| Q4: Возвраты | Вручную в Stripe Dashboard; вебхук → `RefundOperation` + FSM §3 | Без диспут-API в этом релизе |
| Q5: Платёжный слой | Stripe = адаптер в реестре 004; дедуп InboxEvent; связка PaymentAllocationLink | FR-401/435 канон; ноль параллельных слоёв |
| Q6: PERFORMER-веб | RBAC-матрица 004 (ограниченный вход), табу ревизии 1 снято | 004 уже shipped + QA-покрыто; полный запрет = частичный откат 004 |
| Q7: zod | Миграция на 4.x в этом релизе, снапшоты форм ошибок обязательны | Закрывает последний audit-high |

---

## 6. Нефункциональные Требования

1. **Footprint & Memory:** ≤ **500 MB RSS** на инстанс (бизнес-план v18.x; ревизия 1 писала 250 MB — изменено). Redis в рантайме отсутствует.
2. **Окружение:** ключи Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — через валидированный env-объект; отсутствие ключей = STRIPE не включён в `PAYMENT_PROVIDERS` (zero-provider семантика 004 сохраняется).
3. **Аудит NPM:** после zod@4 — `npm audit` 0 High/Critical; лицензионный гейт `verify-licenses.mjs` PASS (MIT Stripe SDK).
4. **Миграции:** только Expand-фаза, additive, down.sql обязателен (канон 004).
5. **Argon2id memory gate:** пик RSS инстанса во время auth-нагрузки (5 логинов подряд + фоновые задачи) <= 500 MB — измеряется бенчмарком FR-504a, число фиксируется в evidence.

---

## 7. Acceptance (Independent Tests по сторям)

1. **Story 1:** логин владельца на проде без смены пароля (scrypt→argon2id прозрачно); увольнение OPERATOR режет его живую сессию ≤1 запрос; 6-я попытка с одного IP → 429.
2. **Story 2:** stubbed-Stripe полный цикл: book → Checkout Session URL → webhook completed → BOOKED + PaymentAllocationLink; replay ×100 → один эффект; refunded → CANCELLED + RefundOperation.
3. **Story 3:** `npm audit` чист; jest зелёный; снапшоты ошибок не изменились.
4. **Story 4:** старый URL книги → 308; новая книга через оба пути до Sunset идентична по эффектам.
5. **Story 5:** uk-лендинг открывается с гейтом PASS; reject-политика переключается в админке без рестарта; KWD-цена на витрине показывает 3 decimals.
6. **Story 6:** `npx prisma migrate dev` на чистой базе проходит без P2021.

---

## 8. РЕВИЗИЯ 2 — перечень замен ревизии 1 (2026-10-25)

> Ревизия 1 писалась до релиза 004. Ниже — осознанные замены; каждая — ветируема до старта `/speckit.plan`.

| Ревизия 1 | Ревизия 2 | Причина |
|---|---|---|
| Новые таблицы `StaffUser`/`StaffSession`, enum StaffRole {OWNER, OPERATOR} | Харднинг as-built `User`/`Account`/`Session`/`StaffMember` (3 роли) | 004 T017 shipped + QA; параллельная идентичность = двойной логин и двойная поверхность атаки |
| `passwordHash` Argon2id с нуля | Прозрачный пере-хеш scrypt→argon2id при следующем логине (`Account.passwordAlgo`) | Без reset-паролей у существующих владельцев |
| Кука `undr_staff_session`, `middleware.ts` | Существующая кука `session_token` (004) + тот же путь валидации | Один механизм |
| Anti-bruteforce 5/IP/15мин→30мин блок | То же, поверх per-account lockout 004 (обе защиты) | Эшелонированная защита |
| Новые `Payment`, `ProcessedExternalEvent`, enum PaymentProvider/PaymentStatus | Stripe-адаптер за контрактом 004; дедуп `InboxEvent`; связка `PaymentAllocationLink` | FR-401/435; data-model 004 §1.2 прямо называет InboxEvent дедуп-слоем |
| FSM-таблица на `Booking`/`PENDING_PAYMENT`/`CONFIRMED` | На `Order`+`SlotReservation` c DB-значениями `PAYMENT_PENDING`/`BOOKED` (конвенция CONFIRMED=BOOKED) | As-built схема |
| Табу «NO WEB ADMIN FOR PERFORMERS» | RBAC-матрица 004 (ограниченный вход PERFORMER) | 004 US9 shipped + QA-покрыто |
| ≤250 MB RAM | ≤500 MB RSS | Бизнес-план v18.x (500) — единый лимит инстанса |
| — | Stories 3–6: zod@4, lock-консолидация, polish-пакет (D3–D5), приговор orphan-моделям (D6) | Хвосты 004 close-out |

**Открытые veto-пункты** (зафиксированы решениями по умолчанию, м.б. изменены до plan-фазы): Q1 auth-подход, Q5 Stripe-архитектура, Q6 PERFORMER, состав хвостов §1.4, дефолт «вычистить orphan-модели» (FR-550).
