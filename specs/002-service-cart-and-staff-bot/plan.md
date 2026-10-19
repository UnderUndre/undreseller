# Implementation Plan: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

> "Тяжесть — это надёжно. Даже если не выстрелит, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)  
> "These walls are funny. First you hate 'em, then you get used to 'em. Enough time passes, you get so you depend on them." — _Побег из Шоушенка_  
> "Scissors cuts paper, paper covers rock, rock crushes lizard... — Распределённый дедлок в микросервисах." — Шелдон Купер (_The Big Bang Theory_)

**Planning Branch**: `specs/002-service-cart-and-staff-bot` | **Date**: 2026-10-19  
**Spec**: [`spec.md`](spec.md)  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017  
**Commercial Context**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**

---

## 1. Summary

Внедрение поддержки комплексной корзины услуг (несколько сервисов в одном заказе с суммированием длительности), генерация окон с фиксированным шагом 30 минут, перевод GiST-констрейнта `slot_no_overlap` на уровень общего календаря ресурса, подключение автономного служебного бота мастера (`STAFF_BOT_TOKEN`) для согласования визитов в 1 клик, фоновое напоминание клиенту накануне через Inngest и умная автоотмена неподтверждённых записей новичков.

---

## 2. Technical Context

- **Language & Runtime**: TypeScript 5.8 / Node.js 22 LTS / Next.js 15 (App Router, no `src/`).
- **Database & Storage**: PostgreSQL 16 с расширением `btree_gist`, Prisma ORM 6.4.1. Пул PgBouncer (`DATABASE_URL`, connection_limit=10) и прямой доступ для миграций (`DIRECT_URL`).
- **Jobs Engine**: Inngest Cloud (`app/api/inngest`), функции выполняются внутри контейнера приложения с лимитами concurrency.
- **Telegram SDK**: grammY 1.35.0 (два независимых инстанса: клиентский `bot` и служебный `staffBot`).
- **Testing**: Jest 29 + Playwright E2E.
- **Process Model**: ровно 1 контейнер приложения (`REPLICA_COUNT=1`), целевой лимит памяти: <= 500 MB RAM (Docker Memory Fencing).

---

## 3. Database Migration Strategy (Principle X: Four-Phase Expand/Contract)

The migration is deliberately split across deploys. A single migration MUST NOT add, backfill, switch reads, enforce NOT NULL, add the new exclusion constraint, and drop the old constraint in one production transaction.

### Phase 1: Expand, additive only

- Add nullable `resourceId`, nullable `totalDurationMin`, new Order/ShopSettings fields, enums and the new `RefundOperation` table. No old column or constraint is removed.
- Set defaults only for new writes where PostgreSQL can do so without a table rewrite; old application versions remain functional.
- Add supporting non-unique indexes with `CREATE INDEX CONCURRENTLY` where applicable. The exclusion constraint is not created yet.
- Deploy backward-compatible application code that reads the old representation and dual-writes `resourceId`, `totalDurationMin`, OrderItems and legacy `itemId` for every new/modified reservation.

### Phase 2: Dual-write and rate-limited backfill

- Keep reads on the old representation. Run a resumable, rate-limited background backfill in bounded batches.
- Backfill `resourceId='default_master'` and recompute every `totalDurationMin` from `endTime - startTime`; stop and quarantine rows where `endTime <= startTime`, duration is not a whole minute, or duration is outside `1..480`.
- Persist checkpoints and metrics: scanned, updated, quarantined, remaining, batch latency and lock wait. Re-running the job is idempotent.
- Shadow-read the new representation and emit mismatch telemetry without changing user-visible results.

### Phase 3: Cutover

- Preflight requires zero backfill remainder, zero quarantined active rows, zero shadow-read mismatch, and no resource-level overlap (`r1.id < r2.id`).
- Deploy the read switch to the new representation while dual-write remains enabled. Monitor booking 409 rate, slot-query latency, mismatch count and payment/job errors for the agreed observation window.
- In a separate guarded DDL step, add `slot_resource_no_overlap`. `lock_timeout=2s` and `statement_timeout=5s` bound each attempt. Retry/backoff lives in `.specify/scripts/bash/migrate-safe.sh`, max 5 attempts.
- Before production, benchmark this step on a restored v1 database. On five failures or budget breach, abort automated deployment. Maintenance fallback requires pausing booking writes, rerunning preflight, applying the constraint, and restoring writes after health checks.

