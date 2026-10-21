# System Architecture: Modular E-Commerce & Multi-Service Booking Engine (Track 1)

**Repository**: `UnderUndre/undreseller`  
**Version**: 2.0.0 (Production Architecture — `001-modular-commerce-template` + `002-service-cart-and-staff-bot`)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**

---

## 1. System Overview & Topography

`undreseller` — суверенный монолитный транзакционный движок электронной коммерции и комплексного сервисного бронирования (Track 1) для малого сервисного и товарного B2B/B2C бизнеса. Архитектура спроектирована по принципу **«Choose Boring Technology»**: один легковесный контейнер приложения на Next.js 15 (`REPLICA_COUNT=1`, $\le 500\text{ MB RAM}$), единая база данных PostgreSQL 16 с аппаратным GiST-исключением пересечения слотов на уровне ресурса (`resourceId`), нативный Telegram Mini App (TMA), двухботовый контур Telegram (клиентский `bot` + служебный пейджер мастера `staffBot`), шлюз WhatsApp Cloud API, локальный FTS RAG по базе знаний и фоновый движок жизненных циклов на Inngest + PostgreSQL deadline sweeper.

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
│   • underundre.com            │                     │   • demo.undreseller.com      │
│   • undreseller.com           │                     │   • shop.underundre.com       │
│                               │                     │                               │
│  Назначение:                  │  HTTP Links / TMA   │  Назначение:                  │
│   • Прогрев лидов             │────────────────────►│   • Каталог + CartDrawer /    │
│   • 90-сек Loom видео         │  (/book, /catalog)  │   • Сетка 30 мин /book        │
│   • 3 тарифа ($350, $3.5k, $4.9k)                   │   • Чекаут /checkout          │
│   • Upwork 5% / DocuSeal      │                     │   • Client Bot + Staff Bot    │
└───────────────────────────────┘                     │   • Inngest + PG Sweeper      │
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
│       ├── catalog/                    # Публичные GET эндпоинты активного каталога
│       ├── booking/
│       │   ├── slots/route.ts          # Расчет сплошных окон (?itemIds=id1,id2&resourceId=...)
│       │   └── lock/route.ts           # Захват мульти-сервисного холда, 403 blacklist, 409 GiST
│       ├── checkout/route.ts           # Оформление PAY_ON_SITE, IMMEDIATE и AFTER_STAFF_APPROVAL
│       ├── inngest/route.ts            # Обслуживание 7 функций Inngest (serve handler)
│       ├── bot/
│       │   ├── telegram/webhook/       # Webhook клиентского бота (Stars sync + Inbox async)
│       │   ├── staff/webhook/          # Webhook Staff-бота (RBAC чата/юзера + CAS действий)
│       │   └── whatsapp/webhook/       # Webhook WhatsApp (HMAC verify + Inbox async)
│       ├── payments/crypto/webhook/    # Webhook NOWPayments (HMAC-SHA512 + 99% check)
│       └── admin/
│           ├── items/route.ts          # Управление каталогом (POST/PATCH)
│           ├── hours/route.ts          # Расписание смен WeeklyHours (PUT)
│           ├── settings/route.ts       # Настройки магазина и валидация профиля интеграций (PUT)
│           ├── reindex/route.ts        # Запуск асинхронной переиндексации базы знаний
│           ├── escalations/route.ts    # Дашборд нерешенных инцидентов оператора
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
│   ├── booking/SlotGrid.tsx            # Сетка с шагом 30 мин, customerNotes + дисклеймер, PAY_ON_SITE
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
│   └── inngest-continuity-runbook.md   # Ранбук непрерывности джобов и миграции Inngest
├── lib/
│   ├── db/prisma.ts                    # Клиент Prisma (DATABASE_URL, connection_limit=10)
│   ├── config/
│   │   └── integrationProfile.ts       # Fail-closed матрица профилей интеграций Sprint B
│   ├── booking/
│   │   ├── advisoryLock.ts             # acquireResourceSlotLock + acquireItemSlotLock
│   │   ├── cart.ts                     # Авторитетная валидация корзины и снимки OrderItem
│   │   ├── lock.ts                     # Транзакция мульти-сервисного лока, OTP, 403 blacklist
│   │   └── windows.ts                  # Генератор сплошных окон с шагом 30 мин по resourceId
│   ├── security/
│   │   ├── adminAuth.ts                # Bearer аутентификация админа, dual-token ротация
│   │   ├── initData.ts                 # Верификация Telegram initData HMAC (±60с, 3600с)
│   │   ├── rateLimiter.ts              # LRU-лимитер 10/60с со startup assertion REPLICA=1
│   │   └── whatsappSignature.ts        # Верификация подписи Meta X-Hub-Signature-256
│   ├── telemetry/logger.ts             # Дени-лист секретов/PII (вкл. customerNotes, OTP, токены)
│   ├── inbox/schemas.ts                # Дискриминированные Zod-схемы InboxEventKind, лимиты
│   ├── jobs/
│   │   ├── inngest.ts                  # 7 функций Inngest (свиперы, реиндекс, пуши, автоотмена, счёт)
│   │   └── deadlineSweeper.ts          # Независимый PostgreSQL sweeper просроченных дедлайнов
│   ├── payments/
│   │   ├── fulfillment.ts              # Перевод в PAID / PAID_REQUIRES_RESOLUTION (при коллизии)
│   │   ├── refunds.ts                  # Провайдер-изолированные возвраты RefundOperation
│   │   ├── stars.ts                    # Синхронная обработка Stars (pre_checkout, payment)
│   │   └── nowpayments.ts              # HMAC-SHA512 верификация и правило 99%
│   └── bot/
│       ├── telegramBot.ts              # Клиентский бот (/start, TMA button, manager alert)
│       ├── staffBot.ts                 # Служебный бот мастера, маскирование ПДн, Magic Reschedule
│       ├── staffActions.ts             # Авторизация мастера и транзакционный CAS 5 кнопок
│       ├── clientConfirmation.ts       # Обработчик кнопок [Подтверждаю] / [Не смогу]
│       ├── telegramOutbox.ts           # Durable диспетчер Telegram с 429 cooldown и приоритетами
│       ├── whatsappClient.ts           # Отправка официальных шаблонов Meta с backoff
│       └── cooldown.ts                 # 24-часовой анти-спам кулдаун на номер
├── prisma/
│   ├── schema.prisma                   # Схема данных Prisma v2
│   └── migrations/
│       ├── 20261018000000_init/                                    # Базовая схема v1
│       ├── 20261019000000_multi_service_cart/                      # Stage 1: Expand
│       ├── 20261019010000_multi_service_cart_backfill/             # Stage 2: Bounded Backfill
│       ├── 20261019020000_multi_service_cart_validate_cutover/     # Stage 3: Validate & Cutover
│       └── 20261019030000_multi_service_cart_contract/             # Stage 4: Contract
├── scripts/
│   ├── backfill-slot-reservations.ts   # Идемпотентный батч-бэкфилл и префлайт коллизий r1.id < r2.id
│   ├── drain-inbox.ts                  # Аварийный оффлайн-дренаж очереди при сбое Inngest
│   ├── migrate.ts                      # Запуск миграций с 5 ретраями и lock_timeout=2s
│   └── seed.ts                         # Наполнение демо-данными
└── specs/
    ├── main/                           # Каноническая документация системы (Living Spec v2.0.0)
    ├── 001-modular-commerce-template/  # Спецификация v1 шаблона
    └── 002-service-cart-and-staff-bot/ # Спецификация v2 (корзина, Staff-бот, CAS, возвраты)
