# Research: 001-reinit-from-payload-ecommerce-template

> Plan Phase 0 — Engineering Decisions. Format: Decision / Rationale / Alternatives / Spike Governance.

Контекст: спека rev 1.2 (audit PASS; R1/R2 + external review antigravity F1–F7 интегрированы — метки F1–F7 в решениях ниже). Все решения — переиспользование proven-дизайнов легаси (Annex A) на Payload-рельсах; новая архитектуры нет.

## D1. Roles: set-семантика hasMany + max-иерархия

- **Decision**: `Users.roles` остаётся `hasMany` select (шаблонное поведение), options → `['OWNER','OPERATOR','PERFORMER','customer']`. Новый `src/access/roles.ts`: `ROLE_RANK = { OWNER: 3, OPERATOR: 2, PERFORMER: 1, customer: 0 }`, `hasMinimumRole(roles, min) = max(rank(r) for r in roles) >= min`. `admin`-роль удаляется из options; существующим строкам `admin` маппинг → `OWNER` (миграция данных не нужна: репо на пустой БД; для dev-БД — doc-заметка). Хук `ensureFirstUserIsAdmin` → назначает `['OWNER']`. **Тотальный sweep роли `admin` (F1, F7)**: замена охватывает весь репозиторий — `src/access/*`, `src/components/AdminBar/index.tsx` (`hasMinimumRole(user?.roles, 'OWNER')`), `src/app/(app)/next/seed/route.ts` (`hasMinimumRole(user?.roles, 'OWNER')`), `tests/e2e/frontend.e2e.spec.ts:394` (`data.roles = ['OWNER']`), и `tests/helpers/seedUser.ts` (`roles: ['OWNER']` с `overrideAccess: true`).
- **Rationale**: hasMany — шаблонное поле, меньше churn; set-семантика покрывает «мастер с админкой» без дублей; max-иерархия — канон легаси `staffRbac.ts`. Исключение остаточных строковых ссылок на `'admin'` предотвращает падения E2E-тестов и скрытие админ-панели на витрине.
- **Alternatives**: single-select роль (ломает шаблонные query-паттерны и `roles.hasMany` access-хелперы); отдельная `admin`+OWNER (план §2.1: «ровно 3 роли» — дубль плодит матрицу).
- **Spike Governance**: не требуется.

## D2. FSM-port: verbatim pure-модуль + FSM↔DB маппинг

- **Decision**: `src/lib/kernel/bookingFsm.ts` — механический порт легаси `lib/kernel/bookingFsm.ts` (pure: без IO/ORM/clock, `now` инжектится): 6 FSM-состояний (AVAILABLE/HELD/PAYMENT_PENDING/UNDERPAID/PENDING_APPROVAL/CONFIRMED), two-track (FREE/PREPAID), hold TTL 15m, confirming-freeze + 24h ceiling, late-payment resolution. Маппинг на DB-статусы (канон легаси): `CONFIRMED↔BOOKED`, `AVAILABLE↔RELEASED`; enum коллекции SlotReservations = DB-набор легаси (`HELD, BOOKED, RELEASED, PAYMENT_PENDING, UNDERPAID, PENDING_APPROVAL, CANCELLED, STAFF_REJECTED`). В админ-интерфейсе статус помечается `admin: { readOnly: true }` — ручная смена запрещена (F4).
- **Rationale**: pure-модуль тестируется без БД — легаси-сьюты (`booking-fsm`, `confirming-freeze`) переносятся с точностью до импортов; это дешёвый замок семантики до 002. Защита от ручной смены в UI защищает инварианты FSM от случайного обхода админом.
- **Alternatives**: переписать FSM под Payload-статусы orders/transactions (теряется two-track семантика легаси — отвергнуто); отложить FSM на 002 (скелет без замка семантики — риск дрейфа в 002).
- **Spike Governance**: не требуется.

## D3. SlotReservations: Payload-коллекция, без raw SQL в 001

- **Decision**: `src/collections/SlotReservations.ts` — fields: order (rel Orders, nullable до 002), resource/item refs (text, nullable — ресурсная модель 002+), `startTime`/`endTime` (date, required), `totalDurationMin` (number), `status` (select = DB-набор D2, default HELD, `admin: { readOnly: true }` — F4), `scheduleVersion` (number, default 1), `holdExpiresAt`/`holdFrozenAt` (date, nullable), `bufferBeforeMin`/`bufferAfterMin` (number, default 0). **Коллекционный access control — fail-closed (F3)**: `access: { read: adminOnly, create: adminOnly, update: adminOnly, delete: adminOnly }` (только `OWNER` в 001). Регистрация в `payload.config.ts`; типы через `payload generate:types`. GiST EXCLUDE + advisory locks — **002** (Payload custom migration, raw SQL, канон легаси).
- **Rationale**: скелет должен дать admin-вид и типы, но не тащить hand-written DDL мимо Payload-пайплайна; закрытый access предотвращает неавторизованные мутации через REST/GraphQL до появления публичного API в 002; двойная броня от double-booking — домен 002, где будет и FSM-проводка.
- **Alternatives**: Prisma-стиль миграции рядом с Payload (два источника истины схемы — хуйня, отвергнуто); отложить коллекцию на 002 (US5 нарушен).
- **Spike Governance**: не требуется.

