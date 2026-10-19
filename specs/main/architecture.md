# System Architecture: Modular E-Commerce Starter (Track 1)

**Repository**: `UnderUndre/undreseller`  
**Version**: 1.0.0 (Production Architecture)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**

---

## 1. System Overview & Topography

`undreseller` — это суверенный монолитный транзакционный движок электронной коммерции (Track 1) для малого сервисного и товарного B2B/B2C бизнеса. Архитектура спроектирована по принципу **«Choose Boring Technology»**: один легковесный контейнер приложения на Next.js 15, единая база данных PostgreSQL 16 с аппаратным исключением пересечения слотов, нативный Telegram Mini App (TMA), шлюз WhatsApp Cloud API, локальный FTS RAG по базе знаний и фоновый воркер на коде Inngest.

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
│   • Прогрев лидов             │────────────────────►│   • Каталог /                 │
│   • 90-сек Loom видео         │  (/book, /catalog)  │   • Сетка слотов /book        │
│   • 3 тарифа ($350, $3.5k, $4.9k)                   │   • Чекаут /checkout          │
│   • Upwork 5% / DocuSeal      │                     │   • Telegram Mini App (TMA)   │
└───────────────────────────────┘                     │   • Inngest воркер в процессе │
                                                      └───────────────────────────────┘
                                                                       │
                                                        Docker Network: "backend_network"
                                                                       │
                                                                       ▼
                                                      ┌───────────────────────────────┐
                                                      │           postgres            │
                                                      │     (PostgreSQL 16, :5432)    │
                                                      │  Изолирован от внешнего мира  │
                                                      └───────────────────────────────┘
