# System Architecture: Modular E-Commerce & Multi-Service Booking Engine (Track 1)

**Repository**: `UnderUndre/undreseller`  
**Version**: 2.2.0 (Production Architecture — `001` + `002` actualized; `003.1` booking-first core; `004-release-readiness` planned per specs/004-release-readiness)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.4**

---

## 1. System Overview & Topography

`undreseller` — суверенный монолитный транзакционный движок электронной коммерции и комплексного сервисного бронирования (Track 1) для малого сервисного и товарного B2B/B2C бизнеса. Архитектура спроектирована по принципу **«Choose Boring Technology»**: один легковесный контейнер приложения на Next.js 15 (`REPLICA_COUNT=1`, $\le 500\text{ MB RAM}$), единая база данных PostgreSQL 16 с аппаратным GiST-исключением пересечения слотов на уровне ресурса (`resourceId`), нативный Telegram Mini App (TMA), двухботовый контур Telegram (клиентский `bot` + служебный пейджер мастера `staffBot` с кэшированием `botInfo` через `instrumentation.ts`), шлюз WhatsApp Cloud API, локальный FTS RAG по базе знаний и двойной контур фоновых задач (встроенный 5-секундный `inboxPoller` + Inngest Cloud со страхующим PostgreSQL `deadlineSweeper`).

### Топология сервисов и разделение ответственности

```text
                                ИНТЕРНЕТ (Порты 80 / 443)
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │                   TRAEFIK v3                     │
                  │       (Reverse Proxy + Let's Encrypt SSL)        │
                  └──────────────────────────────────────────────────┘
                                            │
                    Docker Network: "web_gateway" (bridge)
                                            │
         ┌──────────────────────────────────┴──────────────────────────────────┐
         │                                                                     │
         ▼                                                                     ▼
┌───────────────────────────────┐                     ┌───────────────────────────────┐
│     repos/undrllanding        │                     │      repos/undreseller        │
│   (Marketing Lander, :3000)   │                     │  (Transactional Engine, :3000)│
│                               │                     │                               │
│  Host:                        │                     │  Host:                        │
│   • underundre.com            │                     │   • shop.underundre.com      │
│     (лендинг бюро, проект     │                     │     (флагман-форк инстанс)   │
│      underundre — см.         │                     │   • demo.undreseller.com     │
│      undrllanding §6.3)       │                     │     (retired, 004)           │
│   • undreseller.com           │                     │                              │
│     (retired, 004)            │                     │                              │
│                               │                     │                               │
│  Назначение:                  │  HTTP Links / TMA   │  Назначение:                  │
│   • Прогрев лидов             │────────────────────►│   • Каталог + CartDrawer /    │
│   • 90-сек Loom видео         │  (/book, /catalog)  │   • Сетка 30 мин /book        │
│   • 3 тарифа ($350, $3.5k, $4.9k)                   │   • Чекаут /checkout          │
│   • Upwork 5% / DocuSeal      │                     │   • Client Bot + Staff Bot    │
└───────────────────────────────┘                     │   • InboxPoller + Inngest/PG  │
                                                      └───────────────────────────────┘
                                                                       │
                                                        Docker Network: "backend_network"
                                                                       │
                                                                       ▼
                                                      ┌───────────────────────────────┐
                                                      │           postgres            │
                                                      │     (PostgreSQL 16, :5432)    │
                                                      │  GiST slot_resource_no_overlap│
                                                      └───────────────────────────────┘
```

---

## 2. Source-of-Truth Tree

