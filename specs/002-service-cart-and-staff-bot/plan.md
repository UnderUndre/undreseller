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
- **Process Model**: ровно 1 контейнер приложения (`REPLICA_COUNT=1`), целевой лимит памяти $\le 500\text{ MB RAM}$.

---

## 3. Database Migration Strategy (Expand / Contract per Principle X)

Миграция `20261019000000_multi_service_cart` следует строгому 4-фазному регламенту Principle X с защитой от блокировок таблицы:

1. **Safety DDL Guards & Preflight**:
   ```sql
   SET statement_timeout = '5s';
   SET lock_timeout = '2s';

   -- Preflight check: убедиться в отсутствии пересечений слотов на уровне ресурса до наложения констрейнта
   DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM "SlotReservation" r1
       JOIN "SlotReservation" r2 ON r1.id <> r2.id
         AND COALESCE(r1."resourceId", 'default_master') = COALESCE(r2."resourceId", 'default_master')
         AND tstzrange(r1."startTime", r1."endTime") && tstzrange(r2."startTime", r2."endTime")
       WHERE r1.status IN ('HELD', 'BOOKED') AND r2.status IN ('HELD', 'BOOKED')
     ) THEN
       RAISE EXCEPTION 'Preflight failed: overlapping slot reservations detected. Resolve collisions before applying slot_resource_no_overlap.';
     END IF;
   END $$;
   ```
2. **Phase 1: Expand (Additive & Nullable)**:
   - Добавление `resourceId String @default("default_master")` в `SlotReservation`.
   - Ослабление привязки: колонка `itemId String?` в `SlotReservation` становится nullable (так как бронь теперь агрегирует несколько услуг из `OrderItem[]`).
   - Добавление `totalDurationMin Int @default(0)` в `SlotReservation`.
   - Добавление `customerNotes String?` в `Order`.
   - Добавление `scheduleVersion Int @default(1)` в `Order`.
   - Добавление `rescheduleTokenConsumedAt DateTime?` в `Order`.
   - Добавление `invoiceExpiresAt DateTime? @db.Timestamptz(3)` в `Order`.
   - Добавление `staffMessageId Int?` и `staffChatId String?` в `Order`.
   - Добавление `paymentType PaymentType @default(PAY_ON_SITE)` в `Order`.
   - Добавление `confirmationStatus ConfirmationStatus @default(PENDING_STAFF)` в `Order`.
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
   - `down.sql` проверяет отсутствие мультисервисных пересечений перед попыткой возврата к старому `slot_no_overlap` по `itemId`. Если накоплены данные нового типа, миграция прерывается с ошибкой и требует явного регламента архивации.

---

## 4. Key Architectural Modules & State Machines

```text
app/
  api/
    booking/slots/route.ts          # Поддержка ?itemIds=id1,id2
    booking/lock/route.ts           # Захват корзины и создание слота (с проверкой на blacklist 403)
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
  jobs/inngest.ts                   # appointmentReminderJob (TG/WhatsApp) + autoCancelUnconfirmedJob + invoiceExpiryJob
```

### Inngest Durable Sleep Race Protection (CAS Pattern)
Для предотвращения срабатывания спящих фоновых задач после отмены, переноса или ручного подтверждения заказа:
1. Каждая отложенная задача регистрируется с декларативным `cancelOn`:
   ```typescript
   cancelOn: [
     { event: 'order/cancelled', match: 'data.orderId' },
     { event: 'order/rescheduled', match: 'data.orderId' },
     { event: 'order/confirmed', match: 'data.orderId' },
     { event: 'order/paid', match: 'data.orderId' },
   ]
   ```
2. В пейлоуд события передаётся `scheduleVersion`.
3. При пробуждении воркера после `step.sleepUntil` выполняется **транзакционный Compare-And-Set (CAS)**:
   - Заказ перечитывается из PostgreSQL;
   - Если `order.scheduleVersion !== event.data.scheduleVersion` или статус заказа не соответствует ожидаемому предусловию — выполнение немедленно завершается (no-op) без отправки сообщений клиенту и без ошибочного сброса слота.