### Phase 4: Contract, dedicated cleanup migration

- Only after the observation window and health-check PASS: enforce `resourceId`/`totalDurationMin` NOT NULL and positive checks, stop legacy reads, remove dual-write adapters, then drop `slot_no_overlap`.
- Removal of obsolete `itemId` semantics or columns is a separate cleanup migration and requires proof that no rollback-compatible deployment depends on them.
- `down.sql` refuses destructive rollback when multi-service data cannot be represented by the legacy schema; recovery uses forward-fix or an explicit archival runbook.

### Deployment evidence

- `migrate-safe.sh` records attempt number, timings, commit SHA and outcome.
- The planning PR must include restored-v1 benchmark output and the compatibility matrix for old app/new schema and new app/old+expanded schema.
- Snapshot tagging follows `snapshot-stage.{sh,ps1}`; this attachment review cannot create the required Git tag outside a worktree.

---

## 4. Key Architectural Modules & State Machines

```text
app/
  api/
    booking/slots/route.ts          # Поддержка ?itemIds=id1,id2
    booking/lock/route.ts           # Захват корзины и создание слота (с проверкой на blacklist 403 и resourceId lock)
    bot/staff/webhook/route.ts      # Вебхук Staff-бота (принять/отклонить/перенести/забанить/выполнить)
    admin/settings/route.ts         # Настройки сетки, таймингов подтверждения, prepaymentTiming и staffDestinationChatId
    admin/users/unblock/route.ts    # Разблокировка клиента администратором
components/
  catalog/CartDrawer.tsx            # Корзина услуг с плавающим баром и итоговым хронометражем
  booking/SlotGrid.tsx              # Сетка с шагом 30 мин, поле customerNotes с дисклеймером фикс-прайса
lib/
  booking/cart.ts                   # Валидация корзины, подсчет totalDuration и totalMinor
  booking/windows.ts                # Генератор сплошных окон длины totalDuration
  booking/lock.ts                   # Транзакция блокировки мульти-сервисной брони
  bot/staffBot.ts                   # Инициализация grammY staffBot, пейджер заказов, кнопка бана
  jobs/inngest.ts                   # appointmentReminderJob + autoCancelUnconfirmedJob + invoiceExpiryJob
```

### Inngest Durable Sleep Race Protection (CAS Pattern & Unambiguous cancelOn)
Для исключения срабатывания спящих фоновых задач после отмены, переноса или ручного подтверждения заказа семантика событий разделена:

1. **События жизненного цикла**:
   - `order/created`: заказ создан.
   - `order/staff-approved`: мастер нажал `[Принять]`.
   - `order/client-confirmed`: клиент нажал `[Подтверждаю, буду]` (снимает риск автоотмены).
   - `order/client-declined`: клиент нажал `[Не смогу]`.
   - `order/paid`: онлайн-оплата подтверждена.
   - `order/cancelled`: отмена заказа мастером/клиентом/системой.
   - `order/rescheduled`: успешный перенос на новый слот.
   - `order/fulfilled`: визит завершён.

2. **Декларативные матрицы cancelOn**:
   - **`appointmentReminderJob`**:
     ```typescript
     cancelOn: [
       { event: 'order/cancelled', match: 'data.orderId' },
       { event: 'order/client-declined', match: 'data.orderId' },
       { event: 'order/rescheduled', match: 'data.orderId' },
       { event: 'order/fulfilled', match: 'data.orderId' },
     ]
     ```
     *(Напоминание НЕ отменяется при `order/paid` и `order/client-confirmed` — оплаченный клиент всё равно получает напоминание).*
   - **`autoCancelUnconfirmedJob`**:
     ```typescript
     cancelOn: [
       { event: 'order/cancelled', match: 'data.orderId' },
       { event: 'order/client-confirmed', match: 'data.orderId' },
       { event: 'order/rescheduled', match: 'data.orderId' },
       { event: 'order/fulfilled', match: 'data.orderId' },
     ]
     ```
     *(Строго 4 события, в пределах лимита Inngest <= 5 событий. Отмена заказа клиентом или сбой оплаты атомарно порождают `order/cancelled`).*
   - **`invoiceExpiryJob`**:
     ```typescript
     cancelOn: [
       { event: 'order/paid', match: 'data.orderId' },
       { event: 'order/cancelled', match: 'data.orderId' },
       { event: 'order/rescheduled', match: 'data.orderId' },
     ]
     ```

