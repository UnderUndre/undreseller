# Research: 002-booking-domain

> Plan Phase 0 — Engineering Decisions (D1–D8). Всё — design-reimplementation канонов легаси на Payload-рельсах.

## D1. Планировщик: **Payload Jobs** (Inngest отвергнут; свипы в 003)

- **Decision**: архитектурный выбор для фоновых задач — встроенный Payload Jobs (`schedule` + `waitUntil`) — [payloadcms.com/docs/jobs-queue](https://payloadcms.com/docs/jobs-queue/overview). Сами свипы и напоминания перенесены в 003 (roadmap reorder 2026-11-07, Clarification Q4b); в 002 подключается только базовая конфигурация jobs в `payload.config.ts` без создания орфанных файлов задач.
- **Rationale**: 0 новых deps (NFR-203); DB-backed — выживает рестарт, не требует внешнего SaaS/контейнера на VPS заказчика; задачи идут в Local API-контексте — доменный сервис доступен напрямую. Inngest отвергнут как избыточный внешний сервис.
- **Alternatives**: Inngest (внешний SaaS/контейнер — против плана), node-cron руками (нет персистентности/ретраев).
- **Spike Governance**: не требуется.

## D2. GiST-миграция + B-Tree индекс: Payload custom migration, Expand-only, без CONCURRENTLY

- **Decision**: `payload migrate:create` → raw SQL в `src/migrations`: `CREATE EXTENSION IF NOT EXISTS btree_gist;` + частичный GiST `USING gist ("resource_id" WITH =, tstzrange("start_time","end_time") WITH &&) WHERE status IN ('HELD','BOOKED','PENDING_APPROVAL')` + составной B-tree индекс `CREATE INDEX "slot_reservations_resource_start_idx" ON "slot_reservations" ("resource_id", "start_time")` + down.sql (дроп только нового). Plain `CREATE INDEX` (не CONCURRENTLY — таблицы на миграции пустые/микроскопические, fresh-deploy канон; CONCURRENTLY невозможен в транзакции drizzle-раннера).
- **Rationale**: двойная броня L2; GiST-предикат по статусам исключает раздувание индекса терминальными бронями; составной B-tree индекс ускоряет Drizzle/Payload ORM-запросы доступности до p95 < 50 ms (устраняет seq scan).
- **Alternatives**: EXCLUDE без статусов (индекс-мусор); триггер-проверка (медленнее, непрозрачнее).

## D3. Availability engine: **pure-функция** + тонкий DB-фетчер

- **Decision**: `computeSlots({ weeklyHours, exceptions, busyIntervals, service, date, quantumMin=30 })` — **pure** (урок легаси NFR-205: async DB-bound окна непроверяемы); отдельный ресолвер тянет hours/busy из Payload и подаёт в функцию. Время: минутные offset'ы в `ShopSettings.timeZone` (fixed offset через date-fns-tz / Intl, fallback 'UTC' из глобала `ShopSettings`), слоты — на квант-сетке 30 мин. Инвариант буферов: `bufferBeforeMin` и `bufferAfterMin` обязаны целиком лежать внутри рабочих часов `WeeklyHours` (подготовка до открытия запрещена без спец-исключения).
- **Rationale**: тестируемость без БД (матрица BVA); детерминизм DST; четкие границы рабочего дня.
- **Alternatives**: SQL-запрос generate_series (перенос логики в БД — непрозрачно); legacy async-подход (отвергнут аудитом).

## D4. Booking API: атомарный create и cancel через доменный сервис

- **Decision**: 
  - `POST /api/booking` → rate-limit (D6) → валидация (bookable, future, grid) → `db.transaction`: блокирующий `pg_advisory_xact_lock(hashtext('resource_slot_lock_'||resourceId))` (L1, с `SET LOCAL statement_timeout = 5000`) → re-check busy (пересечение с buffer'ами) → `transitionBookingFsm` (pure) → create `SlotReservation` + `Order` (+ `AuditEvent`) → коммит; GiST (L2) как backstop — 23P01 → 409. 
  - `POST /api/booking/[id]/cancel` → валидация `cancelToken` (timing-safe hash compare) → блокирующий advisory lock → `transitionBookingFsm(CUSTOMER_CANCEL)` → статус `RELEASED` + `AuditEvent(booking.cancel)` → коммит.
  - IdempotencyKey: unique-поле на `SlotReservation.idempotencyKey` (nullable) → повтор POST возвращает ту же бронь. Status-писатели: только доменный сервис (Local API `overrideAccess: true`), field-guard 001 остаётся.
- **Rationale**: Блокирующий advisory lock сериализует только одновременные запросы к одному мастеру без ложных 409 для разных слотов; CAS/FSM-семантика легаси без Prisma; ошибочный путь — каталог кодов (SLOT_TAKEN/OUT_OF_GRID/SERVICE_NOT_BOOKABLE).
- **Alternatives**: Неблокирующий `try_lock` (отвергнут ревью: ложные 409 на разных слотах); выделенная таблица `InboxEvent` (избыточна для синхронного REST API).

## D5. Bootstrap token (SEC-1)

- **Decision**: `OWNER_BOOTSTRAP_TOKEN` env; `Users.create` access: на пустой БД (или пока `OWNER` отсутствует) публичная регистрация возвращает 403, требуя заголовок `X-Bootstrap-Token` (timing-safe vs env, канон 007); после создания первого `OWNER` публичная регистрация свободна и даёт строго роль `customer`. Хук: `where: { roles: { contains: 'OWNER' } }` count === 0 + валидный токен → `['OWNER']`. Гонка (F-04): beforeOperation `pg_try_advisory_xact_lock(hashtext('users_bootstrap'))` + re-count внутри транзакции.
- **Rationale**: takeover-окно = 0; регистрация сторонних пользователей до владельца невозможна; случайные аккаунты не блокируют инициализацию OWNER.

## D6. Rate limiter: in-memory fixed window, bounded (канон 007)

- **Decision**: `Map` с eviction (канон lockout 001), 10 req/60s per `ip+route`, 429 + Retry-After; `REPLICA_COUNT=1` assertion на буте. Парсинг IP: доверенное извлечение клиентского IP (левый недоверенный адрес из `x-forwarded-for` или `cf-connecting-ip`), защита от агрегации всех клиентов под loopback `127.0.0.1` за обратным прокси.

## D7. Ресурсы: минимальная коллекция + solo-дефолт

- **Decision**: `Resources` (id, name, active) + seed `default_master`; `WeeklyHours.resourceId` per-resource; availability per-resource; API принимает `resourceId` (optional → единственный активный); UI: селектор мастера при >1 активном. StaffMember↔Resource binding — 003+ (OPERATOR-поверхности).

## D8. AuditEvents: append-only, PII-redacted

- **Decision**: коллекция без update/delete access (только create через доменный сервис); составной индекс `(aggregateType, aggregateId, createdAt)`; события: `booking.create/cancel`, `approval.approve/reject`, `bootstrap.owner`; `metadataJson` — PII-redact гейт (канон INV-010).
