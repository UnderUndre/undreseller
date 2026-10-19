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

Миграция `20261019000000_multi_service_cart`:
1. **Expand**:
   - Добавление `totalDurationMin Int @default(0)` в `SlotReservation`.
   - Добавление `customerNotes String?` в `Order`.
   - Добавление `paymentType PaymentType @default(PAY_ON_SITE)` в `Order`.
   - Добавление `confirmationStatus ConfirmationStatus @default(PENDING_STAFF)` в `Order`.
   - Добавление `autoCancelOnNoConfirmation Boolean @default(false)` в `Order`.
   - Добавление полей конфигурации в `ShopSettings` (`slotGridStepMin`, `confirmationNoticeHours`, `autoCancelDeadlineHours`, `autoCancelForNewClients`, `allowPayOnSite`, `prepaymentTiming`, `staffChatId`).
2. **Constraint Update**:
   - Замена констрейнта исключения `slot_no_overlap`: перенос с `itemId` на глобальный диапазон `tstzrange("startTime", "endTime")` для всех броней мастера в статусах `HELD`/`BOOKED`.
3. **Safe Down Migration**:
   - `down.sql` восстанавливает прежние констрейнты без разрушения данных заказов.

---

## 4. Key Architectural Modules

```text
app/
  api/
    booking/slots/route.ts          # Поддержка ?itemIds=id1,id2
    booking/lock/route.ts           # Захват корзины и создание слота (с проверкой на blacklist 403)
    bot/staff/webhook/route.ts      # Вебхук Staff-бота (принять/отклонить/перенести/забанить)
    admin/settings/route.ts         # Настройки сетки, таймингов подтверждения, prepaymentTiming и staffChatId
    admin/users/unblock/route.ts    # Разблокировка клиента администратором
components/
  catalog/CartDrawer.tsx            # Корзина услуг с плавающим баром и итоговым хронометражем
  booking/SlotGrid.tsx              # Сетка с шагом 30 мин, поле customerNotes с дисклеймером фикс-прайса
lib/
  booking/cart.ts                   # Валидация корзины, подсчет totalDuration и totalMinor
  booking/windows.ts                # Генератор сплошных окон длины totalDuration
  booking/lock.ts                   # Транзакция блокировки мульти-сервисной брони
  bot/staffBot.ts                   # Инициализация grammY staffBot, пейджер заказов, кнопка бана
  jobs/inngest.ts                   # appointmentReminderJob (TG/WhatsApp) + autoCancelUnconfirmedJob
```

---

## 5. Security & Isolation Invariants

1. **Staff Bot Security**:
   - Вебхук проверяет заголовок `x-telegram-bot-api-secret-token` (`STAFF_WEBHOOK_SECRET`).
   - Кнопки `[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]` сверяют `ctx.from.id` с белым списком `staffChatId`. Посторонние пользователи получают отказ.
2. **Magic Reschedule Link Token**:
   - Ссылка переноса подписывается HMAC-SHA256 (`token = HMAC(orderId, secret)`), чтобы клиент не мог подделать ID заказа или чужой слот.
3. **Rate Limiting**:
   - Защита эндпоинта бронирования через `checkRateLimit` (10 попыток в минуту).
4. **Blacklist & Anti-Begging Perimeter**:
   - `POST /api/booking/lock` и чекаут проверяют статус `isBlocked` в `MessengerContact` для переданного телефона и Telegram ID. При наличии блокировки запрос немедленно отклоняется с **HTTP 403 Forbidden** (`"Access restricted"`), предотвращая паразитные блокировки календаря. Разбан возможен только через `POST /api/admin/users/unblock`.

---

## 6. Build Order

1. Схема Prisma и SQL-миграция (`prisma/schema.prisma`, `migrations/`).
2. Сервисная логика корзины и сетки 30 минут (`lib/booking/cart.ts`, `lib/booking/windows.ts`).
3. Транзакционный лок корзины (`lib/booking/lock.ts`, `app/api/booking/lock`).
4. Staff-бот и пейджер (`lib/bot/staffBot.ts`, `app/api/bot/staff/webhook`).
5. Фоновые таймеры Inngest (напоминания клиенту, автоотмена новичков).
6. UI-компоненты (корзина `CartDrawer`, обновленный `SlotGrid`, чекаут).
7. Тесты (юнит-тесты корзины, автоотмены, staff-бота) и финальная валидация.