```text
undreseller/
├── instrumentation.ts                  # Next.js server startup hook: initializeBots() + startInboxPoller()
├── app/                                # Next.js 15 App Router
│   ├── layout.tsx                      # Корневой лейаут, подключение TelegramProvider
│   ├── page.tsx                        # Главная витрина каталога (CartDrawer + ItemCard grid)
│   ├── book/page.tsx                   # Страница мульти-сервисного бронирования (?itemIds=...)
│   ├── catalog/[slug]/page.tsx         # Детальная страница товара/услуги + JSON-LD
│   ├── checkout/page.tsx               # Страница чекаута (PAY_ON_SITE / Stars / Crypto)
│   ├── robots.ts                       # SEO-изоляция служебных API для краулеров
│   ├── sitemap.ts                      # Динамический sitemap с офлайн-фоллбеком
│   └── api/
│       ├── health/route.ts             # Healthcheck (SELECT 1 ping, без env/PII)
│       ├── catalog/
│       │   ├── route.ts                # Публичный GET активного каталога
│       │   └── [slug]/route.ts         # Публичный GET карточки товара/услуги по slug
│       ├── booking/
│       │   ├── slots/route.ts          # Расчет сплошных окон (?itemIds=id1,id2&resourceId=...)
│       │   └── lock/route.ts           # Захват мульти-сервисного холда, контакты, 403 blacklist, 409 GiST
│       ├── checkout/route.ts           # Оформление PAY_ON_SITE, IMMEDIATE и AFTER_STAFF_APPROVAL + Staff card
│       ├── inngest/route.ts            # Обслуживание 7 функций Inngest (serve handler)
│       ├── bot/
│       │   ├── telegram/webhook/       # Webhook клиентского бота (Stars sync + InboxEvent + bot.handleUpdate)
│       │   ├── staff/webhook/          # Webhook Staff-бота (RBAC + CAS 5 кнопок + copy_contacts + шаблоны)
│       │   └── whatsapp/webhook/       # Webhook WhatsApp (HMAC verify + Inbox async)
│       ├── payments/crypto/webhook/    # Webhook NOWPayments (HMAC-SHA512 + 99% check)
│       └── admin/
│           ├── items/route.ts          # Управление каталогом (POST/PATCH)
│           ├── hours/route.ts          # Расписание смен WeeklyHours (PUT)
│           ├── settings/route.ts       # Настройки магазина и валидация профиля интеграций (PUT)
│           ├── reindex/route.ts        # Запуск асинхронной переиндексации базы знаний
│           ├── escalations/route.ts    # Дашборд нерешенных инцидентов оператора
│           ├── tools/
│           │   └── drain-inbox/route.ts# Ручной HTTP-дренаж очереди InboxEvent (POST, до 100 событий)
│           ├── users/
│           │   ├── purge/route.ts      # GDPR-зачистка клиента + редакция карточек в Telegram
│           │   └── unblock/route.ts    # Аудируемый разбан клиента (actor + reason)
│           └── orders/[id]/
│               ├── purge/route.ts      # Немедленная нуллификация ПДн заказа + Telegram redaction
│               └── refund/route.ts     # Провайдер-изолированный возврат (RefundOperation)
├── components/                         # UI компоненты
│   ├── catalog/
│   │   ├── CartDrawer.tsx              # Плавающая корзина услуг (до 10 услуг, сумма времени/цены)
│   │   └── ItemCard.tsx                # Карточка товара/услуги с ценами в USD и XTR Stars
│   ├── booking/SlotGrid.tsx            # Сетка 30 мин, контакты мессенджеров, customerNotes + дисклеймер
│   ├── checkout/CheckoutModal.tsx      # Модалка оплаты (PAY_ON_SITE / Stars / Crypto / отложенный счёт)
│   └── tma/TelegramProvider.tsx        # TMA SDK: theme, MainButton, safe insets
├── config/
│   └── shop.config.ts                  # Конфигурация бренда, ftsConfig, валидация greeting
├── content/
│   └── knowledge.md                    # Основной файл базы знаний
├── docker/
│   └── bench-memory.sh                 # Скрипт замера RSS и DR-дрилла восстановления
├── docs/
│   ├── whitelabel-quickstart.md        # Руководство оператора и чеклист Дня 14
│   ├── inngest-continuity-runbook.md   # Ранбук непрерывности джобов и миграции Inngest
│   └── manual-qa-test-cases.md         # Zero-Trust Manual QA Playbook (сайт, TMA, боты, возвраты)
├── lib/
│   ├── db/prisma.ts                    # Клиент Prisma (DATABASE_URL, connection_limit=10)
│   ├── config/
│   │   └── integrationProfile.ts       # Fail-closed матрица профилей интеграций Sprint B
│   ├── ai/
│   │   ├── documentParser.ts           # Парсинг knowledge.md/.pdf (<=10MB, <=50 стр, <=200 чанков) и FTS индекс
│   │   └── knowledgeEngine.ts          # FTS RAG (top-5, <=8k токенов), защита от инъекций, каскад 4s->3s
│   ├── booking/
│   │   ├── advisoryLock.ts             # acquireResourceSlotLock + acquireItemSlotLock
│   │   ├── cart.ts                     # Авторитетная валидация корзины и снимки OrderItem
│   │   ├── lock.ts                     # Транзакция лока, OTP, 403 blacklist, история по @username, пуш мастеру
│   │   └── windows.ts                  # Генератор сплошных окон с шагом 30 мин по resourceId
│   ├── security/
│   │   ├── adminAuth.ts                # Bearer аутентификация админа, dual-token ротация
│   │   ├── initData.ts                 # Верификация Telegram initData HMAC (±60с, 3600с)
│   │   ├── rateLimiter.ts              # LRU-лимитер 10/60с со startup assertion REPLICA=1
│   │   └── whatsappSignature.ts        # Верификация подписи Meta X-Hub-Signature-256
│   ├── telemetry/logger.ts             # Дени-лист секретов/PII и сериализация объектов Error
│   ├── inbox/schemas.ts                # Дискриминированные Zod-схемы InboxEventKind, лимиты 64KB/16KB
│   ├── jobs/
│   │   ├── inngest.ts                  # 7 функций Inngest + флаг isInngestConfigured
│   │   ├── inboxPoller.ts              # Встроенный фоновый поллер InboxEvent (каждые 5 секунд)
│   │   ├── inboxProcessor.ts           # Единый обработчик событий InboxEvent (вкл. client:confirm/decline)
│   │   └── deadlineSweeper.ts          # Независимый PostgreSQL sweeper просроченных дедлайнов
│   ├── payments/
│   │   ├── fulfillment.ts              # Перевод в PAID / PAID_REQUIRES_RESOLUTION (при коллизии)
│   │   ├── refunds.ts                  # Провайдер-изолированные возвраты RefundOperation
│   │   ├── stars.ts                    # Синхронная обработка Stars (pre_checkout, payment)
│   │   └── nowpayments.ts              # HMAC-SHA512 верификация и правило 99%
│   └── bot/
│       ├── botManager.ts               # Инициализация обоих ботов при старте и кэш botInfo в globalThis
│       ├── telegramBot.ts              # Клиентский бот (/start, /help, TMA button, client:confirm/decline)
│       ├── staffBot.ts                 # Служебный бот мастера, карточка заказа, 6 кнопок, шаблоны ответов
│       ├── magicReschedule.ts          # Server-only модуль (node:crypto) генерации/проверки Magic Reschedule Link
│       ├── staffActions.ts             # 3-уровневая авторизация мастера и транзакционный CAS действий
│       ├── clientConfirmation.ts       # Обработчик кнопок [Подтверждаю, буду!] / [Не смогу прийти]
│       ├── telegramOutbox.ts           # Durable диспетчер Telegram с 429 cooldown и приоритетами
│       ├── whatsappClient.ts           # Отправка официальных шаблонов Meta с backoff
│       └── cooldown.ts                 # 24-часовой анти-спам кулдаун на номер
├── prisma/
│   ├── schema.prisma                   # Схема данных Prisma v2.1
│   └── migrations/
│       ├── 20261018000000_init/                                    # Базовая схема v1
│       ├── 20261019000000_multi_service_cart/                      # Stage 1: Expand
│       ├── 20261019010000_multi_service_cart_backfill/             # Stage 2: Bounded Backfill
│       ├── 20261019020000_multi_service_cart_validate_cutover/     # Stage 3: Validate & Cutover
│       ├── 20261019030000_multi_service_cart_contract/             # Stage 4: Contract
│       └── 20261020140000_add_client_contact_fields/               # Stage 5: customerTgUsername, hasWhatsApp, hasTelegram
├── scripts/
│   ├── backfill-slot-reservations.ts   # Идемпотентный батч-бэкфилл и префлайт коллизий r1.id < r2.id
│   ├── clean-and-test-staff-notification.sh # Скрипт очистки и проверки уведомлений Staff-бота
│   ├── clean-db.ps1 / clean-db.sh      # Скрипты очистки таблиц локальной БД
│   ├── drain-inbox.ts / drain-inbox-mjs.mjs # Автономный CLI-дренаж очереди InboxEvent
│   ├── migrate.ts                      # Запуск миграций с 5 ретраями и lock_timeout=2s
│   └── seed.ts                         # Наполнение демо-данными
└── specs/
    ├── main/                           # Каноническая документация системы (Living Spec v2.1.0)
    ├── 001-modular-commerce-template/  # Спецификация v1 шаблона
    ├── 002-service-cart-and-staff-bot/ # Спецификация v2 (корзина, Staff-бот, CAS, возвраты, QA-скрипты)
    └── 003-commerce-operations-capability-packs/ # Спецификация v3 (операционное ядро и Capability Packs)
```

