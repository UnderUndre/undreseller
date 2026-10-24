# Аудит фактического выполнения tasks.md спеки 003 (на 2026-10-24)

Метод: каждый таск, помеченный `[X]`, проверен тремя параллельными агентами против кода.
Вердикты: **DONE** (артефакт существует и делает заявленное), **PARTIAL** (артефакт есть, но
существенно расходится с заявкой), **MISSING** (артефакта нет вообще), **SCHEMA-ONLY** (модели в
schema.prisma без миграции и без потребляющего кода).

## Итог

**Из 66 тасков, помеченных `[X]`: 21 DONE (32%), 15 PARTIAL (23%), 29 MISSING (44%), 1 SCHEMA-ONLY.**
Весь слой 003.2-паков (31 таск: фазы 5, 6, 8–12, 15) — не реализован. Каталог `lib/packs/` не существует.

## Фаза 1–2: Setup + Foundation (T001–T012, T070)

| Task | Вердикт | Доказательство / расхождение |
|---|---|---|
| T001 | DONE | `config/shop.config.ts:66-67` (USD, currencyConfirmed: false) |
| T002 | PARTIAL | Реестр есть (`config/oss-reuse-registry.json`), но path-level записей 0; гейт не подключён к npm scripts/CI |
| T003 | PARTIAL | `scripts/verify-licenses.mjs` копилевый-чек реален (:36-40), но скана уязвимостей (npm audit/OSV) в файле НЕТ — только комментарий |
| T004 | DONE | `.env.example`, `docs/whitelabel-quickstart.md:42` |
| T005 | DONE | Все модели в schema: StaffMember:188, AuditEvent:205, CurrencyMetadata:220, Resource:228, AvailabilityException:238, ProfessionalProfile:252, ProfessionalService:269, PortfolioItem:279, WeeklyHours:360, credential-поля SlotReservation:391-394 |
| T006 | DONE | `config/currency-registry.ts:17-41` (USD=2, AMD=2, JPY=0, KWD=3, XTR), resolveServicePrice:96-123 |
| T007 | DONE | `app/api/admin/settings/route.ts:135` PUT |
| T008 | PARTIAL | Файлы есть, НО `better-auth` установлен и **не используется**: нет `better-auth/adapters/prisma` нигде; сессии самописные (`staffAuth.ts:104` читает cookie и ходит в prisma.session напрямую) |
| T009 | DONE | `lib/booking/lock.ts:38` normalizePhoneE164 |
| T010 | DONE | serviceService.ts + professionalProfileService.ts: режимы, цены, portfolio (createService:146, assertProfileOwnership:120) |
| T011 | DONE | backfill прогнан в этой сессии (см. лог 2026-10-23) |
| T012 | DONE | тест существовал, но был сломан синтаксически (чинился 2026-10-23, коммит 26a86e0) |
| T013 | DONE | schema:266, :291 индексы; тест есть |
| T070 | DONE | ServiceFulfillmentMode:117, поля Item/ShopSettings/SlotReservation — всё в схеме и миграции |

## Фаза 3: Публичные страницы (T013–T017) — DONE полностью

## Фаза 4: Бронирование (T018–T021)

| Task | Вердикт | Доказательство / расхождение |
|---|---|---|
| T018 | PARTIAL | `windows.ts:69` computeAvailableSlots учитывает WeeklyHours/AvailabilityException/HELD/буферы (:104-165). НО: `timeZone` проброшен и **игнорируется** — вся математика в Date.UTC (:122,178-183) → таймзонный баг латентен; bookingService.ts:11 использует только calculateEffectiveBuffers, не computeAvailableSlots |
| T019 | DONE | GiST `slot_resource_no_overlap` реален (миграция 20261019020000:55-58); lock (:164), 409, снапшоты (:238-252) |
| T020 | PARTIAL | Слоты/отмена/токен 32B SHA-256 — реальны. **Адрес OUT_CALL ТРЕБУЕТСЯ сервером в кернеле** (`bookingService.ts:112-117` — корректирует P0 из research.md, там он завышен). НЕТ: rate limiting на create/cancel; idempotencyKey принимается и не используется |
| T021 | DONE | app/book/page.tsx:41-45, SlotGrid.tsx:65-67,197,286-287 (цены, fee, статус, POST-токен) |

## Фаза 5–6, 8–12, 15: Паки 003.2 (T022–T029, T035–T052, T063–T067) — **31 таск, 0 сделано**