### Delayed Invoicing Lifecycle (`AFTER_STAFF_APPROVAL`)
1. Мастер жмёт `[ ✅ Принять ]` в Staff-боте.
2. Статус заказа переходит в `AWAITING_PAYMENT`, выставляется `invoiceExpiresAt = now + 15 min`.
3. Запускается Inngest-функция `invoiceExpiryJob` со сном на 15 минут.
4. Если через 15 минут статус остаётся `AWAITING_PAYMENT`:
   - Заказ переходит в `PAYMENT_EXPIRED`, резервация переводится в `RELEASED`.
   - Клиент и мастер получают извещение об истечении времени счёта.
5. Запоздалый платёжный вебхук: проверяет статус слота через `acquireItemSlotLock`; если слот свободен — переводит в `PAID`, если перехвачен — фиксирует `PAID` и выставляет `requiresOperatorAction = true` (`OVERBOOKED_MANUAL_RESOLUTION`). Деньги никогда не теряются.

---

## 5. Security, Authorization & Privacy Invariants

1. **Staff Bot Role Separation & Authorization**:
   - `staffDestinationChatId` хранит ID целевого чата, канала или закрытой группы (поддерживает отрицательные ID `-100...`).
   - `authorizedStaffUserIds: string[]` хранит белый список персональных Telegram User ID мастеров.
   - Обработчик инлайн-кнопок валидирует:
     `String(ctx.chat.id) === settings.staffDestinationChatId && settings.authorizedStaffUserIds.includes(String(ctx.from.id))`.
   - Нажатие посторонним пользователем возвращает всплывающий алерт `Access denied` без выполнения мутаций.
   - `ctx.from.id` актора записывается в структурированный лог `[STAFF_ACTION]`.
2. **Single-Use Magic Reschedule Link Token**:
   - Ссылка переноса формируется как:
     `token = HMAC_SHA256(orderId + ":" + scheduleVersion + ":" + expiresAt + ":" + nonce, secret)`.
   - Токен имеет TTL 24 часа.
   - При открытии ссылки проверяется: валидность HMAC, `now < expiresAt`, `order.scheduleVersion === token.scheduleVersion` и `rescheduleTokenConsumedAt === null`.
   - При успешном переносе: `rescheduleTokenConsumedAt = now()`, а `scheduleVersion` инкрементируется, делая повторное открытие невозможным.
3. **Telegram GDPR Message Redaction Lifecycle**:
   - Телефон клиента на карточке заказа в Telegram маскируется по умолчанию (`+7 *** *** 4567`).
   - При создании карточки в `Order` сохраняются `staffMessageId` и `staffChatId`.
   - При завершении заказа (`FULFILLED`), отмене (`CANCELLED`) или GDPR-очистке (`POST /api/admin/users/purge` / `nightlyPurge`):
     Бот вызывает `editMessageText`, заменяя персональные данные и примечания на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`, и при наличии технической возможности удаляет сообщение.
4. **Blacklist & Anti-Begging Perimeter**:
   - `POST /api/booking/lock` и чекаут проверяют статус `isBlocked` в `MessengerContact` для переданного телефона (нормализованного в E.164) и Telegram ID. При наличии блокировки запрос немедленно отклоняется с **HTTP 403 Forbidden** (`"Access restricted"`), предотвращая паразитные блокировки календаря. Разбан возможен только через `POST /api/admin/users/unblock`.

---

## 6. Build Order

1. Схема Prisma и SQL-миграция (`prisma/schema.prisma`, safe migration `20261019000000_multi_service_cart` с lock_timeout и `down.sql`).
2. Сервисная логика корзины и сетки 30 минут (`lib/booking/cart.ts`, `lib/booking/windows.ts` с `resourceId`).
3. Транзакционный лок корзины (`lib/booking/lock.ts`, `app/api/booking/lock` с проверкой на черный список).
4. Staff-бот и пейджер (`lib/bot/staffBot.ts`, `app/api/bot/staff/webhook` с разделением прав и маскированием ПДн).
5. Фоновые таймеры Inngest (напоминания клиенту с CAS-защитой, автоотмена новичков, таймер счёта `invoiceExpiryJob`).
6. UI-компоненты (корзина `CartDrawer`, обновленный `SlotGrid` с дисклеймером, чекаут с `PAY_ON_SITE`).
7. Комплексный пакет тестов (миграции DDL, Inngest CAS, таймер счета, staff-авторизация, GDPR Telegram redaction).