```

---

## 3. Data Flow & Core Mechanisms

### 3.1. Мульти-сервисная корзина и ресурсный барьер конкуренции (Resource Concurrency)

```text
КЛИЕНТ 1                             БЭКЕНД (/api/booking/lock)                     POSTGRESQL 16
   │                                              │                                       │
   │─── POST /api/booking/lock (itemIds=[A,B]) ──►│                                       │
   │                                              │─── BEGIN TRANSACTION ────────────────►│
   │                                              │─── acquireResourceSlotLock(resourceId)│ (Блокировка ресурса)
   │                                              │─── Проверка Blacklist (TG ID / Phone)►│ (403 если заблокирован)
   │                                              │─── Авторитетная загрузка Item[] ─────►│ (Сумма времени <= 480м)
   │                                              │─── INSERT Order + OrderItem Snapshots►│
   │                                              │─── INSERT SlotReservation (HELD) ────►│ (GiST slot_resource_no_overlap)
   │                                              │◄── SUCCESS ───────────────────────────│
   │                                              │─── COMMIT ───────────────────────────►│
   │◄── 201 Created (15-min hold) ────────────────│                                       │
```

1. **Авторитетный снимок корзины (`lib/booking/cart.ts`):**
   - Сервер перечитывает актуальные записи `Item` внутри транзакции, отклоняет дубликаты, неактивные позиции, смешанные валюты, пустые корзины, корзины $> 10$ услуг или с суммарной длительностью $> 480$ минут.
   - В `OrderItem` сохраняются неизменяемые снимки `titleSnapshot`, `priceMinor`, `currency` и `durationMin`.
2. **Сетка 30 минут и непрерывные окна (`lib/booking/windows.ts`):**
   - Кандидатные слоты генерируются с шагом `slotGridStepMin` (по умолчанию 30 минут: `10:00`, `10:30`, `11:00`...) и проверяются на непрерывную вместимость интервала `[T, T + totalDurationMin]` без пересечения с обеденным перерывом и активными бронями.
3. **Двухуровневый ресурсный барьер:**
   - **Уровень 1 (Транзакционный Resource Advisory Lock):** `acquireResourceSlotLock(tx, resourceId)` выполняет `SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || $resourceId))`. Исключает глобальную сериализацию между независимыми мастерами/ресурсами.
   - **Уровень 2 (Аппаратный GiST Exclusion Constraint):** констрейнт `slot_resource_no_overlap`:
     ```sql
     EXCLUDE USING gist (
       "resourceId" WITH =,
       tstzrange("startTime", "endTime") WITH &&
     ) WHERE ("status" IN ('HELD', 'BOOKED'));
     ```
4. **4-фазный стандарт миграций БД (Principle X):**
   - **Stage 1 (Expand):** добавление nullable-колонок `resourceId`, `totalDurationMin`, снятие `NOT NULL` с `itemId`, создание таблиц `RefundOperation` и `TelegramRateState`.
   - **Stage 2 (Backfill):** батчевый бэкфилл (`LIMIT 500 FOR UPDATE SKIP LOCKED`) с карантином аномальных интервалов в `SlotReservationQuarantine` и чекпоинтами в `MigrationBackfillCheckpoint` без `SET NOT NULL` в одной транзакции.
   - **Stage 3 (Validate & Cutover):** префлайт-проверка коллизий (`r1.id < r2.id`), навешивание `CHECK ... NOT VALID`, отдельная команда `VALIDATE CONSTRAINT` и создание `slot_resource_no_overlap`.
   - **Stage 4 (Contract):** быстрый метадаata-переход `SET NOT NULL` (опирающийся на валидированный `CHECK`), удаление временного `CHECK` и старого констрейнта `slot_no_overlap`.

---

### 3.2. Выделенный Telegram Staff-бот, RBAC и одноразовый перенос (Magic Reschedule)

1. **Разделение чата доставки и прав акторов (`lib/bot/staffActions.ts`):**
   - Вебхук `/api/bot/staff/webhook` проверяет `x-telegram-bot-api-secret-token` (`STAFF_WEBHOOK_SECRET`).
   - `staffDestinationChatId` задаёт целевой чат/группу (`-100...`), а `authorizedStaffUserIds: string[]` — белый список личных Telegram ID мастеров.
   - Нажатие инлайн-кнопки неавторизованным участником группы отклоняется с алертом `Access denied` (HTTP 403) без единой мутации в БД.
2. **Минимизация ПДн и GDPR-редакция в Telegram (`lib/bot/staffBot.ts`):**
   - На карточке заказа телефон клиента маскируется по умолчанию (`+7 *** *** 4567`), а текст `customerNotes` никогда не пересылается в открытом виде в чат (выводится только индикатор `[Есть примечания]`).
   - При переходе заказа в терминальный статус (`FULFILLED`, `CANCELLED`) или вызове GDPR-очистки бот редактирует сообщение в чате мастера на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` и снимает клавиатуру `inline_keyboard`.