3. **Транзакционный Compare-And-Set (CAS)**:
   При пробуждении после `step.sleepUntil` воркер re-read'ит `Order` из PostgreSQL внутри транзакции:
   - Проверяет `order.scheduleVersion === event.data.scheduleVersion`;
   - Если статус изменился или версия инкрементирована — воркер завершается no-op без ложных сообщений клиенту.

### Delayed Invoicing Lifecycle (`AFTER_STAFF_APPROVAL`)
1. Мастер жмёт `[ ✅ Принять ]` в Staff-боте.
2. Статус заказа переходит в `AWAITING_PAYMENT`, выставляется `invoiceExpiresAt = now + 15 min`.
3. Запускается Inngest-функция `invoiceExpiryJob` со сном на 15 минут.
4. Если через 15 минут статус остаётся `AWAITING_PAYMENT`:
   - Заказ переходит в `PAYMENT_EXPIRED`, `cancellationReason = 'PAYMENT_EXPIRED'`, резервация переводится в `RELEASED`.
   - Клиент и мастер получают извещение об истечении времени счёта.
5. Запоздалый платёжный вебхук: проверяет статус слота через `acquireResourceSlotLock`; если слот свободен — переводит в `PAID`, если перехвачен — фиксирует `PAID_REQUIRES_RESOLUTION`, выставляет `operatorActionReason = 'OVERBOOKED_MANUAL_RESOLUTION'`, `refundStatus = 'REFUND_REQUESTED'`, инициируя SLA оператора (24ч) на ручной перенос или проведение возврата через шлюз. Деньги никогда не теряются.

---

## 5. Security, Authorization & Privacy Invariants

1. **Staff Bot Role Separation & Authorization**:
   - `staffDestinationChatId` хранит ID целевого чата, канала или закрытой группы (поддерживает отрицательные ID `-100...`).
   - `authorizedStaffUserIds: string[]` хранит белый список персональных Telegram User ID мастеров.
   - Обработчик инлайн-кнопок валидирует:
     `String(ctx.chat.id) === settings.staffDestinationChatId && settings.authorizedStaffUserIds.includes(String(ctx.from.id))`.
   - Нажатие посторонним пользователем возвращает всплывающий алерт `Access denied` без выполнения мутаций.
   - Каждое действие мастера сначала выполняет action-specific транзакционный CAS и дедупликацию `callbackQuery.id`. После commit карточка Telegram обновляется через outbox: `inline_keyboard` удаляется вызовом `editMessageReplyMarkup({ inline_keyboard: [] })`. Сбой Telegram не откатывает бизнес-состояние; повторная проекция идемпотентна.
   - `ctx.from.id` актора записывается в структурированный лог `[STAFF_ACTION]`.
2. **Single-Use Magic Reschedule Link Token**:
   - При генерации ссылки создаётся случайный `nonce = randomUUID()`; новый hash активируется CAS-обновлением по `orderId` и `scheduleVersion`, инвалидируя предыдущий неиспользованный токен.
   - В `Order` сохраняется `rescheduleTokenHash = sha256(nonce)`.
   - Токен формируется как `orderId:scheduleVersion:expiresAt:nonce` и подписывается HMAC-SHA256 с TTL 24 часа.
   - При открытии ссылки проверяется: валидность HMAC, `now < expiresAt`, `order.scheduleVersion === token.scheduleVersion`, `order.rescheduleTokenConsumedAt === null` и `sha256(nonce) === order.rescheduleTokenHash`.
   - При успешном переносе один атомарный CAS проверяет `orderId`, `scheduleVersion`, hash, `expiresAt` и `rescheduleTokenConsumedAt IS NULL`, затем выставляет `rescheduleTokenConsumedAt = now()`, обнуляет hash и инкрементирует `scheduleVersion`.