---

## 3. Data Flow & Core Mechanisms

### 3.1. Мульти-сервисная корзина, контакты клиента и ресурсный барьер конкуренции (Resource Concurrency)

```text
КЛИЕНТ 1                             БЭКЕНД (/api/booking/lock)                     POSTGRESQL 16
   │                                              │                                       │
   │─── POST /api/booking/lock (itemIds=[A,B]) ──►│                                       │
   │                                              │─── BEGIN TRANSACTION ────────────────►│
   │                                              │─── acquireResourceSlotLock(resourceId)│ (Блокировка ресурса)
   │                                              │─── Проверка Blacklist (TG ID / Phone)►│ (403 если заблокирован)
   │                                              │─── Авторитетная загрузка Item[] ─────►│ (Сумма времени <= 480м)
   │                                              │─── Проверка истории (TG/Phone/@user) ►│ (isNewClient)
   │                                              │─── INSERT Order + OrderItem Snapshots►│
   │                                              │─── INSERT SlotReservation (HELD) ────►│ (GiST slot_resource_no_overlap)
   │                                              │◄── SUCCESS ───────────────────────────│
   │                                              │─── COMMIT ───────────────────────────►│
   │                                              │─── dispatchStaffOrderPagerCard() ────►│ (InboxEvent STAFF_BOT_OUTBOUND)
   │◄── 201 Created (15-min hold) ────────────────│                                       │
```