3. **Одноразовая ссылка переноса (Magic Reschedule Link):**
   - Подписывается HMAC-SHA256 по строке `orderId:scheduleVersion:expiresAtMs:nonce` (TTL 24 часа), в БД хранится `rescheduleTokenHash = sha256(nonce)`.
   - При использовании проверяются HMAC, срок действия, совпадение `scheduleVersion`, `rescheduleTokenConsumedAt === null` и хэш `nonce`. После переноса выставляется `rescheduleTokenConsumedAt = now()`, `rescheduleTokenHash = null` и инкрементируется `scheduleVersion`.
4. **Защита от выпрашивания скидок и верификация владения номером (`T-105`, `T-107`):**
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

### 3.4. Защита спящих воркеров Inngest (CAS + `cancelOn`), Deadline Sweeper и Durable Telegram Outbox

1. **Декларативные матрицы `cancelOn` ($\le 4$ событий) + `scheduleVersion` CAS (`lib/jobs/inngest.ts`):**
   - `appointmentReminderJob` (4 триггера отмены: `order/cancelled`, `order/client-declined`, `order/rescheduled`, `order/fulfilled`): спит до `startTime - confirmationNoticeHours`, при пробуждении сверяет `scheduleVersion` и отправляет пуш в Telegram или шаблон WhatsApp.
   - `autoCancelUnconfirmedJob` (4 триггера отмены: `order/cancelled`, `order/client-confirmed`, `order/rescheduled`, `order/fulfilled`): спит до `startTime - autoCancelDeadlineHours`. При пробуждении автоматически отменяет неподтверждённую бронь **нового клиента** (`AUTO_CANCELLED_NO_CONFIRMATION` + `RELEASED`), а для **постоянного клиента** ($\ge 1$ выполненный заказ) сохраняет бронь и шлёт предупреждение мастеру.
   - `invoiceExpiryJob` (3 триггера отмены: `order/paid`, `order/cancelled`, `order/rescheduled`): спит 15 минут для `AFTER_STAFF_APPROVAL`.