3. **Telegram GDPR Message Redaction & Privacy Minimisation**:
   - Телефон клиента на карточке заказа в Telegram маскируется по умолчанию (`+7 *** *** 4567`).
   - Текст `customerNotes` не пересылается в чат Telegram в открытом виде во избежание утечки чувствительных персональных данных; на карточке выводится индикатор `[Есть примечания]` и защищенная ссылка в админку.
   - При закрытии заказа (`FULFILLED`), отмене (`CANCELLED`) или GDPR-очистке (`POST /api/admin/users/purge` / `nightlyPurge`):
     Бот вызывает `editMessageText`, заменяя персональные данные на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`. Постоянные ошибки Telegram API (сообщение удалено, не найдено) обрабатываются как terminal no-op; временные сетевые сбои ретраятся через `InboxEvent`.
4. **Blacklist & Anti-Begging Perimeter**:
   - `POST /api/booking/lock` и чекаут проверяют статус `isBlocked` в `MessengerContact` для переданного телефона (нормализованного в E.164) и Telegram ID. При наличии блокировки запрос немедленно отклоняется с **HTTP 403 Forbidden** (`"Access restricted"`), предотвращая паразитные блокировки календаря. Разбан возможен только через `POST /api/admin/users/unblock`.
5. **Resource-Scoped Advisory Lock**:
   - Захват транзакционного замка при бронировании выполняется по `resourceId`:
     `acquireResourceSlotLock(tx, resourceId)` -> `SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || $resourceId));`.
   - Исключает глобальную сериализацию и дедлоки между независимыми мастерами.

---

## 6. Provider-Separated Refund/Reimbursement Operations

- `PaymentEvent` остаётся неизменяемым provider-event ledger. Возвраты и компенсационные выплаты хранятся в отдельной `RefundOperation` со статусами `REQUESTED`, `SUBMITTED`, `CONFIRMED`, `FAILED`, `UNKNOWN` и уникальным `idempotencyKey`.
- Telegram Stars использует `refundStarPayment(user_id, telegram_payment_charge_id)`.
- Completed crypto payment не трактуется как provider refund. Возврат клиенту является merchant crypto reimbursement/payout после проверки asset, network, подтверждённого destinationAddress, комиссии, merchant balance и operator authorization. Сохраняются `providerRef`, `txid` и network confirmations; ambiguous timeout переводит операцию в `UNKNOWN` до reconciliation.
- SLA 24ч контролируется отдельным джобом; просрочка создаёт operator escalation.

---

## 7. Commercial Alignment and Delivery Boundary

- Business-plan mapping: internal reusable Track 1 Light Monolith / Sprint B template. This work does not bypass the 10-paid-Tripwire Demand Gate and does not itself claim production traction.
- Per client SOW: max 2 roles, one key booking workflow, one enabled external integration, 14 calendar days, $4,900 flat. Additional WhatsApp/payment/messenger adapters remain disabled or move to Phase 2 Backlog at $100/hour unless the business plan is amended.
- Memory gate: application container <= 500 MB RAM. Heavy logistics, large inventory, native mobile apps and microservices are excluded.
- Commercial drift check is repeated if ICP, pricing, packaging, payment rails, external integration count or unit economics change.

---

## 8. Build Order

1. Схема Prisma и SQL-миграция (`prisma/schema.prisma`, safe migration `20261019000000_multi_service_cart` с lock_timeout и `down.sql`).
2. Сервисная логика корзины и сетки 30 минут: серверная валидация, immutable `OrderItem` snapshot, запрет дублей/неактивных услуг и лимит 480 минут (`lib/booking/cart.ts`, `lib/booking/windows.ts` с `resourceId`).
3. Транзакционный лок корзины (`lib/booking/lock.ts`, `app/api/booking/lock` с проверкой на черный список).
4. Staff-бот и пейджер (`lib/bot/staffBot.ts`, `app/api/bot/staff/webhook` с разделением прав и маскированием ПДн).
5. Фоновые таймеры Inngest (напоминания клиенту с CAS-защитой, автоотмена новичков, таймер счёта `invoiceExpiryJob`).
6. UI-компоненты (корзина `CartDrawer`, обновленный `SlotGrid` с дисклеймером, чекаут с `PAY_ON_SITE`).
7. Комплексный пакет тестов (миграции DDL, Inngest CAS, таймер счета, staff-авторизация, GDPR Telegram redaction).