```

---

## 2. Source-of-Truth Tree

```text
undreseller/
├── app/                                # Next.js 15 App Router
│   ├── layout.tsx                      # Корневой лейаут, подключение TelegramProvider
│   ├── page.tsx                        # Главная витрина каталога (ItemCard grid)
│   ├── book/page.tsx                   # Страница бронирования слотов (SlotGrid)
│   ├── catalog/[slug]/page.tsx         # Детальная страница товара/услуги + JSON-LD
│   ├── checkout/page.tsx               # Страница чекаута (Stars / Crypto)
│   ├── robots.ts                       # SEO-изоляция служебных API для краулеров
│   ├── sitemap.ts                      # Динамический sitemap с офлайн-фоллбеком
│   └── api/
│       ├── health/route.ts             # Healthcheck (SELECT 1 ping, без env/PII)
│       ├── catalog/                    # Публичные GET эндпоинты активного каталога
│       ├── booking/
│       │   ├── slots/route.ts          # Расчет доступных окон в shopTimezone
│       │   └── lock/route.ts           # Захват 15-мин холда с GiST-констрейнтом (409)
│       ├── checkout/route.ts           # Создание PENDING заказа и привязка рельса
│       ├── inngest/route.ts            # Обслуживание функций Inngest (serve handler)
│       ├── bot/
│       │   ├── telegram/webhook/       # Webhook Telegram (Stars sync + Inbox async)
│       │   └── whatsapp/webhook/       # Webhook WhatsApp (HMAC verify + Inbox async)
│       ├── payments/crypto/webhook/    # Webhook NOWPayments (HMAC-SHA512 + 99% check)
│       └── admin/
│           ├── items/route.ts          # Управление каталогом (POST/PATCH)
│           ├── hours/route.ts          # Расписание смен WeeklyHours (PUT)
│           ├── settings/route.ts       # Настройки магазина и санитизация greeting (PUT)
│           ├── reindex/route.ts        # Запуск асинхронной переиндексации базы знаний
│           ├── escalations/route.ts    # Дашборд нерешенных инцидентов оператора
│           └── orders/[id]/purge/      # Немедленная нуллификация ПДн заказа
├── components/                         # UI компоненты
│   ├── catalog/ItemCard.tsx            # Карточка товара с ценами в USD и XTR Stars
│   ├── booking/SlotGrid.tsx            # Сетка выбора слотов с обработкой коллизии 409
│   ├── checkout/CheckoutModal.tsx      # Модалка выбора рельса (Stars / NOWPayments)
│   └── tma/TelegramProvider.tsx        # TMA SDK: theme, MainButton, safe insets
├── config/
│   └── shop.config.ts                  # Конфигурация бренда, ftsConfig, валидация greeting
├── content/
│   ├── knowledge.md                    # Основной файл базы знаний
│   └── knowledge.pdf                   # Опциональный PDF (до 10 MB, до 50 стр)
├── docker/
│   └── bench-memory.sh                 # Скрипт замера RSS и DR-дрилла восстановления
├── docs/
│   └── whitelabel-quickstart.md        # Руководство оператора и чеклист Дня 14
├── lib/
│   ├── db/prisma.ts                    # Клиент Prisma (DATABASE_URL, connection_limit=10)
│   ├── booking/
│   │   ├── advisoryLock.ts             # acquireItemSlotLock (SELECT pg_advisory_xact_lock)
│   │   ├── lock.ts                     # Транзакция блокировки слота, маппинг 23P01 -> 409
│   │   └── windows.ts                  # Генератор окон с учетом перерывов и активных броней
│   ├── security/
│   │   ├── adminAuth.ts                # Bearer аутентификация админа, dual-token ротация
│   │   ├── initData.ts                 # Верификация Telegram initData HMAC (±60с, 3600с)
│   │   ├── rateLimiter.ts              # LRU-лимитер 10/60с со startup assertion REPLICA=1
│   │   └── whatsappSignature.ts        # Верификация подписи Meta X-Hub-Signature-256
│   ├── telemetry/logger.ts             # Дени-лист секретов/PII, [ADMIN_ACTION], счетчики
│   ├── inbox/schemas.ts                # Дискриминированные Zod-схемы InboxEventKind, лимиты
│   ├── jobs/inngest.ts                 # Фоновые функции Inngest (свиперы, реиндекс, purge)
│   ├── payments/
│   │   ├── fulfillment.ts              # Единая транзакция перевода в PAID и списания склада
│   │   ├── stars.ts                    # Синхронная обработка Stars (pre_checkout, payment)
│   │   └── nowpayments.ts              # HMAC-SHA512 верификация и обработка недоплаты
│   └── bot/
│       ├── telegramBot.ts              # grammY хэндлеры (/start, TMA button, manager alert)
│       ├── whatsappClient.ts           # Отправка официальных шаблонов Meta с backoff
│       └── cooldown.ts                 # 24-часовой анти-спам кулдаун на номер
├── prisma/
│   ├── schema.prisma                   # Схема данных Prisma
│   └── migrations/20261018000000_init/ # Начальная миграция (GiST, GIN, CHECKs) и down.sql
├── scripts/
│   ├── drain-inbox.ts                  # Аварийный оффлайн-дренаж очереди при сбое Inngest
│   ├── migrate.ts                      # Запуск prisma migrate deploy через DIRECT_URL
│   └── seed.ts                         # Наполнение демо-данными (ShopSettings, Item, Hours)
└── specs/
    ├── main/                           # Общесистемная документация (Architecture, Req)
    ├── 001-modular-commerce-template/  # Спецификация v1 шаблона
    └── 002-service-cart-and-staff-bot/ # Спецификация v2 (корзина, Staff-бот)
```

---

## 3. Data Flow & Core Mechanisms

### 3.1. Атомарный захват слота и устранение гонок (Booking Concurrency)

```text
КЛИЕНТ 1                             БЭКЕНД (/api/booking/lock)                     POSTGRESQL 16
   │                                              │                                       │
   │─── POST /api/booking/lock (14:00) ──────────►│                                       │
   │                                              │─── BEGIN TRANSACTION ────────────────►│
   │                                              │─── SELECT pg_advisory_xact_lock() ───►│ (Блокировка itemId)
   │                                              │─── UPDATE expired HELD -> RELEASED ──►│
   │                                              │─── INSERT Order (PENDING) ───────────►│
   │                                              │─── INSERT SlotReservation (HELD) ────►│ (GiST slot_no_overlap)
   │                                              │◄── SUCCESS ───────────────────────────│
   │                                              │─── COMMIT ───────────────────────────►│
   │◄── 201 Created (15-min hold) ────────────────│                                       │
                                                  │                                       │