1. **Авторитетный снимок корзины (`lib/booking/cart.ts`):**
   - Сервер перечитывает актуальные записи `Item` внутри транзакции, отклоняет дубликаты (`DUPLICATE_CART_ITEM`), неактивные позиции, смешанные валюты, пустые корзины, корзины $> 10$ услуг или с суммарной длительностью $> 480$ минут.
   - В `OrderItem` сохраняются неизменяемые снимки `titleSnapshot`, `priceMinor`, `currency`, `quantity` и `durationMin`.
2. **Сбор мессенджер-контактов и распознавание постоянных клиентов (`SlotGrid.tsx`, `lib/booking/lock.ts`):**
   - При записи через браузер форма собирает имя, телефон (с нормализацией E.164 в `normalizePhoneE164`, включая автозамену ведущей `8` на `+7` для 11-значных номеров), опциональный email, флаги `hasWhatsApp` и `hasTelegram`, а также `customerTgUsername` (`@username`).
   - Проверка истории завершённых визитов (`status: 'FULFILLED'`) выполняется по `OR`-фильтру: `customerTgId`, нормализованный/исходный `customerPhone` и `customerTgUsername` (с `@` и без `@`). При наличии $\ge 1$ выполненного заказа клиент помечается как постоянный (`isNewClient = false`, `autoCancelOnNoConfirmation = false`).
3. **Сетка 30 минут и непрерывные окна (`lib/booking/windows.ts`):**
   - Кандидатные слоты генерируются с шагом `slotGridStepMin` (по умолчанию 30 минут: `09:00`, `09:30`, `10:00`...) и проверяются на непрерывную вместимость интервала `[T, T + totalDurationMin]` без пересечения с обеденным перерывом и активными бронями.
4. **Двухуровневый ресурсный барьер:**
   - **Уровень 1 (Транзакционный Resource Advisory Lock):** `acquireResourceSlotLock(tx, resourceId)` выполняет `SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || $resourceId))`. Исключает глобальную сериализацию между независимыми мастерами/ресурсами.
   - **Уровень 2 (Аппаратный GiST Exclusion Constraint):** констрейнт `slot_resource_no_overlap`:
     ```sql
     EXCLUDE USING gist (
       "resourceId" WITH =,
       tstzrange("startTime", "endTime") WITH &&
     ) WHERE ("status" IN ('HELD', 'BOOKED'));
     ```
5. **Немедленная отправка карточки мастеру (`dispatchStaffOrderPagerCard`):**
   - Сразу после коммита транзакции бронирования в `createSlotHoldLock` (`lib/booking/lock.ts`), а также при оформлении заказа через `POST /api/checkout` (как для существующей брони услуг, так и для товарного заказа `itemType === 'PRODUCT'`), карточка заказа автоматически ставится в очередь `InboxEvent` (`STAFF_BOT_OUTBOUND`) с ключом дедупликации `staff_pager_${orderId}_v1`.

---

### 3.2. Выделенный Telegram Staff-бот, 3-уровневый RBAC, шаблоны мастера и одноразовый перенос

1. **Инициализация ботов при старте (`instrumentation.ts`, `lib/bot/botManager.ts`):**
   - При запуске Node.js-рантайма хук `register()` вызывает `initializeBots()`, который единожды выполняет `bot.init()` / `staffBot.init()` и кэширует `__clientBotInfo` и `__staffBotInfo` в `globalThis` (переживая HMR-перезагрузки в режиме разработки). Вебхуки вызывают `waitForBots()` перед обработкой апдейтов.
2. **Разделение чата доставки и 3-уровневая проверка прав (`lib/bot/staffActions.ts`):**
   - Вебхук `/api/bot/staff/webhook` проверяет `x-telegram-bot-api-secret-token` (`STAFF_WEBHOOK_SECRET`) через `timingSafeEqual`.
   - Функция `authorizeStaffCallback` сверяет `chatId === staffDestinationChatId` (из `ShopSettings.staffDestinationChatId` или `.env` `STAFF_CHAT_ID`) и проверяет `fromUserId` по трём источникам:
     1) массив `ShopSettings.authorizedStaffUserIds` в БД (приоритетный источник истины);
     2) fallback-список `STAFF_AUTHORIZED_IDS` / `STAFF_ADMIN_IDS` из `.env`;
     3) личный чат 1-на-1 с ботом (`String(chatId) === actorId`).
   - Неавторизованный клик отклоняется с HTTP 403 (`status: 'ACCESS_DENIED'`) и всплывающим алертом в Telegram без мутаций в БД.