## D4. Тест-изоляция: отдельная тест-БД через test.env в Phase 1 + vitest sequential

- **Decision**: `test.env` получает `DATABASE_URL=postgresql://…/undreseller_test`; `vitest.setup.ts` грузит `test.env` c приоритетом над `.env` (dotenv-override: уже загруженные ключи `.env` перезаписываются). **Секвенсинг (F2)**: переключение на тест-БД реализуется в **Phase 1 (T015)**, ДО добавления новых тестов Phase 2. `vitest.config.mts` настраивается с `test.fileParallelism: false` (F5), чтобы исключить параллельные DDL-гонки воркеров на `pushDevSchema` в Postgres. Bootstrap: `createdb undreseller_test` (doc-шаг в test.env-комментарии + evidence). e2e playwright остаётся на dev-БД `:3000` (шаблонное поведение не меняем).
- **Rationale**: шаблонный smoke ходит в живую `DATABASE_URL` — мутация dev-данных на каждом прогоне; отдельная БД в Phase 1 гарантирует чистоту всех коммитов Phase 2; выключение параллелизма файлов в vitest устраняет `tuple concurrently updated` при миграциях.
- **Alternatives**: testcontainers (новый dep — NFR-101, отвергнуто); schema-per-run в одной БД (Payload push плохо дружит с поиском по search_path — хрупко).
- **Spike Governance**: не требуется.

## D5. Payments extension point: pure-инварианты + doc, адаптер не трогаем

- **Decision**: `src/lib/payments/invariants.ts` — pure: `assertValidInvoiceAmount(minor)` (positive integer) + `assertProviderAmountMatch({provider, amountMinor, currency, order})` с provider-aware парами: `TELEGRAM_STARS` → `amountMinor === max(1, round(totalMinor/2)) && currency === 'XTR'`; фиат → `amountMinor === totalMinor && currency.toUpperCase() === order.currency.toUpperCase()`; mismatch → `AMOUNT_MISMATCH`-верdict (без IO — вернёт флаг, не пишет в БД). **Полиморфная совместимость со схемой (F6)**: хелпер поддерживает как `order.totalMinor`, так и Payload `order.amount`. JSDoc-блок на шаблонном `PaymentAdapter` интерфейсе: поверхность для Stars/NOWPayments (004+). Checkout Stripe не модифицируется.
- **Rationale**: семантика money-path легаси (007 F1–F6 fixes) — самая дорогая находка линии; зафиксировать её pure-тестами сейчас = 004 стартует с замком, а не с нуля; поддержка `Order.amount` снимает расхождения между легаси и Payload-типами.
- **Alternatives**: подождать 004 (инварианты переоткрываются); портировать fulfillment-движок (IO+ORM — вне скелета).
- **Spike Governance**: не требуется.

## D6. Governance restore: копия легаси + гейт-адаптация

- **Decision**: `.specify/memory/constitution.md` — копия легаси v1.9.0 с заменами в §Quality gates: `npm run validate && npm test && npm run build` → `pnpm validate && pnpm test:int && pnpm build`; `npm audit` → `pnpm audit`; упоминания jest → vitest. `snapshot-stage.{sh,ps1}` — verbatim-копия (стадийный список уже содержит нужное). `.claude/commands/speckit.*` — subset: specify, clarify, requirements-audit, plan, tasks, test-design, analyze, review, implement, qa-signoff, status, diff (без narrative/sales-команд — GTM-контур живёт в UndeRoute). `CLAUDE.md` — минимальный указатель на конституцию и пайплайн.
- **Rationale**: гейты VI/XII NON-NEGOTIABLE — без них линия 002+ летит вслуп; адаптация минимальна (инструментальные имена, не принципы).
- **Alternatives**: писать конституцию с нуля под Payload (потеря 8 итераций легаси-норм); тянуть helpers-транскомпиляцию (.gemini/.github) — вне скоупа реinit, отложено.
- **Spike Governance**: не требуется.

## D7. Admin-UI доступ = OWNER-only

- **Decision**: Payload `admin.access` на корне → `isAdmin` заменяется на `hasMinimumRole(roles, 'OWNER')`. OPERATOR/PERFORMER не имеют доступа к `/admin` в 001; их app-поверхности (брони, боты) — 002+. Поле `roles` — adminOnly (edit) и OWNER-only (edit) после US4.
- **Rationale**: rev 1.1 (audit R1);Payload-админка — полные CRUD над всеми коллекциями, отдавать её операторам в 001 = несужаемая поверхность; легаси-канон RBAC требует app-level матриц, которые появятся вместе с доменными API.
- **Alternatives**: пустить OPERATOR в админку с field-level ограничениями (матрица полей на все коллекции — работа 002 без выгоды 001).
- **Spike Governance**: не требуется.

## Сводка spike-governance

**0 спайков**: все решения — ре-реализация proven-дизайнов легаси или настройка шаблона. Constitution XI соблюдён.
