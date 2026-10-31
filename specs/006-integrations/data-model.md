# Data Model: 006

> Companion к `spec.md` rev 1.3. Prisma — единственная ORM (Constitution Law). Все изменения аддитивные (Expand-only); ни одна существующая сущность не выводится из строя.

## 1. Новые сущности

### 1.1 IntegrationCredential (NEW)

Одна активная строка на пару `(provider, resourceId)`.

| Поле | Тип | Назначение |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `provider` | `IntegrationProvider` | Сейчас только `GOOGLE_CALENDAR` |
| `resourceId` | `String?` | FK `Resource` (nullable = instance-wide `default_master`, соло-режим; `onDelete: Cascade`). UNIQUE `(provider, resourceId)` **NULLS NOT DISTINCT** (F2-rev: обычный UNIQUE в Postgres считает NULL'ы различными — соло-режим допускал бы несколько instance-wide credential'ов; PG 16 поддерживает `UNIQUE NULLS NOT DISTINCT`, Prisma-схема держит `@@unique([provider, resourceId])`, raw-SQL миграция добавляет `NULLS NOT DISTINCT`) |
| `encryptedPayload` | `String` | `v1:<iv>:<tag>:<ct>` (AES-256-GCM): `{ refreshToken, accessToken?, calendarId, syncToken? }` — plaintext никогда не в БД |
| `status` | `IntegrationStatus` | `CONNECTED / NEEDS_REAUTH / DISABLED` |
| `connectedByStaffId` | `String` | OWNER, который подключил (audit-trail) |
| `lastSyncAt` | `DateTime? @db.Timestamptz(3)` | последний успешный sync-цикл |
| `lastError` | `String?` | человекочитаемая причина последнего сбоя (без секретов) |
| `createdAt/updatedAt` | `DateTime` | |

### 1.2 ExternalBusyBlock (NEW)

Занятость, импортированная из внешнего календаря. **Без ПДн** — только интервалы.

| Поле | Тип | Назначение |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `resourceId` | `String?` | владелец календаря (изоляция per-resource, аудиторский BLOCKER-3; FK `Resource` с `onDelete: Cascade`) |
| `calendarId` | `String` | google calendar id |
| `gcEventId` | `String` | стабильный id события Google |
| `startUtc` / `endUtc` | `DateTime @db.Timestamptz(3)` | интервал, нормализованный в UTC |
| `source` | `String @default("GCAL")` | на будущих провайдеров |
| `expiresAt` | `DateTime @db.Timestamptz(3)` | чистка sync-циклом (окно 30 дней вперёд) |

Индексы: `UNIQUE (calendarId, gcEventId)` (дедуп при 410-fallback и реплеях), `INDEX (resourceId, startUtc, endUtc)` (вычитание в слот-расчёте).

### 1.3 WebhookEndpoint (NEW)

| Поле | Тип | Назначение |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `url` | `String` | https-only, SSRF-гейт при регистрации |
| `encryptedSecret` | `String` | `v1:<iv>:<tag>:<ct>` (AES-256-GCM via `secretVault.ts`) — симметричный секрет для вычисления HMAC |
| `secretPrefix` | `String` | открытый префикс секрета (напр., `whsec_` + первые 6 hex) для идентификации в UI |
| `events` | `String[]` | подписка из закрытого списка FR-607 |
| `active` | `Boolean @default(true)` | флаг активности (авто-отключение circuit breaker при `failureCount >= 10` **подряд**) |
| `failureCount` | `Int @default(0)` | счётчик последовательных исчерпанных доставок; **сброс в 0 при успешной доставке (2xx)** — breaker только на 10 подряд |
| `lastDeliveryAt` / `lastDeliveryStatus` | `DateTime?` / `String?` | диагностика (ACCEPTED/FAILED) |
| `createdAt/updatedAt` | `DateTime` | |

Лимит: ≤5 активных строк (гейт в API-слое).

### 1.4 Item (MODIFIED)

| Поле | Тип | Назначение |
|---|---|---|
| `remoteMeetingEnabled` | `Boolean @default(false)` | FR-602/US1: Meet-conferencing на push-событии GC |

### 1.4a Order (MODIFIED)

| Поле | Тип | Назначение |
|---|---|---|
| `meetLink` | `String? @db.Text` | F6-rev: Meet-ссылка, персистится push-воркером из ответа GC `pushEvent` (async ≤60 с); email-подтверждение и Staff-бот читают отсюда. Null = push ещё не вернулся или conferencing выключен — подтверждение уходит без Meet-ссылки (ссылка остаётся доступной в GC-событии и админке) |

### 1.5 Новые enum'ы

```prisma
enum IntegrationProvider { GOOGLE_CALENDAR }
enum IntegrationStatus { CONNECTED NEEDS_REAUTH DISABLED }
```

## 2. Существующие сущности — без изменений

`SlotReservation`, `InboxEvent`, `PaymentAllocationLink`, `RefundOperation` не модифицируются; `Order` — только аддитивное nullable-поле `meetLink` (§1.4a, F6-rev). Связка бронь↔GC-событие — только `extendedProperties.private.undresellerOrderId` на стороне Google (в БД не хранится — источник истины для маппинга всегда наш `orderId`; при full-sync пересборка идёт по extendedProperties).

## 3. Expand/Contract манифест (Constitution X)

| Фаза | Артефакт | Содержимое |
|---|---|---|
| 1 Expand | `prisma/migrations/20270201000000_006_integrations/migration.sql` (+`down.sql`) | `CREATE TABLE "IntegrationCredential"` (UNIQUE `(provider, resourceId)` **NULLS NOT DISTINCT**), `"ExternalBusyBlock"`, `"WebhookEndpoint"` (+индексы/UNIQUE, FK `Resource` с `onDelete: Cascade`); `CREATE TYPE "IntegrationProvider"`, `"IntegrationStatus"`; `ALTER TABLE "Item" ADD COLUMN "remoteMeetingEnabled" BOOLEAN NOT NULL DEFAULT false;` `ALTER TABLE "Order" ADD COLUMN "meetLink" TEXT NULL;` — всё аддитивно, старый код работает |
| 2 Dual-Write & Backfill | — | Не требуется: новые сущности стартуют пустыми, существующие таблицы не тронуты |
| 3 Cutover | код | Подключение per-resource, push/sync-воркеры, слот-вычитание, webhooks — флагово-безопасно (0 подключений = поведение 004) |
| 4 Contract | — | Не требуется в 006 (ничего не выводится из строя) |

**Rollback**: down.sql дропает только новые объекты (на них нет FK из старых таблиц; `resourceId` — nullable FK с `onDelete: Cascade`); git-revert схемы; выключение фич — disconnect + деактивация эндпоинтов без DDL.

## 4. Классификация данных (дельта)

- **Secrets (Confidential)**: `IntegrationCredential.encryptedPayload` (AES-256-GCM), `WebhookEndpoint.encryptedSecret` (AES-256-GCM). Plaintext-токены/секреты запрещены в БД и логах (NFR-603, дени-лист +4 ключа).
- **PII**: нет новых полей ПДн в БД. ПДн существуют только в момент webhook-payload (по умолчанию маскированы) и в description события GC (PII-редакция канона 004). `ExternalBusyBlock` — без ПДн.
- **Internal**: `syncToken`, статусы, счётчики доставок, `secretPrefix`.