3. **Операционная карточка заказа, 6 кнопок и готовые шаблоны для копирования (`lib/bot/staffBot.ts`):**
   - Поскольку в Track 1 нет отдельной веб-админки для мастеров, карточка `formatStaffOrderCard` отображает мастеру рабочие данные заказа: имя, телефон, флаги WhatsApp/Telegram, `@username`, список услуг, длительность, интервал времени, сумму, полное примечание (`📝 Примечание: ...`) и строку быстрого копирования контактов.
   - Клавиатура `buildStaffActionKeyboard` содержит **6 инлайн-кнопок**:
     - 5 транзакционных CAS-действий: `✅ Принять` (`staff:approve`), `❌ Отклонить` (`staff:reject`), `🔄 Перенести` (`staff:reschedule`), `🚫 В чёрный список` (`staff:blacklist`), `✅ Заказ выполнен` (`staff:fulfill`);
     - 1 немутирующее действие: `📋 Копировать контакты` (`staff:copy_contacts:<orderId>`), которое отправляет мастеру отдельное сообщение (`formatCopyContactsText`) для удобного копирования в буфер обмена.
   - При успешном применении любого из 5 CAS-действий (`outcome === 'APPLIED'`) со старой карточки снимается инлайн-клавиатура (`removeInlineKeyboard: true`), клиенту (при наличии `customerTgId`) уходит автоуведомление через `CLIENT_BOT`, а мастеру в чат приходит готовый текстовый шаблон (`formatMasterTemplate` с конвертацией времени в `UTC+4`) для ручной пересылки клиенту в WhatsApp или Telegram.
4. **Разграничение операционной видимости контактов и GDPR-зачистки (`enqueueStaffMessageRedaction`):**
   - При штатных действиях мастера и автоотмене новичка контакты на карточке в чате мастера сохраняются (`triggerGdprRedaction: false`), чтобы мастер мог связаться с клиентом.
   - При вызове административных эндпоинтов права на забвение (`POST /api/admin/users/purge` и `POST /api/admin/orders/[id]/purge`) ПДн в БД обнуляются, а в `TelegramOutbox` ставится задача приоритета `CRITICAL_GDPR_AND_MARKUP (100)` на вызов `editMessageText`, заменяющая текст карточки в чате мастера на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`.
5. **Одноразовая ссылка переноса (`lib/bot/magicReschedule.ts`):**
   - Криптографические функции (`node:crypto`) вынесены в серверный модуль `lib/bot/magicReschedule.ts`, чтобы исключить попадание `node:crypto` в клиентский бандл.
   - Ссылка подписывается HMAC-SHA256 по строке `orderId:scheduleVersion:expiresAtMs:nonce` (TTL 24 часа), в БД хранится `rescheduleTokenHash = sha256(nonce)`. После выбора нового слота выставляется `rescheduleTokenConsumedAt = now()`, `rescheduleTokenHash = null` и инкрементируется `scheduleVersion`.
6. **Защита от выпрашивания скидок и верификация владения номером (`lib/booking/lock.ts`):**
   - Кнопка `[ 🚫 В чёрный список ]` аннулирует бронь (`CLIENT_BLOCKED`), блокирует стабильный `customerTgId`/`customerId` и ставит риск-маркер на телефон E.164 со сроком истечения 90 дней (`phoneRiskExpiresAt`).
   - Блокировка по подтверждённому Telegram ID или верифицированному телефону возвращает **HTTP 403 Forbidden** (`"Access restricted"`). Совпадение только по неверифицированному телефону направляется на `MANUAL_REVIEW`, а подтверждение нового владельца рециклированного номера через SMS OTP (`verifyPhoneOtpPure`) автоматически снимает чужую блокировку (`[PHONE_REBIND_UNBLOCK]`).

---

### 3.3. Гибкие способы оплаты, отложенный счёт и провайдер-изолированные возвраты

1. **Способы оплаты и тайминг предоплаты (`ShopSettings.prepaymentTiming`):**
   - **`PAY_ON_SITE`**: запись оформляется без перехода на внешние платёжные шлюзы и закрывается мастером кнопкой `[ ✅ Заказ выполнен ]` $\to$ `FULFILLED`.
   - **`PREPAYMENT_ONLINE` + `IMMEDIATE`**: счёт (Telegram Stars / NOWPayments) выставляется сразу на чекауте.
   - **`PREPAYMENT_ONLINE` + `AFTER_STAFF_APPROVAL`**: заявка сначала поступает мастеру; при нажатии `[ ✅ Принять ]` заказ переходит в `AWAITING_PAYMENT` с 15-минутным окном (`invoiceExpiresAt = now + 15m`). Если оплата не поступила за 15 минут, `invoiceExpiryJob` переводит заказ в `PAYMENT_EXPIRED` и освобождает слот (`RELEASED`).
2. **Запоздалый платёж после `PAYMENT_EXPIRED` (`lib/payments/fulfillment.ts`):**
   - При приходе запоздалого платёжного вебхука транзакция берёт `acquireResourceSlotLock` и проверяет занятость окна:
     - если окно свободно — резервация восстанавливается в `BOOKED`, заказ переходит в `PAID`;
     - если окно уже занято другим клиентом — заказ переходит в `PAID_REQUIRES_RESOLUTION`, резервация остаётся `RELEASED`, выставляется `refundStatus = 'REFUND_REQUESTED'`, создаётся запись `RefundOperation` со сроком SLA 24 часа и отправляется `SYSTEM_ALERT`.
3. **Неизменяемость `PaymentEvent` и таблица `RefundOperation` (`lib/payments/refunds.ts`):**
   - Таблица `PaymentEvent` остаётся строго неизменяемым (append-only) журналом поступлений; синтетические отрицательные записи в `PaymentEvent` категорически запрещены.
   - Все возвраты ведутся в `RefundOperation` (статусы `REQUESTED -> SUBMITTED -> CONFIRMED / FAILED / UNKNOWN`) с уникальным `idempotencyKey`:
     - **Telegram Stars (`TELEGRAM_STARS_REFUND`)**: вызов официального Bot API `refundStarPayment`;
     - **Криптовалюта (`CRYPTO_REIMBURSEMENT`)**: выплата возмещения мерчантом с валидацией сети, адреса, лимита комиссии, баланса и сверкой (`reconcileUnknownRefundPure`) при сетевых таймаутах.

---

### 3.4. Встроенный Inbox Poller, воркеры Inngest (CAS + `cancelOn`), Deadline Sweeper и Durable Telegram Outbox

1. **Встроенный 5-секундный поллер и единый процессор инбокса (`lib/jobs/inboxPoller.ts`, `lib/jobs/inboxProcessor.ts`):**
   - `startInboxPoller()` каждые 5 секунд выбирает до 10 записей `InboxEvent` в статусе `PENDING`, атомарно захватывает их (`status = 'PROCESSING'`) и вызывает `processInboxEventRow()`.
   - `processInboxEventRow()` обрабатывает `SYSTEM_ALERT`, `TELEGRAM_UPDATE` (включая парсинг колбэков подтверждения клиента `client:confirm:<orderId>` и `client:decline:<orderId>` с вызовом `handleClientConfirmationCallback`), а также исходящие очереди `TELEGRAM_OUTBOUND` и `STAFF_BOT_OUTBOUND` (`sendMessage`, `editMessageText`, `editMessageReplyMarkup`).
   - При отсутствии `INNGEST_EVENT_KEY` (`isInngestConfigured === false`) приложение продолжает штатно обрабатывать вебхуки, кнопки мастера и очередь сообщений через встроенный поллер без падения запросов.
2. **Декларативные матрицы `cancelOn` ($\le 4$ событий) + `scheduleVersion` CAS (`lib/jobs/inngest.ts`):**
   - `appointmentReminderJob` (4 триггера отмены: `order/cancelled`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`): спит до `startTime - confirmationNoticeHours`, при пробуждении сверяет `scheduleVersion` и отправляет пуш в Telegram или шаблон WhatsApp.
   - `autoCancelUnconfirmedJob` (4 триггера отмены: `order/cancelled`, `order/client-confirmed`, `order/rescheduled`, `order/fulfilled`): спит до `startTime - autoCancelDeadlineHours`. При пробуждении автоматически отменяет неподтверждённую бронь **нового клиента** (`AUTO_CANCELLED_NO_CONFIRMATION` + `RELEASED`), а для **постоянного клиента** ($\ge 1$ выполненный заказ) сохраняет бронь и шлёт предупреждение мастеру.
   - `invoiceExpiryJob` (3 триггера отмены: `order/paid`, `order/cancelled`, `order/rescheduled`): спит 15 минут для `AFTER_STAFF_APPROVAL`.