2. **Независимый PostgreSQL Deadline Reconciliation Sweeper (`lib/jobs/deadlineSweeper.ts`):**
   - Периодически сканирует PostgreSQL на просроченные дедлайны напоминаний, автоотмен и 15-минутных счетов и применяет те же идемпотентные CAS-переходы, гарантируя нулевую потерю автоотмен при даунтайме Inngest Cloud. При отставании $> 120$ секунд генерирует `[DEADLINE_SWEEPER_LAG_ALERT]`.
3. **Durable Telegram Dispatcher (`lib/bot/telegramOutbox.ts`):**
   - Единый персистентный диспетчер исходящих вызовов для каждого бота (`CLIENT_BOT` и `STAFF_BOT`) с шейпингом частоты (~1 сообщ./с в личный чат, ~20 сообщ./мин в группу `-100...`), общим кулдауном `TelegramRateState.cooldownUntil` из `parameters.retry_after` при HTTP 429, приоритетной очередью (`CRITICAL=100` для GDPR-редакции и снятия кнопок) с защитой от голодания (starvation boost), атомарными лизами и классификацией постоянных ошибок Telegram (`message to edit not found`, `chat not found`, 400/403) как `TERMINAL_NO_OP`.

---

## 4. Ресурсная изоляция и Memory Fencing

В соответствии с бизнес-планом **v18.3 (§1.3)** на сервере Hetzner CPX42 (16 GB RAM + 16 GB NVMe Swap) развернуто жесткое квотирование:

| Сервис | Контейнер | Лимит памяти (`limits.memory`) | Резерв (`reservations.memory`) | Сеть |
|---|---|---|---|---|
| **Traefik v3** | `traefik` | **300 MB** | 100 MB | `web_gateway` |
| **Marketing Lander** | `undrllanding` | **500 MB** | 150 MB | `web_gateway` |
| **Commerce Engine** | `undreseller` | **500 MB** | 200 MB | `web_gateway`, `backend_network` |
| **PostgreSQL 16** | `postgres` | **4096 MB** | 2048 MB | `backend_network` |

Бенчмарк `tests/unit/performance-benchmark.test.ts` подтверждает расчёт 7-дневной сетки слотов для корзины из 5 услуг с задержкой **p95 < 50 мс** и удержание RSS памяти процесса существенно ниже потолка **500 MB RAM** при одновременной работе двух инстансов ботов, обработчиков Inngest и очереди Telegram outbox.
