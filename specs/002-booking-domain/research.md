# Research: 002-booking-domain

> Plan Phase 0 — Engineering Decisions (D1–D8). Всё — design-reimplementation канонов легаси на Payload-рельсах.

## D1. Планировщик: **Payload Jobs** (Inngest отвергнут)

- **Decision**: свипы и напоминания — на встроенном Payload Jobs: `schedule` (recurring: hold-sweep) + `waitUntil` (отложенные: reminder на дату) — [payloadcms.com/docs/jobs-queue](https://payloadcms.com/docs/jobs-queue/overview). `autoRun` в config.
- **Rationale**: 0 новых deps (NFR-203); DB-backed — выживает рестарт, не требует внешнего сервиса на VPS заказчика (белый-лейбл = «автономная приватная система», Inngest-облако противоречит позиционированию); задачи идут в Local API-контексте — доменный сервис доступен напрямую. Inngest — канон легаси, но там он оправдан 10 функциями и внешним инстансом; для 002–003 (4-5 задач) — оверкилл.
- **Alternatives**: Inngest (внешний SaaS/контейнер — против плана), node-cron руками (нет персистентности/ретраев).
- **Spike Governance**: не требуется.

## D2. GiST-миграция: Payload custom migration, Expand-only, без CONCURRENTLY

- **Decision**: `payload migrate:create` → raw SQL в `src/migrations`: `CREATE EXTENSION IF NOT EXISTS btree_gist;` + частичный GiST `USING gist (resourceId =, tstzrange("startTime","endTime") &&) WHERE status IN ('HELD','BOOKED','PENDING_APPROVAL')` + down.sql (дроп только нового). Plain `CREATE INDEX` (не CONCURRENTLY — таблицы на миграции пустые/микроскопические, fresh-deploy канон; CONCURRENTLY невозможен в транзакции drizzle-раннера).
- **Rationale**: двойная броня L2; GiST-предикат по статусам — индекс не раздувается терминальными бронями.
- **Alternatives**: EXCLUDE без статусов (индекс-мусор); триггер-проверка (медленнее, непрозрачнее).

## D3. Availability engine: **pure-функция** + тонкий DB-фетчер

- **Decision**: `computeSlots({ weeklyHours, exceptions, busyIntervals, service, date, quantumMin=30 })` — **pure** (урок легаси NFR-205: async DB-bound окна непроверяемы); отдельный ресолвер тянет hours/busy из Payload и подаёт в функцию. Время: минутные offset'ы в `ShopSettings.timeZone` (fixed offset через date-fns-tz / Intl), слоты — на квант-сетке.
- **Rationale**: тестируемость без БД (матрица BVA); детерминизм DST.
- **Alternatives**: SQL-запрос generate_series (перенос логики в БД — непрозрачно); legacy async-подход (отвергнут аудитом).

## D4. Booking API: атомарный create через доменный сервис

- **Decision**: `POST /api/booking` → rate-limit (D6) → валидация (bookable, future, grid) → `db.transaction`: `pg_try_advisory_xact_lock(hashtext('resource_slot_lock_'||resourceId))` (L1) → re-check busy (пересечение с buffer'ами) → `transitionBookingFsm` (pure) → create `SlotReservation` + `Order` (+ `AuditEvent`) → коммит; GiST (L2) как backstop — 23P01 → 409. IdempotencyKey: уникальный индекс на Order.metadata? — нет: `InboxEvent`-канон не нужен для синхронного API; idempotencyKey → unique-поле на `SlotReservation.idempotencyKey` (nullable) → повтор POST возвращает ту же бронь. Status-писатели: только доменный сервис (Local API `overrideAccess: true`), field-guard 001 остаётся.
- **Rationale**: CAS/FSM-семантика легаси без Prisma; ошибочный путь — каталог кодов (SLOT_TAKEN/OUT_OF_GRID/SERVICE_NOT_BOOKABLE).

## D5. Bootstrap token (SEC-1)

- **Decision**: `OWNER_BOOTSTRAP_TOKEN` env; `Users.create` access: если `users.totalDocs === 0` → require header `X-Bootstrap-Token` (timing-safe vs env, канон 007) → иначе 403; если users существуют → public create (customer). Хук: first-create + валидный токен → `['OWNER']`; роли-поле при этом защищено field-access. Гонка (F-04): beforeOperation `pg_try_advisory_xact_lock('users_bootstrap')` + re-count внутри транзакции.
- **Rationale**: takeover-окно = 0; токен компрометация после бутстрапа бесполезна (однократность).

## D6. Rate limiter: in-memory fixed window, bounded (канон 007)

- **Decision**: `Map` с eviction (канон lockout 001), 10 req/60s per `ip+route`, 429 + Retry-After; `REPLICA_COUNT=1` assertion на буте.

## D7. Ресурсы: минимальная коллекция + solo-дефолт

- **Decision**: `Resources` (id, name, active) + seed `default_master`; `WeeklyHours.resourceId` per-resource; availability per-resource; API принимает `resourceId` (optional → единственный активный); UI: селектор мастера при >1 активном. StaffMember↔Resource binding — 003+ (OPERATOR-поверхности).

## D8. AuditEvents: append-only, PII-redacted

- **Decision**: коллекция без update/delete access (только create через доменный сервис); события: `booking.create/cancel`, `approval.approve/reject`, `bootstrap.owner`; `metadataJson` — PII-redact гейт (канон INV-010).