3. **Независимый PostgreSQL Deadline Reconciliation Sweeper (`lib/jobs/deadlineSweeper.ts`):**
   - Периодически сканирует PostgreSQL на просроченные дедлайны напоминаний, автоотмен и 15-минутных счетов и применяет те же идемпотентные CAS-переходы, гарантируя нулевую потерю автоотмен при даунтайме Inngest Cloud. При отставании $> 120$ секунд генерирует `[DEADLINE_SWEEPER_LAG_ALERT]`.
4. **Durable Telegram Dispatcher (`lib/bot/telegramOutbox.ts`):**
   - Единый персистентный диспетчер исходящих вызовов для каждого бота (`CLIENT_BOT` и `STAFF_BOT`) с шейпингом частоты (~1 сообщ./с в личный чат, ~20 сообщ./мин в группу `-100...`), общим кулдауном `TelegramRateState.cooldownUntil` из `parameters.retry_after` при HTTP 429, приоритетной очередью (`CRITICAL=100` для GDPR-редакции и снятия кнопок) с защитой от голодания (starvation boost), атомарными лизами и классификацией постоянных ошибок Telegram (`message to edit not found`, `chat not found`, 400/403) как `TERMINAL_NO_OP`.

---

### 3.5. Локальный FTS RAG-движок базы знаний (`lib/ai/documentParser.ts`, `lib/ai/knowledgeEngine.ts`)

