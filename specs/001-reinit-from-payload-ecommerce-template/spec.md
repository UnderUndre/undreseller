# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `001-reinit-from-payload-ecommerce-template`
**Репозиторий:** `UnderUndre/undreseller` (реинициализация; легаси-линия 001–007 сохранена в `repos/undreseller-legacy`)
**Статус:** **IMPLEMENTED — REVISION 1.3 (2026-11-07; fix-review remediation: FSM status field-access airtight, PAYLOAD_SECRET fail-throw, timing-safe PREVIEW_SECRET, deployment bootstrap runbook — code-zcode F-01/F-03 + security-zcode SEC-2/SEC-3/SEC-6; F-02/F-04 (setup-token bootstrap) → backlog 002)**
**Source of truth по бизнесу:** `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v2.5.0** (Payload Rebaseline, 06.11.2026 — §2.5 синхронизирован с этим фундаментом; история дельты — §1.4)
**Базовый фундамент:** официальный [Payload Ecommerce Template](https://github.com/payloadcms/payload/blob/3.x/templates/ecommerce) (payload 3.93.0, Next 16.3.3, React 19, Postgres 16, Stripe)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Легаси-линия undreseller (спеки 001–007: кастомный Next 15 + Prisma monolith, 58 сьютов / 436 тестов) построила полный сервисный домен (booking FSM, staff-бот, 3 платёжных провайдера, RBAC, GDPR-гигиена), но несёт постоянную стоимость владения кастомной админкой, кастомным auth-стеком и Prisma-миграционным хвостом. Решено перебазироваться на официальный Payload Ecommerce Template: из коробки — CMS-админка, Products с вариантами и инвентарём, гостевые корзины, Orders/Transactions, Stripe PaymentIntent checkout с settlement-валидацией и атомарным декрементом инвентаря, live preview, SEO, form builder, vitest + playwright.

### 1.2. Решение

**Реинициализация фундамента**: рабочий репозиторий `undreseller` перебазирован на Payload-шаблон (уже свалено в working tree владельцем), легаси-репозиторий сохранён как эталон дизайна. Спека 001 поднимает и валидирует новый фундамент, восстанавливает SpecKit-говернанс, портирует **минимальный домен-скелет** (роли staff + pure-FSM kernel + skeleton-коллекция брони + платёжный extension point) и фиксирует карту переноса остального легаси в бэклог 002+.

Скоуп-развилка «фундамент+скелет» vs «полный паритет домена» vs «чистый фундамент»: принят дефолт **«фундамент + скелет»** (WRAP-атомарность; каждая доменная фича — отдельная спека со своим гейтом). Дефолт ветируем до `/speckit.plan`.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO STAFF TELEGRAM BOT:** боты (staff pager, client confirmation, magic reschedule) — спека 003+, не 001.
* ❌ **NO SECOND PAYMENT ADAPTER:** Telegram Stars / NOWPayments адаптеры — 004+; в 001 только extension point + Stripe (из коробки).
* ❌ **NO GOOGLE CALENDAR SYNC / WAITLIST / AI-RAG:** 005+.
* ❌ **NO LEGACY COPY-PASTE:** перенос = пере-реализация дизайна на Payload-рельсах; Prisma-обвязка, кастомная админка `app/admin/*`, старый auth-стек и миграции легаси — dead weight, не переносятся.
* ❌ **NO `undreseller-legacy` DELETION:** репозиторий — reference-архив и источник тест-дизайна.
* ❌ **NO SILENT BUSINESS-PLAN EDIT:** дельта §1.4 фиксируется в этой спеке; правка плана v2.5.0 — отдельное действие владельца.

### 1.4. Дельта бизнес-плана (Constitution VII-B.4 — фиксируется явно, не молча)

Бизнес-план v2.4.0 §2.5 фиксирует технологические инварианты легаси-стека. Payload-пивот меняет их:

| Инвариант плана v2.4.0 | Новый фундамент | Статус |
| :--- | :--- | :--- |
| Next.js 15 App Router | Next.js 16.3.3 (App Router) | ⚠️ дельта |
| Prisma ORM | Payload ORM (@payloadcms/db-postgres / Drizzle-adapter) | ⚠️ дельта |
| Zod 4 валидация | Payload-валидация полей (+ Zod остаётся для API-слоя) | ⚠️ дельта |
| Argon2id хеширование паролей | Payload auth (scrypt-подобный core) | ⚠️ дельта |
| Провайдер-нейтральные платежи (Stripe+Stars+NOWPayments) | Stripe-only из коробки + pluggable PaymentAdapter | ⚠️ дельта (нейтральность — через контракт адаптеров, 004+) |
| Docker Memory Fencing ≤500 MB RAM | compose содержит только Postgres; лимиты app-сервиса не заданы | ⚠️ дельта (восстановить) |
| GiST EXCLUDE + advisory locks (double-booking) | отсутствуют в шаблоне | ⚠️ дельта (002+, дизайн переносим — PG-уровень) |
| 3 роли OWNER/OPERATOR/PERFORMER | шаблон: только `admin`/`customer` | ⚠️ дельта (закрывается US4 в 001) |

**Действие**: ~~после утверждения спеки — бизнес-план v2.5.0 «Payload Rebaseline»~~ ✅ **ВЫПОЛНЕНО 2026-11-06**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` обновлён до **v2.5.0** (§2.5 инварианты переписаны под Payload-стек, changelog, примечания к §3/§4; ICP/лестница без изменений). Гейт SC-007 снят.

---

## 2. User Stories (Prioritized)

### US1 — Базовая линия шаблона зелёная (P0 — foundation)

Шаблон собирается, тестируется и запускается как есть: build, типы, lint, integration/e2e-тесты зелёные на Postgres 16 из docker-compose; первый админ-пользователь бутстрапится штатным хуком.

**Acceptance Scenarios**:
1. **Given** свежий клон с `pnpm install`, **When** `pnpm build`, **Then** сборка проходит без ошибок (Next 16.3.3 + Payload 3.93.0, `payload generate:types` синхронизирован).
2. **Given** поднятый Postgres из `docker-compose.yml`, **When** `pnpm test:int`, **Then** integration smoke зелёный; **When** `pnpm test:e2e` (chromium, Stripe test-keys + `stripe-webhooks` listener), **Then** checkout-сценарий (вариант → корзина → гостевой email → PaymentIntent → confirm-order → order created, инвентарь декрементирован) зелёный.
3. **Given** пустая БД, **When** первый вход в `/admin`, **Then** `ensureFirstUserIsAdmin` создаёт первичного владельца; повторный сценарий не создаёт второго.

### US2 — SpecKit-говернанс восстановлен (P0 — pipeline)

Контур SpecKit переносится из легаси и адаптируется под Payload-стек: конституция (с правкой quality gates: `pnpm build`/`pnpm lint`/vitest вместо jest), snapshot-stage скрипты (bash+pwsh), speckit-команды, as-built `specs/main/architecture.md` v2 (новая топография).

**Acceptance Scenarios**:
1. **Given** репозиторий после US2, **When** открываю `.specify/memory/constitution.md`, **Then** конституция присутствует с адаптированными гейтами (vitest/playwright, pnpm) и неизменными NON-NEGOTIABLE принципами (VI Cross-AI Review, VII Versioning, X Expand/Contract, XI Spike Governance, XII QA Contour).
2. **Given** коммит артефакта спеки, **When** запускаю `snapshot-stage.sh spec 001-...`, **Then** создаётся тег `spec/001-reinit-from-payload-ecommerce-template/v1` (idempotent guard работает).
3. **Given** `specs/main/architecture.md` v2, **Then** топография описывает Payload-коллекции, плагин ecommerce, access-композицию и точки расширения (адаптеры платежей, jobs, боты — как planned surfaces со ссылками на 002+).

### US3 — Карта переноса легаси (P1 — port map)

Единый документ `specs/001-.../legacy-port-map.md` классифицирует каждый домен легаси и привязывает его к будущей спеке-носителю.

**Acceptance Scenarios**:
1. **Given** легаси-аудит (см. Annex A), **When** читаю `legacy-port-map.md`, **Then** каждый домен (booking FSM, bots, payments, auth/RBAC, jobs, i18n, gcal, waitlist, AI-RAG, uploads, telemetry) имеет класс `portable-as-concept | portable-with-rewrite | obsolete`, целевую спеку 002+ и главный риск переноса.
2. **Then** dead weight (кастомная админка, старый auth, 003 phantom-модели, Prisma-миграции) явно помечен `obsolete — не переносится`.

### US4 — Staff-роли на Payload access control (P1 — domain skeleton)

`Users.roles` расширяется: `OWNER | OPERATOR | PERFORMER | customer` (`admin` как отдельная роль не вводится — семантика схлопывается в OWNER). Роли хранятся набором (hasMany) — access-решения вычисляются по max-иерархии набора. **Доступ к Payload-админке (`/admin`) — только OWNER**; OPERATOR/PERFORMER получают app-поверхности в 002+. Первый юзер = OWNER (хук модифицируется). Access-хелперы `src/access/` расширяются `hasMinimumRole`. **Тотальный sweep роли `admin` (F1)**: замена охватывает не только `src/access/*`, но и `src/components/AdminBar/index.tsx` (`hasMinimumRole(user?.roles, 'OWNER')`), `src/app/(app)/next/seed/route.ts` (`hasMinimumRole(user?.roles, 'OWNER')`), `tests/e2e/frontend.e2e.spec.ts:394` (`data.roles = ['OWNER']`) и `tests/helpers/seedUser.ts` (явная передача `roles: ['OWNER']` с `overrideAccess: true`).

**Acceptance Scenarios**:
1. **Given** юзер с ролью `PERFORMER`, **When** попытка доступа к admin-only коллекции, **Then** отказ (403/`false` в access-функции); **Given** `OWNER`, **Then** полный доступ к админке.
2. **Given** роль `OPERATOR`, **When** работа с бронями/каталогом по матрице US5, **Then** доступ разрешён только к разрешённым операциям.
3. **Given** поле с `adminOnlyFieldAccess`, **When** читает `customer`, **Then** поле скрыто (регрессия шаблонного поведения = 0).

### US5 — Booking domain skeleton (P1 — domain skeleton)

**5a. Pure FSM kernel**: `lib/kernel/bookingFsm.ts` из легаси переносится как pure-модуль (без IO/ORM/clock, `now` инжектится) в `src/lib/kernel/bookingFsm.ts` с сохранением семантики: 6 состояний, two-track (FREE/PREPAID), hold TTL 15m, confirming-freeze + 24h ceiling, late-payment resolution (slot free → re-confirm; re-booked → `PAID_REQUIRES_RESOLUTION`+refund-флаг).

**5b. Skeleton-коллекция брони**: `SlotReservations` (Payload collection): order-link, resourceId/itemId, `startTime`/`endTime` (timestamptz), `status` (FSM-маппинг, default HELD, **admin: { readOnly: true }** — прямая смена в админке запрещена для защиты целостности FSM, переход только через доменный сервис в 002+; F4), `scheduleVersion`, `holdExpiresAt`/`holdFrozenAt`, buffers. **Коллекционный access control — fail-closed (F3)**: `read/create/update/delete: adminOnly` (только `OWNER` в 001, без открытых неавторизованных REST/GraphQL эндпоинтов). Без GiST/advisory — они фиксируются как задача 002 (дизайн легаси переносим на PG-уровне вне зависимости от ORM).

**5c. Контрактный тест-фундамент**: FSM-сьют легаси (`booking-fsm`, `confirming-freeze`) адаптируется в vitest-сьюты нового репо.

**Acceptance Scenarios**:
1. **Given** порт FSM, **When** гоняю адаптированные сьюты (`pnpm test:int`), **Then** все FSM-сценарии легаси (двухтрековый переход, freeze, ceiling, late payment) зелёные без правок семантики.
2. **Given** `SlotReservations`-коллекция, **When** создаю черновик брони в админке, **Then** валидация полей (даты, status enum, scheduleVersion ≥1) работает; API-типы регенерируются `payload generate:types` без ручных правок; поле `status` защищено от ручной перезаписи в админке; неавторизованный гость не имеет доступа к `/api/slot-reservations`.

### US6 — Платёжный extension point (P2 — money-path prep)

PaymentAdapter-интерфейс шаблона (`initiatePayment/confirmOrder/endpoints`) документируется как точка расширения провайдеров 004+; портируется minor-units инвариант (`assertValidInvoiceAmount` + provider-aware сверка сумм из легаси `fulfillment.ts` как design reference) в `src/lib/payments/invariants.ts` (pure, с тестами, с поддержкой Payload `Order.amount` наряду с `totalMinor` — F6). Checkout Stripe не модифицируется.

**Acceptance Scenarios**:
1. **Given** `src/lib/payments/invariants.ts`, **When** проверяю amount ≤0 / не-integer, **Then** бросает; **Given** Stars-пара (XTR, round(total/2)) и фиат-пара (totalMinor/amount, currency), **Then** provider-aware проверки совпадают с легаси-семантикой.
2. **Given** шаблонный Stripe checkout, **Then** 0 поведенческих изменений (e2e US1 остаётся зелёным).

### US7 — Регрессионный контур 001 (P2 — QA baseline)

vitest-базовая линия расширяется с 1 smoke-сьюта: FSM-сьюты (US5), access-matrix-сьют (US4), invariants-сьют (US6), error-shape snapshot-сьют (новый, минимальный). Int-тесты получают изоляцию от dev-БД (отдельная `test.env` DATABASE_URL / schema-per-run) **в Phase 1 (T015)** (F2), до написания тестов Phase 2. `vitest.config.mts` настраивается с `fileParallelism: false` (F5) во избежание DDL-гонок при `pushDevSchema`.

**Acceptance Scenarios**:
1. **Given** `pnpm test:int`, **Then** ≥4 сьюта зелёные на выделенной тест-БД; живая dev-БД не затрагивается (пруф: подключение к `DATABASE_URL` из `.env` не открывается — env-изоляция в `vitest.setup.ts`).
2. **Given** `pnpm lint && pnpm build`, **Then** 0 ошибок (tsc/eslint clean).

---

## 3. Edge Cases

- **Первый юзер = OWNER**: `ensureFirstUserIsAdmin` шаблона назначает роль `admin`; после US4 хук обязан назначать `OWNER` (иначе OWNER-роль недостижима) — тест-гейт.
- **Stripe webhook'и шаблона без хендлеров**: state движется клиентским `confirm-order` (poll-guard); закрытие браузера до confirm оставляет transaction `pending`. Документируется как известное поведение 001; докрутка webhook-хендлеров — 004 (вместе с provider-aware инвариантом на серверном пути).
- **Int-тесты против живой БД**: шаблонный smoke использует `DATABASE_URL` без изоляции — до US7 любой запуск тестов мутирует dev-данные.
- **pnpm workspace**: шаблон имеет `pnpm-workspace.yaml` + `--ignore-workspace` инсталл-сценарии; зависимости ставятся строго через `pnpm ii` — случайный `pnpm add` в workspace-корне ломает лок.
- **`payload generate:types` drift**: ручные правки `src/payload-types.ts` запрещены; drift ловится lint/CI-гейтом.
- **Next 16 vs план Next 15**: часть легаси-паттернов (route params Promise-only, instrumentation edge-bundling) уже известна — канон `Next.js 15.5 Constraints` переносится в конституцию с поправкой на 16.
- **BETA-статус шаблона**: payload 3.93.0 / plugin-ecommerce 3.93.0 пиннингуются; обновления минорных версий — отдельное решение (SemVer 0.x-дисциплина конституции не применима к app-репо, но pinned-политика фиксируется).

## 4. Requirements

### Functional Requirements

- **FR-101 (Baseline green)**: `pnpm build`, `pnpm lint`, `pnpm test:int`, `pnpm test:e2e` — зелёные на немодифицированном шаблоне; результат фиксируется в `specs/001-.../evidence/baseline.md` (сырой вывод).
- **FR-102 (Governance restore)**: `.specify/memory/constitution.md` (качество-гейты адаптированы: pnpm/vitest/playwright), `.specify/scripts/{bash,powershell}/snapshot-stage.{sh,ps1}`, `.claude/commands/speckit.*` (specify/clarify/plan/tasks/analyze/review/implement/qa-контур), `specs/main/{architecture,requirements}.md` v2.
- **FR-103 (Port map)**: `specs/001-.../legacy-port-map.md` — домен → класс переносимости → целевая спека → риск; dead weight помечен.
- **FR-104 (Roles)**: `Users.roles` = `OWNER | OPERATOR | PERFORMER | customer`; иерархия OWNER>OPERATOR>PERFORMER; access-хелперы; первый юзер → OWNER; поле `roles` редактируется только OWNER; тотальный sweep ссылок на admin (AdminBar, seed route, frontend.e2e, seedUser; F1, F7).
- **FR-105 (FSM kernel port)**: `src/lib/kernel/bookingFsm.ts` — pure, семантика 1:1 с легаси (`transitionBookingFsm`, evaluate-хелперы hold/freeze/ceiling); адаптированные сьюты зелёные.
- **FR-106 (SlotReservations skeleton)**: коллекция с полями §US5b; enum статусов синхронизирован с FSM-маппингом; status `readOnly: true` в админке (F4); fail-closed access control `adminOnly` (F3); `generate:types` чист.
- **FR-107 (Payments extension point)**: `src/lib/payments/invariants.ts` (minor units + provider-aware пары, совместимость с Payload `Order.amount` / `totalMinor`; F6); doc-блок на PaymentAdapter как поверхность 004+; Stripe-путь не тронут.
- **FR-108 (QA baseline)**: ≥4 int-сьютов, env-изоляция тест-БД в Phase 1 T015 (F2), `vitest.config.mts` с `fileParallelism: false` (F5), error-shape snapshot-сьют; `pnpm validate`-скрипт (tsc --noEmit) добавлен в package.json.

### Non-Functional Requirements

- **NFR-101 (No new deps)**: `package.json` dependencies/devDependencies не расширяются в 001 (шаблонный набор достаточен).
- **NFR-102 (Legacy reference intact)**: `undreseller-legacy` не модифицируется; ссылки из port-map — только read.
- **NFR-103 (Memory fencing documented)**: `docker-compose.yml` дополняется doc-блоком Memory Fencing (app-сервис ≤500 MB RAM, Postgres 4096/2048) + закомментированный шаблон app-сервиса; продукционный app-сервис с Dockerfile — спека 002+ (deploy). Инвариант бизнес-плана восстановлен документально.
- **NFR-104 (Pinned template versions)**: payload@3.93.0 / next@16.3.3 / plugin-ecommerce@3.93.0 — зафиксированы; policy обновления — через отдельную спеку.

## 5. Success Criteria

- **SC-001**: baseline зелёный целиком (build/lint/int/e2e) — evidence-файл с сырым выводом.
- **SC-002**: говернанс работает end-to-end: команда `/speckit.specify` доступна, snapshot-тег создаётся на коммите спеки.
- **SC-003**: `legacy-port-map.md` покрывает 100% доменов Annex A (11/11).
- **SC-004**: role-matrix тест зелёный (OWNER/OPERATOR/PERFORMER/customer × admin-only/customer-only/publish-доступ).
- **SC-005**: FSM-сьют легаси адаптирован и зелёный на `src/lib/kernel/bookingFsm.ts` без семантических правок.
- **SC-006**: int-тесты изолированы от dev-БД (греп-пруф конфига + прогон).
- **SC-007**: ~~дельта §1.4 вынесена владельцем в бизнес-план v2.5.0~~ ✅ **ЗАКРЫТО 2026-11-06** (план v2.5.0 записан, гейт снят).

## 6. Зафиксированные Решения (Clarifications)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Скоуп 001 | **Фундамент + скелет** (роли, FSM-kernel, SlotReservations skeleton, payments extension point) | WRAP-атомарность; доменные фичи 002+ со своими гейтами; дефолт ветируем до plan |
| Q2: Говернанс в 001 | **Восстановить из легаси с адаптацией** | Без гейтов VI/XII линия 002+ летит вслепую; перенос — копия артефактов, не кода |
| Q3: Бизнес-план дельта | **Фиксация в §1.4 + апдейт v2.5.0 владельцем до implement** | VII-B.4: конфликт → явное разрешение, не молчанка |
| Q4: `admin` vs `OWNER` | **Единая роль OWNER = admin-семантика** (роли: OWNER/OPERATOR/PERFORMER/customer) | План требует «ровно 3 роли»; дубль admin/OWNER плодит матрицу |
| Q5: FSM в 001 vs 002 | **Pure-kernel в 001** (без IO), полный booking-домен в 002 | Kernel pure → тест переносится без БД; это дешёвый замок семантики |

---

## Annex A. Легаси-аудит (сводка разведки undreseller-legacy, 2026-11-06)

**Crown jewels (порт как дизайн):**
1. Pure two-track booking FSM (`lib/kernel/bookingFsm.ts`): 6 состояний, hold TTL 15m, confirming-freeze + 24h ceiling, late-payment → `PAID_REQUIRES_RESOLUTION`+refund.
2. Provider-neutral payment contract (`lib/payments/providerContract.ts`): registry, zero-provider mode, PaymentEvent `@@unique(provider,providerRef)` идемпотентность, provider-aware amount invariant.
3. Durable Telegram outbox (30s leases, priority, 429 cooldown) + CAS staff actions (`scheduleVersion` guard) + magic-reschedule HMAC-токены.
4. Double-booking defense: GiST EXCLUDE + `pg_advisory_xact_lock` (PG-уровень, переносим вне ORM).
5. GDPR-пайплайн: deny-list логгер, salted-hash delivery log, nightly purge.

**Second tier (перенос с реврайтом):** Inngest job matrix (10 функций) + PG deadline sweeper; waitlist-правила; gcal push/sync + secretVault AES-256-GCM; i18n-гейты (ru/en, botStrings); AI FTS-RAG + escalation.

**Dead weight (не переносится):** кастомная админка `app/admin/*`, старый auth-стек (scrypt/lockout/admin-token — заменяется Payload auth), 003 phantom-модели (Offering/InventoryMovement/PaymentPlan/FulfillmentPlan), все Prisma-миграции.

**Regression-эталон:** 58 сьютов / ~434 теста легаси — источник тест-дизайна для 002+ (пересобираются как контрактные на Payload-рельсах).

## Annex B. Payload-шаблон: что даёт из коробки (сводка разведки, 2026-11-06)

- Collections: Products (+variants, inventory, priceInUSD, draft/soft-delete), Categories, Media, Pages; плагин ecommerce добавляет addresses, carts (гостевые + merge), orders, transactions, variants; `customers` remap на `users`.
- Checkout: Stripe PaymentIntent → `confirm-order` (settlement-валидация, атомарный декремент инвентаря, очистка корзины) → order по `accessToken` для гостей.
- Auth: JWT-cookie (14d), роли `admin|customer`, access-хелперы (`adminOnly`, `adminOrSelf`, ...), гостевой checkout.
- CMS: layout-блоки, heros, live preview, SEO plugin, form builder, on-demand revalidation.
- Инфра: Postgres 16 (compose), `@payloadcms/db-postgres`; vitest (1 smoke int) + playwright (admin + checkout e2e).
- Отсутствует (строится в 001/002+): jobs queue, i18n-локализация полей, staff-роли, слоты/бронь, боты, Stars/NOWPayments, waitlist, gcal, email-пайплайн (nodemailer закомментирован), webhook-хендлеры Stripe.

---

## 7. Fix-Review Remediation (2026-11-07 — IX drift policy, scope-neutral)

Находки `reviews/code-zcode.md` + `reviews/security-zcode.md` закрыты патчами в рамках 001 (канон `/speckit.fix-review`):

- **F-01/SEC-2**: `SlotReservations.status` — field-level `access: { create, update: () => false }` (airtight; 002+ domain service — через Local API `overrideAccess`).
- **F-03/SEC-3**: `PAYLOAD_SECRET` — fail-throw на буте вместо `|| ''`.
- **SEC-6 (частично)**: `/next/preview` — timing-safe сравнение `PREVIEW_SECRET` (buffer length-guard + `timingSafeEqual`, fail-closed при unset).
- **F-05 (частично)**: guard-комментарий в `test.env`.
- **F-02/F-04 (SEC-1)**: setup-token bootstrap + гонка первых регистраций → **backlog 002** (design-работа); компенсирующий контроль — runbook §4.1 в `specs/main/architecture.md`.