| Task | Вердикт | Доказательство |
|---|---|---|
| T022–T026 (US3 fulfillment) | MISSING | lib/kernel/fulfillmentPlanService.ts нет; checkout/route.ts не знает OrderLine/FulfillmentPlan; app/api/admin/fulfillment/ нет; теста нет |
| T027–T029 (US4 payment plans) | MISSING | lib/kernel/paymentPlanService.ts нет; PaymentAllocation в lib/payments/ — 0 совпадений; теста нет. (T027/T028 — второй доказанный случай вранья [X]) |
| T035–T038 (US6 quotes) | MISSING | Quote/QuoteLine в схеме НЕТ (не только миграции) |
| T039–T042 (US7 journey) | MISSING | Party/Journey и пр. в схеме НЕТ; OperatorAction — SCHEMA-ONLY (schema:880, без миграции); lib/packs/ нет |
| T043–T045 (US8 documents) | MISSING | Ничего нет |
| T046–T048 (US9 compliance) | MISSING | Ничего нет |
| T049–T052 (US10 ops/import) | MISSING | Ничего нет |
| T063 (US1 schema) | SCHEMA-ONLY | 13 моделей в schema.prisma (Offering:672 … CompletionEvidence:865), миграции 20261022050000 НЕТ, потребляющего кода 0 |
| T064 (inventoryService) | MISSING | lib/packs/ не существует |
| T065 | PARTIAL | Файлы существуют, но это превичный код эпохи спеки 002 (коммиты 4debf93/32b39b2), работает с legacy Item, 0 от InventoryBalance/Offering |
| T066 | PARTIAL | ItemCard/CartDrawer старые, 0 pack-логики |
| T067 | MISSING | Теста нет |

**Латентная мина:** 14 моделей в schema.prisma без миграций (13 из T063 + OperatorAction). Любой
будущий код, дёрнувший их, падает P2021; `prisma migrate dev` увидит drift.

## Фаза 7: Персонал (T030–T034)

T030 DONE, T031 PARTIAL (auth-route самописный, не mount Better Auth), T032 DONE, T033 PARTIAL
(AuditEvent-пишись в staffAuth.ts:60-64, а не в staffRbac.ts; функционально есть), T034 DONE.

## Фаза 14: Production readiness (T057–T062, T068–T069) — самый провальный слой

| Task | Вердикт | Доказательство / расхождение |
|---|---|---|
| T057 | MISSING (по заявленному) | `tests/e2e/commerce-flow.spec.ts` существует, но 58 строк про /api/catalog и локи корзины; 0 покрытия флоу бронирования, режимов, адресов, отмены |
| T058 | PARTIAL | p99 нет, «100-way conflict» нет (просто 100 итераций), ссылки на NFR-001/003 вместо NFR-301/302, файл не компилируется |
| T059 | PARTIAL (STUB) | DR-скрипт **фейкает результаты**: restore не выполняется («Simulating isolated restore»), fallback ELAPSED=12, PASS печатается безусловно (:33-46). docker/bench-memory.sh существует, но реального RPO/RTO-эвиденса не производит |
| T060 | PARTIAL | nightlyPurge есть (`lib/jobs/inngest.ts:241`), но **не чистит SlotReservation.serviceAddressSnapshot** (чистит Order customer fields); purge-эндпоинты существуют |
| T061 | PARTIAL | specs/main обновлены 2026-10-22, но in-call/out-call — 0 совпадений во всех трёх файлах |
| T062 | FAILS-NOW | tsc падает (3 ошибки), jest: 2 красные сюиты + 2 некомпилируемых файла (доказано на чистом HEAD) |
| T068 | PARTIAL | Лог-редакция сильная, НО `AuditEvent.reason` пишется в БД без редакции (staffAuth.ts:49-77, только slice 500) — противоречит INV-010; OpenTelemetry отсутствует (0 зависимостей) |
| T069 | DONE (тонко) | Запись гейта есть (quickstart.md:185-188), но без метрик — голое утверждение |

## Перекрёстные выводы

1. **Паттерн «врущий чеклист» системный**: 29+ тасков помечены [X] без единого артефакта. /speckit.review
   и внешние ревью (Principle VI) это пропустили — процессный сбой, разбирать на ретроспективе.
2. **Better Auth — фикция**: зависимость стоит, библиотека не импортируется; сессии самописные.
   Для релиза это либо честный рефактор на Better Auth API, либо ревизия спеки.
3. **Таймзона бронирования инертна** — T018 формально сделан, но UTC-математика при не-UTC инстансе
   даст сдвиг слотов. Для рынка вне РФ (решение по 004) — реальный баг.
4. **PII-протечка**: AuditEvent.reason без редакции + serviceAddressSnapshot вне nightlyPurge —
   оба противоречат заявленной в T060/T068 верификации.
5. **Для research.md 004**: пункт S3-P0-1 (адрес при выезде) снимается почти полностью — сервер
   требует адрес в кернеле (bookingService.ts:112-117); остаётся zod-refine для чистого 400.