1. **Индексация документов (`executeKnowledgeReindex`):**
   - Читает `content/knowledge.md` и опциональный `content/knowledge.pdf` с жёсткими лимитами: размер файла $\le 10\text{ MB}$, PDF $\le 50$ страниц, суммарно $\le 200$ чанков (`cl100k_base`, окно 500 токенов с перекрытием 50 токенов).
   - Под защитой транзакционного замка `pg_try_advisory_xact_lock(hashtext('knowledge_reindex'))` пересоздаёт записи `KnowledgeChunk` с полнотекстовым индексом `to_tsvector(ftsConfig, content)`.
2. **Ответы по базе знаний и эскалация (`askKnowledgeEngine`):**
   - Фильтрует попытки prompt-injection (`ignore previous instructions`, `print the system prompt`) и запросы $> 2000$ символов.
   - Выполняет FTS-поиск топ-5 релевантных чанков через `plainto_tsquery` (бюджет контекста $\le 8\,000$ токенов).
   - Оркестрирует вызов LLM в рамках общего бюджета **8 секунд**: основная модель (`AI_MODEL`, таймаут 4с) $\to$ резервная модель (`AI_FALLBACK_MODEL`, таймаут до 3с). При отсутствии подтверждённого ответа или двойном сбое создаёт `EscalationTicket` и отправляет алерт администратору в `ADMIN_CHAT_ID`.

---

## 4. Ресурсная изоляция и Memory Fencing

В соответствии с бизнес-планом **v18.3 (§1.3)** на сервере Hetzner CPX42 (16 GB RAM + 16 GB NVMe Swap) развернуто жесткое квотирование:

| Сервис | Контейнер | Лимит памяти (`limits.memory`) | Резерв (`reservations.memory`) | Сеть |
|---|---|---|---|---|
| **Traefik v3** | `traefik` | **300 MB** | 100 MB | `web_gateway` |
| **Marketing Lander** | `undrllanding` | **500 MB** | 150 MB | `web_gateway` |
| **Commerce Engine** | `undreseller` | **500 MB** | 200 MB | `web_gateway`, `backend_network` |
| **PostgreSQL 16** | `postgres` | **4096 MB** | 2048 MB | `backend_network` |

Бенчмарк `tests/unit/performance-benchmark.test.ts` подтверждает расчёт 7-дневной сетки слотов для корзины из 5 услуг с задержкой **p95 < 50 мс** и удержание RSS памяти процесса существенно ниже потолка **500 MB RAM** при одновременной работе двух инстансов ботов, встроенного `inboxPoller`, обработчиков Inngest и очереди Telegram outbox.

---

## 5a. Feature Reference: `005` (2026-10-26, as-built)

Продолжение платёжного слоя 004 без новой топологии:

- **Stripe Hosted Checkout** — четвёртый адаптер `PaymentProvider` (`lib/payments/stripe.ts`): dashboard-driven методы (`payment_method_types` не передаётся), TTL сессии = hold-TTL (15 мин), сессия создаётся до постановки холда (отказ Stripe = 503 без холда, аудит `STRIPE_INVOICE_FAILED`, Idempotency-Key `inv_<orderId>`), канонический `PaymentAllocationLink.providerPaymentId = payment_intent (pi_...)`, дедуп вебхука через `InboxEvent` (retention-контракт: webhook-дедуп-строки вечные), возвраты вручную через Dashboard → `RefundOperation(kind: STRIPE, actor: stripe_dashboard)`.
- **Атомарный вебхук (antigravity F3)**: `InboxEvent`-дедуп и FSM-переход выполняются строго внутри единой `prisma.$transaction` — реплей после сбоя FSM не «съедает» оплату по P2002.
- **Сквозной чекаут (F2)**: `app/api/checkout/route.ts` диспетчеризует `createInvoice` по выбранному провайдеру (`PAYMENT_PROVIDERS`); в схему добавлены `PaymentMethod.STRIPE`, `InboxEventKind.STRIPE_WEBHOOK`, `RefundOperationKind.STRIPE` (Expand-миграция `20261101000000_005_stripe_and_hardening`, включая `ALTER TYPE ... ADD VALUE 'STRIPE'`).
- **Auth-харднинг**: Argon2id (`@node-rs/argon2`, пере-хеш при следующем логине, `Account.passwordAlgo`), сериализация Argon2-операций мьютексом (очередь ≤10, таймаут 5с → 503), `sessionEpoch`/`epochCreated` мгновенный отзыв (Model A), per-IP rate limit (двухфазный штрафной трекер `recordAuthFailure`/`isIpLockedOut`) поверх per-account lockout.
- **Tech-debt**: консолидация booking-API (`/api/booking/lock` → 308 + `Deprecation`/`Sunset`; 410 ≤006), `staffRejectNotifyMode` в ShopSettings (+enum +idempotent backfill), uk-локаль data-only, `formatMinor` (JPY 0/KWD 3), вычистка 14 schema-only моделей 003 и связей `Order.orderLines/paymentPlan/fulfillmentPlan` (без SQL — таблиц не существовало) + CI rg-гейт.
- **Design upgrade (chrome)**: хедер без дублирующих Catalog/Book Slot кнопок (каталог = главная; логотип с favicon-ассетом ведёт на `/`), ноль эмодзи, `LocaleSwitcher` — dropdown-пиклист на одной кнопке, `ThemeSwitcher` (system/light/dark, `localStorage` `undrlla_theme`, anti-FOUC инлайн-скрипт в `<head>`), Geist/Geist Mono через `next/font/google`, `text-wrap: balance/pretty`, `active:scale-[0.98]`.
- **Отложено**: zod 3.25 → 4.x (последний audit-high GHSA-mrhx-c7xc-m3w5) — перенесено в ближайший релиз.

