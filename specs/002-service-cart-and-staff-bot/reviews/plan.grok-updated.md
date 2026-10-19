# Implementation Plan: Multi-Service Cart, Staff Notification Bot & Smart Confirmation Lifecycle

> "Тяжесть — это надёжно. Даже если не выстрелит, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)  
> "These walls are funny. First you hate 'em, then you get used to 'em. Enough time passes, you get so you depend on them." — _Побег из Шоушенка_  
> "Scissors cuts paper, paper covers rock, rock crushes lizard... — Распределённый дедлок в микросервисах." — Шелдон Купер (_The Big Bang Theory_)

**Branch**: `002-service-cart-and-staff-bot` | **Date**: 2026-10-19  
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

## 3. Database Migration Strategy (Guarded DDL with Lock-Timeout per Principle X)

Миграция `20261019000000_multi_service_cart` следует строгому протоколу безопасного DDL с защитой от блокировки таблицы и префлайт-проверкой:

1. **Safety DDL Guards & Preflight**:
   ```sql
   SET statement_timeout = '5s';
   SET lock_timeout = '2s';

   -- Preflight check: убедиться в отсутствии пересечений слотов на уровне ресурса до наложения констрейнта
   DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM "SlotReservation" r1
       JOIN "SlotReservation" r2 ON r1.id < r2.id
         AND COALESCE(r1."resourceId", 'default_master') = COALESCE(r2."resourceId", 'default_master')
         AND tstzrange(r1."startTime", r1."endTime") && tstzrange(r2."startTime", r2."endTime")
       WHERE r1.status IN ('HELD', 'BOOKED') AND r2.status IN ('HELD', 'BOOKED')
     ) THEN
       RAISE EXCEPTION 'Preflight failed: overlapping slot reservations detected. Resolve collisions before applying slot_resource_no_overlap.';
     END IF;
   END $$;
   ```
2. **Phase 1: Expand & Backfill (Additive & Nullable)**:
   - Добавление `resourceId` с бэкфиллом:
     ```sql
     ALTER TABLE "SlotReservation" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
     ALTER TABLE "SlotReservation" ALTER COLUMN "resourceId" SET DEFAULT 'default_master';
     UPDATE "SlotReservation" SET "resourceId" = 'default_master' WHERE "resourceId" IS NULL;
     ALTER TABLE "SlotReservation" ALTER COLUMN "resourceId" SET NOT NULL;
     ALTER TABLE "SlotReservation" ALTER COLUMN "itemId" DROP NOT NULL;
     ```
   - Добавление `totalDurationMin Int @default(0)` в `SlotReservation`.
   - Добавление `customerNotes String?` в `Order`.
   - Добавление `scheduleVersion Int @default(1)` в `Order`.
   - Добавление `rescheduleTokenHash String?` и `rescheduleTokenConsumedAt DateTime?` в `Order`.
   - Добавление `cancellationReason CancellationReason?` и `refundStatus RefundStatus @default(NONE)` в `Order`.
   - Добавление `invoiceExpiresAt DateTime? @db.Timestamptz(3)` в `Order`.
   - Добавление `staffMessageId Int?` и `staffChatId String?` в `Order`.
   - Добавление `paymentType PaymentType @default(PAY_ON_SITE)` в `Order`.
   - Добавление `confirmationStatus ConfirmationStatus @default(PENDING_STAFF_REVIEW)` в `Order`.
   - Добавление `autoCancelOnNoConfirmation Boolean @default(false)` в `Order`.
   - Добавление `staffDestinationChatId String?` и `authorizedStaffUserIds String[] @default([])` в `ShopSettings`.
   - Добавление `prepaymentTiming PrepaymentTiming @default(IMMEDIATE)` в `ShopSettings`.
3. **Phase 2: Constraint Cutover**:
   - Создание нового ресурсно-диапазонного констрейнта исключения:
     ```sql
     ALTER TABLE "SlotReservation"
       ADD CONSTRAINT slot_resource_no_overlap
       EXCLUDE USING gist (
         "resourceId" WITH =,
         tstzrange("startTime", "endTime") WITH &&
       )
       WHERE ("status" IN ('HELD', 'BOOKED'));
     ```
   - Безопасное удаление старого узкого констрейнта:
     ```sql
     ALTER TABLE "SlotReservation"
       DROP CONSTRAINT IF EXISTS slot_no_overlap;
     ```
4. **Safe Down Migration Protocol (`down.sql`)**:
   - `down.sql` проверяет отсутствие мультисервисных пересечений перед попыткой возврата к старому `slot_no_overlap` по `itemId`. Если накоплены данные нового типа, откат прерывается с ясным сообщением о несовместимости схемы и требует ручного перевода слотов.

---

## 4. Key Architectural Modules & State Machines

```text
app/
  api/
    booking/slots/route.ts          # Поддержка ?itemIds=id1,id2
    booking/lock/route.ts           # Захват корзины и создание слота (с проверкой на blacklist 403 и resourceId lock)
    bot/staff/webhook/route.ts      # Вебхук Staff-бота (принять/отклонить/перенести/забанить/выполнить)
    admin/settings/route.ts         # `enabledExternalIntegration` and fail-closed runtime validation
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
   - При любом действии мастера кнопки `inline_keyboard` немедленно удаляются вызовом `editMessageReplyMarkup({ inline_keyboard: [] })` для исключения гонок повторных нажатий.
   - `ctx.from.id` актора записывается в структурированный лог `[STAFF_ACTION]`.
2. **Single-Use Magic Reschedule Link Token**:
   - При генерации ссылки создаётся случайный `nonce = randomUUID()`.
   - В `Order` сохраняется `rescheduleTokenHash = sha256(nonce)`.
   - Токен формируется как `orderId:scheduleVersion:expiresAt:nonce` и подписывается HMAC-SHA256 с TTL 24 часа.
   - При открытии ссылки проверяется: валидность HMAC, `now < expiresAt`, `order.scheduleVersion === token.scheduleVersion`, `order.rescheduleTokenConsumedAt === null` и `sha256(nonce) === order.rescheduleTokenHash`.
   - При успешном переносе: `rescheduleTokenConsumedAt = now()`, `rescheduleTokenHash = null`, а `scheduleVersion` инкрементируется, делая повторное открытие невозможным.
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

## 6. Build Order

1. Схема Prisma и SQL-миграция (`prisma/schema.prisma`, safe migration `20261019000000_multi_service_cart` с lock_timeout и `down.sql`).
2. Сервисная логика корзины и сетки 30 минут (`lib/booking/cart.ts`, `lib/booking/windows.ts` с `resourceId`).
3. Транзакционный лок корзины (`lib/booking/lock.ts`, `app/api/booking/lock` с проверкой на черный список).
4. Staff-бот и пейджер (`lib/bot/staffBot.ts`, `app/api/bot/staff/webhook` с разделением прав и маскированием ПДн).
5. Фоновые таймеры Inngest (напоминания клиенту с CAS-защитой, автоотмена новичков, таймер счёта `invoiceExpiryJob`).
6. UI-компоненты (корзина `CartDrawer`, обновленный `SlotGrid` с дисклеймером, чекаут с `PAY_ON_SITE`).
7. Комплексный пакет тестов (миграции DDL, Inngest CAS, таймер счета, staff-авторизация, GDPR Telegram redaction).
