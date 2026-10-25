# Data Model: 005

> Companion к `spec.md` rev 2.2. Prisma — единственная ORM (Constitution Law). Изменения минимальны и аддитивны, кроме D6 (удаление schema-only моделей — БД-контракт не трогает).

## 1. Изменения сущностей

### 1.1 User (MODIFIED)

| Поле | Тип | Классификация | Назначение |
|---|---|---|---|
| `sessionEpoch` | `Int @default(1)` | Internal | Мгновенный массовый отзыв: инкремент ↔ все сессии недействительны (FR-502, Model A) |

### 1.2 Session (MODIFIED)

| Поле | Тип | Классификация | Назначение |
|---|---|---|---|
| `epochCreated` | `Int @default(1)` | Internal | Снимок `user.sessionEpoch` на момент логина; валидация — строгое равенство (FR-502) |

Инвариант: `session.epochCreated === user.sessionEpoch` на каждом запросе; иначе сессия отвергается как отозванная. Миграция: существующие сессии (default 1) валидны против существующих юзеров (default 1) — обратной совместимости не ломаем.

### 1.3 Account (MODIFIED)

| Поле | Тип | Классификация | Назначение |
|---|---|---|---|
| `passwordAlgo` | `String?` | Internal | `null` = scrypt (legacy 004), `"argon2id"` = пере-хеширован (FR-501). PHC-string в `password` хранит параметры сам |

### 1.4 ShopSettings (MODIFIED) + новый enum

```prisma
enum StaffRejectNotifyMode {
  NOTIFY_CUSTOMER
  SILENT
  STAFF_ONLY
}
```

| Поле | Тип | Default | Назначение |
|---|---|---|---|
| `staffRejectNotifyMode` | `StaffRejectNotifyMode` | `NOTIFY_CUSTOMER` | FR-540/D3: замена env-политики FR-429; UI-переключатель OPERATIONAL-секции (OPERATOR+) |

### 1.5 Stripe — БЕЗ новых таблиц (канон 004)

- Связка: `PaymentAllocationLink(provider: "STRIPE", providerPaymentId: cs_...|pi_..., allocationKind)`.
- Идемпотентность: `InboxEvent.dedupeKey = stripe_<event.id>` (UNIQUE, вечное хранение — retention-контракт спеки §3).
- Возвраты: `RefundOperation(kind: "STRIPE", actor: "stripe_dashboard")`.
- FSM: статусы в `Order`/`SlotReservation` (маппинг §3 спеки), DB-значения 004.

### 1.6 D6: удаление 14 schema-only моделей (Contract-фаза)

`Offering, OfferingVariant, ServicePolicy, BundleComponent, InventoryBalance, InventoryMovement, OrderLine, PaymentPlan, PaymentMilestone, PaymentAllocation, FulfillmentPlan, FulfillmentSegment, CompletionEvidence, OperatorAction` (+ связанные enum: `OfferingKind, PriceMode, InventoryMovementKind, PaymentPlanStatus, PaymentMilestoneKind, PaymentMilestoneStatus, FulfillmentPlanStatus, FulfillmentSegmentKind, FulfillmentSegmentStatus, OperatorActionSeverity, OperatorActionStatus` — только если не используются живыми моделями; проверка grep'ом по схеме).

**SQL-миграция НЕ требуется и НЕ создаётся**: таблиц этих моделей в БД никогда не было (миграции паков 003 отсутствуют — аудит 004). Удаление — только `schema.prisma` + `prisma generate`. Guard: миграция чистой базы (`migrate dev`) проходит без P2021.

## 2. State machine дополнения

FSM 004 (`lib/kernel/bookingFsm.ts`) не расширяется: Stripe-события маппятся на существующие события адаптера (`GATEWAY_FINISHED/EXPIRED/FAILED` + refund-путь). Единственная новая связь: `checkout.session.completed` при живом `PAYMENT_PENDING` → `BOOKED` (стандартный transition 004).

## 3. Expand/Contract манифест (Constitution X)

| Фаза | Артефакт | Содержимое |
|---|---|---|
| 1 Expand | `prisma/migrations/20261101000000_005_stripe_and_hardening/migration.sql` (+`down.sql`) | `ALTER TABLE "user" ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 1;` · `ALTER TABLE "session" ADD COLUMN "epochCreated" INTEGER NOT NULL DEFAULT 1;` · `ALTER TABLE "account" ADD COLUMN "passwordAlgo" TEXT;` · `CREATE TYPE "StaffRejectNotifyMode" AS ENUM ('NOTIFY_CUSTOMER','SILENT','STAFF_ONLY'); ALTER TABLE "ShopSettings" ADD COLUMN "staffRejectNotifyMode" "StaffRejectNotifyMode" NOT NULL DEFAULT 'NOTIFY_CUSTOMER';` — всё аддитивно, старый код работает |
| 2 Dual-Write & Backfill | `scripts/backfill-005-reject-notify-mode.ts` | Idempotent: env `STAFF_REJECT_NOTIFY_MODE` → колонка (однократно при деплое); rate-limited batch (lineage `backfill-004`) |
| 3 Cutover | код | Чтение политики из `ShopSettings` вместо env (флаг не нужен — колонка дефолтит как env); `resolveStaffSession` начинает проверять epochCreated; `signInStaff` пишет epochCreated и пере-хеширует Argon2id |
| 4 Contract | schema-only коммит + (позже) | D6: удаление 14 orphan-моделей из `schema.prisma` (без SQL); удаление env-чтения `STAFF_REJECT_NOTIFY_MODE`; удаление route `/api/booking/lock` (410 ≤006) |

**Rollback**: down.sql дропает только новые колонки/enum (безопасно — additive); D6-коммит откатывается git-revert'ом схемы; Stripe-адаптер выключается выкидыванием `STRIPE` из `PAYMENT_PROVIDERS` (zero-provider семантика 004, без DDL).

## 4. Классификация данных (новое)

- PII: нет новых полей (маска /24 в audit-логах — форматирование, не хранение).
- Financial: `PaymentAllocationLink` для STRIPE (существующая классификация).
- Internal: `sessionEpoch`, `epochCreated`, `passwordAlgo`, `staffRejectNotifyMode`.