КЛИЕНТ 2 (Параллельный запрос)                    │                                       │
   │─── POST /api/booking/lock (14:00) ──────────►│                                       │
   │                                              │─── BEGIN TRANSACTION ────────────────►│
   │                                              │─── Ждет снятия advisory lock... ─────►│
   │                                              │─── INSERT SlotReservation (14:00) ───►│ (Пересечение диапазона)
   │                                              │◄── ERROR: 23P01 (exclusion_violation)─│
   │                                              │─── ROLLBACK ─────────────────────────►│
   │◄── 409 Conflict ("Slot just taken") ─────────│                                       │
```

1. **Двухуровневый барьер:**
   - **Уровень 1 (Транзакционный Advisory Lock):** `acquireItemSlotLock(tx, itemId)` вычисляет `hashtext('slot_lock_' || itemId)`. Исключает гонки проверок (TOCTOU).
   - **Уровень 2 (Аппаратный GiST Exclusion Constraint):** констрейнт `slot_no_overlap` на таблице `SlotReservation`:
     ```sql
     EXCLUDE USING gist (
       "itemId" WITH =,
       tstzrange("startTime", "endTime") WITH &&
     ) WHERE ("status" IN ('HELD', 'BOOKED'));
     ```
2. **Маппинг кодов ошибок:** ошибка PostgreSQL `23P01` перехватывается в `lib/booking/lock.ts` и возвращает клиенту HTTP **409 Conflict** с понятным текстом: *«Selected slot has just been taken by another customer»*.

---

### 3.2. Платёжный автомат Telegram Stars (Синхронный контур)

```text
КЛИЕНТ / TELEGRAM                      ВЕБХУК (/api/bot/telegram/webhook)           БАЗА ДАННЫХ
   │                                                  │                                  │
   │ [Нажал оплатить 50 Stars]                        │                                  │
   │─── pre_checkout_query ──────────────────────────►│                                  │
   │                                                  │── Проверка холда и склада        │
   │                                                  │   (без списания денег, < 10c)    │
   │◄── answerPreCheckoutQuery(ok: true) ─────────────│                                  │
   │                                                  │                                  │
   │ [Telegram списывает баланс Stars]                │                                  │
   │─── message.successful_payment ──────────────────►│                                  │
   │    (telegram_payment_charge_id)                  │── BEGIN TRANSACTION ────────────►│
   │                                                  │── Advisory locks (ORDER BY id) ─►│
   │                                                  │── INSERT PaymentEvent (Unique) ─►│
   │                                                  │── UPDATE Order -> PAID ─────────►│
   │                                                  │── UPDATE SlotReservation BOOKED ─►│
   │                                                  │── COMMIT ───────────────────────►│
   │◄── HTTP 200 OK ──────────────────────────────────│                                  │
   │                                                  │                                  │
   │ [Сбой сети / Повторный вебхук Telegram]          │                                  │
   │─── message.successful_payment ──────────────────►│                                  │
   │    (тот же charge_id)                            │── Проверка PaymentEvent ────────►│
   │                                                  │◄── Найдена существующая запись ──│
   │◄── HTTP 200 OK (Идемпотентный возврат) ──────────│                                  │