| Спека | Статус |
|---|---|
| `specs/005/` | spec rev 2.3 (audit PASS + antigravity review PASS, F1–F9 закрыты) + plan + tasks (29, реализованы) + research + data-model + contracts/stripe-adapter + quickstart + design-upgrade-tasks |



> Living-spec append per `/speckit.plan` (Principle VIII). Source: `specs/004-release-readiness/{spec,plan,data-model}.md`, `specs/005/{spec,plan,tasks}.md`.

### Новые технологии (004)

| Технология | Роль | Лицензия |
|---|---|---|
| `next-intl` | i18n ru/en (uk пост-лонч), ICU-плюрализм, locale resolution (user > language_code > instance default) | Apache-2.0 (MIT-совместимо с реестром) |
| `@aws-sdk/client-s3` + `s3-request-presigner` | Presigned URLs → Cloudflare R2 (медиа админки; сервер не видит байты) | Apache-2.0 |
| `browser-image-compression` | Клиентский WebP-ресайз ≤200 КБ перед загрузкой (OOM-гарда) | MIT |
| Cloudflare R2 | S3-совместимое медиа-хранилище, zero egress [COST: $0 до 10 ГБ] | SaaS |
| Transactional email SaaS (за адаптером) | Фоллбек-канал уведомлений (FR-409) | SaaS |
| `@underundre/undesign` (уже подключён, 1b7bd23) | Бренд-токены: шкалы, семантика, темы undrlla/undrlla-dark | MIT |

Удаляемая зависимость: `better-auth` (установлена, не импортируется — аудит 003; решение D4 в research.md).

### Новые пути (дельта к §2)

- `lib/payments/providerContract.ts` — провайдер-нейтральный контракт + реестр (FR-401/416, 003 FR-316 реализован в 004); адаптеры `nowpayments.ts` (invoice API, confirming-freeze), `stars.ts`.
- `lib/kernel/bookingFsm.ts` — двухтрековый FSM (FREE: авто-подтверждение IN_CALL / staff-аппрув OUT_CALL; PREPAID: HELD 15 мин → PAYMENT_PENDING → CONFIRMED/UNDERPAID; FR-432 поздний платёж).
- `lib/waitlist/` — waitlistService (фан-аут офферов ≤10, атомарный claim через единый booking-путь), slotPacker (any-available, детерминированный greedy).
- `lib/i18n/`, `lib/notifications/` (delivery log: ACCEPTED/FAILED, без «delivered»), `lib/email/`, `lib/uploads/presign.ts`.
- `app/admin/{catalog,team,settings}/` — мобильная контент-админка (3 таба, quick-create ≤4 полей); `app/api/admin/uploads/presign/`, `app/api/waitlist/`.
- Миграция `prisma/migrations/20261025000000_004_release_readiness_expand/` (Expand-only: 8 новых таблиц, enum ADD VALUE, nullable-колонки) — манифест в data-model.md.

### SpecKit Integration

| Спека | Статус |
|---|---|
| `specs/001-modular-commerce-template/` | v1 actualized |
| `specs/002-service-cart-and-staff-bot/` | v2 actualized |
| `specs/003-commerce-operations-capability-packs/` | 003.1 core actualized; 003.2 packs reopened → `specs/004-release-readiness/backlog-carried-over-0032.md` |
| `specs/004-release-readiness/` | spec v6 + plan + tasks (release: платежи/FSM, надёжность, i18n, гибрид TG, waitlist, кастом-поля, харденинг, undesign, контент-админка) |
| `specs/005-stripe-adapter-and-sovereign-auth/` | реализовано (2026-10-26): Stripe-адаптер, auth-харднинг, booking-API 308, polish-пакет, orphan-cleanup, design-upgrade chrome |
| `specs/006-integrations/` | **в плане** (2026-10-26): Google Calendar per-resource (OAuth2 + AES-256-GCM vault, FSM→GC push по Decision Table, инкрементальный busy-импорт 15 мин с syncToken/410-fallback), ICS-аттач, outbound webhooks (HMAC, Inngest-ретраи, SSRF-гейт) + read-only API, zod@4. Артефакты: spec rev 1.1 (audit PASS), plan, research (0 спайков), data-model (3 таблицы), contracts/{gcal-adapter,outbound-webhooks}, quickstart, qa/preliminary-rtm (2 Critical: FR-602/603) |