```

1. **Разделение фаз:** `pre_checkout_query` выполняет исключительно pre-flight проверку. Деньги не списываются, заказ остаётся `PENDING`, `PaymentEvent` не создаётся. Списание фиксируется только при доставке `successful_payment`.
2. **Защита от овербукинга при запоздалой оплате:** если слот был перебронирован другим пользователем во время оплаты, транзакция **не падает с ошибкой**: бронь оставляется в `RELEASED`, заказу выставляется `Order.requiresOperatorAction = true` и `operatorActionReason = 'OVERBOOKED_MANUAL_RESOLUTION'`, а платеж фиксируется как `PAID`. В `InboxEvent` пишется системный алерт для вызова оператора.

---

### 3.3. Шлюз криптовалюты NOWPayments IPN

1. **Верификация подписи:**
   - Заголовок `x-nowpayments-sig` содержит HMAC-SHA512 от тела запроса.
   - Алгоритм: сортировка ключей первого уровня по алфавиту ASCII $\to$ сериализация через `JSON.stringify(sortedPayload)` $\to$ вычисление HMAC с секретом `NOWPAYMENTS_IPN_SECRET` $\to$ сравнение через `crypto.timingSafeEqual`.
2. **Правило 99%:**
   - Если `actually_paid / pay_amount < 0.99`, заказ не переводится в `PAID`, остаётся в `PENDING`, а оператору отправляется алерт `[UNDERPAID_CRYPTO]`.
   - Если оплачено $\ge 99\%$, заказ исполняется в `PAID` с фиксацией в `PaymentEvent`.

---

### 3.4. Очереди Inngest и аварийный оффлайн-дренаж (Durable Inbox)

```text
Входящий вебхук ──► Проверка размера (<= 64 KB)
                        │
                        ▼
             Zod-валидация канонического пейлоуда (<= 16 KB)
                        │
                        ▼
             INSERT INTO "InboxEvent" (PENDING) ──► COMMIT
                        │
                        ▼
             inngest.send({ eventId })
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
       Inngest Cloud         Аварийный сбой сети / Inngest недоступен
             │                     │
             ▼                     ▼
       app/api/inngest       Оператор запускает: npm run inbox:drain
             │                     │
             └──────────┬──────────┘
                        ▼
             Атомарный захват lease:
             UPDATE "InboxEvent" SET status = 'PROCESSING', lockedAt = now(), lockedBy = workerId
             WHERE id = $id AND (status = 'PENDING' OR (status = 'PROCESSING' AND lockedAt < now - 5m))
                        │
                        ▼
             Исполнение логики из payloadJson
                        │
             ┌──────────┴──────────┐
          Успех                  Ошибка
             │                     │
             ▼                     ▼
       status = 'SENT'       newAttemptCount = attemptCount + 1
                             Если >= 10: status = 'FAILED' + Alert
                             Иначе: status = 'PENDING' (для ретрая через 1 мин)
```

- **Ранбук аварийного дренажа:** утилита `scripts/drain-inbox.ts` не зависит от внешних облаков очереди, читает таблицу `InboxEvent` и исполняет хэндлеры напрямую из канонического `payloadJson`.

---

## 4. Ресурсная изоляция и Memory Fencing

В соответствии с бизнес-планом **v18.3 (§1.3)** на сервере Hetzner CPX42 (16 GB RAM + 16 GB NVMe Swap) развернуто жесткое квотирование:

| Сервис | Контейнер | Лимит памяти (`limits.memory`) | Резерв (`reservations.memory`) | Сеть |
|---|---|---|---|---|
| **Traefik v3** | `traefik` | **300 MB** | 100 MB | `web_gateway` |
| **Marketing Lander** | `undrllanding` | **500 MB** | 150 MB | `web_gateway` |
| **Commerce Engine** | `undreseller` | **500 MB** | 200 MB | `web_gateway`, `backend_network` |
| **PostgreSQL 16** | `postgres` | **4096 MB** | 2048 MB | `backend_network` |

Квотирование гарантирует, что даже при всплесках фонового парсинга PDF или пиковом трафике буферы PostgreSQL (`shared_buffers`) не будут выдавлены ядром Linux в NVMe-swap.
