# System Requirements: Modular E-Commerce & Multi-Service Booking Engine (Track 1)

**Repository**: `UnderUndre/undreseller`  
**Version**: 2.4.0 (`001-modular-commerce-template` + `002-service-cart-and-staff-bot` actualized; `004` & `005` shipped; `006-integrations` specced & reviewed PASS)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering), ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v20.0**

---

## 1. Product Vision & Commercial Boundary

`undreseller` — флагманский шаблон и транзакционный монолит международного инженерного бюро **UnderUndre**:
- **Предложение**: **Sprint B (HERO)** — запуск готового B2B/B2C SaaS MVP за 14 календарных дней по фиксированной цене **$4,900 flat fee**.
- **Продукт 0 (Tripwire)**: Архитектурный аудит и проектирование кодовой базы (**$350–$490 flat**, SLA 24–48 часов).
- **Demand Gate**: продажа больших спринтов (Sprint A и B) заблокирована до закрытия **10 оплаченных трипвайров** ($350–$490).
- **Гарантии**: 7-дневный Bugfix SLA (устранение P1/P2 багов за < 24ч) с последующим переходом на поддержку $500–$650/мес.

---

## 2. Technical Stack

| Компонент | Технология | Точная версия / Стандарт | Назначение |
|---|---|---|---|
| **Framework** | Next.js 15 (App Router, no `src/`) | `next@15.5.28` | SSR, API-роуты, `instrumentation.ts` хук старта |
| **Runtime & Language** | Node.js 22 LTS / TypeScript | `typescript@5.8.2` | Строгая типизация, ESM |
| **Database & ORM** | PostgreSQL 16 (`btree_gist`) + Prisma | `prisma@6.4.1`, `@prisma/client@6.4.1` | Реляционная модель, GiST exclusion, транзакции |
| **Queue / Background Jobs** | In-process `inboxPoller` + Inngest + PG Sweeper | `inngest@3.54.2` | 5-сек поллер инбокса, фоновые таймеры с CAS, свиперы |
| **Telegram Bot API** | grammY (Client `bot` + Staff `staffBot`) | `grammy@1.35.0` | Клиентская витрина и служебный пейджер мастера |
| **Telegram Mini App** | @twa-dev/sdk | `@twa-dev/sdk@8.0.2` | Темы, гаптика, безопасные отступы |
| **Payments** | Stripe Node SDK + NOWPayments REST | `stripe@17.5.0` (MIT) | Hosted Checkout (fiat), третий адаптер `PaymentProvider` (005) |
| **Password Hashing** | @node-rs/argon2 | `@node-rs/argon2@1.8.3` (MIT) | Argon2id-харднинг staff-auth, сериализация через мьютекс (005 FR-501/504a) |
| **In-Memory Cache / Limiter** | lru-cache | `lru-cache@11.1.0` | Рейт-лимитер (10 req / 60s на 10k ключей) |
| **Tokenization & RAG** | js-tiktoken | `js-tiktoken@1.0.20` | Токенизация `cl100k_base` (500/50 чанки) |
| **PDF Ingestion** | pdf-parse | `pdf-parse@1.1.1` | Парсинг базы знаний (до 10 MB, до 50 стр) |
| **Schema Validation** | Zod | `zod@4.0.0` (exact-pin) | Валидация входных тел и канонических пейлоудов; миграция с 3.25 завершена (006) |
| **Calendar SDK** | googleapis | `googleapis@144.0.0` (exact-pin, Apache-2.0) | Официальный клиент Google Calendar и FreeBusy API (006) |
| **i18n** | next-intl | `next-intl@4.14.9` | Chrome i18n ru/en (+uk data-only), locale resolution chain |
| **Edge Proxy** | Traefik v3 | `traefik:v3.3` | Reverse proxy, Auto Let's Encrypt SSL |

---

## 3. Commercial Scope Knife & Fail-Closed Integration Matrix

1. **Запрет n8n внутри клиентских SaaS (SUL License Liability)**:
   - Внутри `undreseller` категорически **запрещён n8n** во избежание лицензионных сборов $50,000/год. Фоновые процессы реализуются кодом через встроенный поллер, Inngest и PostgreSQL.
2. **Запрет форков сторонних платформ (Medusa / Payload / SaaS Starters)**:
   - Приложение является специализированным чистым монолитом. Запрещено форкать Medusa, Saleor, Payload Ecommerce или комьюнити-стартеры.
3. **Границы аутентификации (Zero Customer Accounts)**:
   - Публичные посетители не имеют паролей и личных кабинетов (аутентификация через HMAC `initData` в Telegram либо телефон E.164 с опциональным `@username` и OTP-верификацией на вебе).
   - Администратор аутентифицируется через ротируемый Bearer-токен `ADMIN_TOKEN`, а мастера в Telegram — через проверку `staffDestinationChatId` (`STAFF_CHAT_ID`) и трёхуровневую авторизацию актора (`ShopSettings.authorizedStaffUserIds`, `.env` `STAFF_AUTHORIZED_IDS` / `STAFF_ADMIN_IDS` или личный чат 1-на-1).
4. **Фиксированный объем Sprint B и матрица внешних интеграций (`lib/config/integrationProfile.ts`)**:
   - На один клиентский SOW разрешено: фиксированная модель ролей (**до 3 ролей в `003.1`: `OWNER`, `OPERATOR`, `PERFORMER`**), **1 ключевой бизнес-процесс** (комплексная корзина $\to$ холд $\to$ согласование/оплата) и **1 активный контур внешней интеграции** (`ShopSettings.enabledExternalIntegration`):
     - `TELEGRAM_BUNDLE`: разрешает ровно два токена (`BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` и `STAFF_BOT_TOKEN`) в едином Telegram-контуре и запрещает учётные данные `WHATSAPP_*` и `NOWPAYMENTS_*`;
     - `WHATSAPP`: разрешает `WHATSAPP_*` и запрещает оба Telegram-токена и `NOWPAYMENTS_*`;
     - `NOWPAYMENTS`: разрешает `NOWPAYMENTS_*` и запрещает оба Telegram-токена и `WHATSAPP_*`;
     - `NONE`: запрещает все внешние интеграционные токены;
     - Любой третий бот-токен (`THIRD_BOT_TOKEN`, `EXTRA_BOT_TOKEN`, `SECONDARY_STAFF_BOT_TOKEN`, `SUPPORT_BOT_TOKEN`) или смешанный набор ключей блокирует старт/готовность в режиме fail-closed (`ERR_INTEGRATION_PROFILE_VIOLATION`).
   - **Классификация платёжных и инфраструктурных адаптеров (уточнение 004/005)**: платежи (NOWPayments, Telegram Stars, Stripe) — **инфраструктурный адаптер**, не расходует лимит «≤1 бизнес-интеграция» (бизнес-план v18.5/v18.8). Провайдеры включаются per-instance через `PAYMENT_PROVIDERS` (zero-provider семантика — полностью рабочий магазин без ключей). Лимит «1 бизнес-интеграция» резервируется под контуры уровня Google Calendar / WhatsApp Business и выбирается до старта SOW через адаптер.

---

## 4. Functional Requirements (FR Inventory)

### 4.1. Базовые требования платформы (`001-modular-commerce-template`)
- **FR-01 (Admin Catalog & Shifts CRUD)**: мутации каталога (`Item`) и смен (`WeeklyHours`) защищены `ADMIN_TOKEN`. Все операции пишут структурированный аудит `[ADMIN_ACTION]`. Публичные `/api/catalog` и `/api/catalog/[slug]` отдают только активные позиции.
- **FR-02 (Booking Windows Calculation)**: вычисление свободных окон с вычитанием занятых и активных удерживаемых слотов с учётом перерывов и `minNoticeMin`.
- **FR-03 (Slot Hold & Concurrency Guard)**: атомарный захват 15-минутного слота через advisory-lock и PostgreSQL GiST констрейнт. Ошибка `23P01` маппится в HTTP 409 (`SlotConflictError`).
- **FR-04 (Telegram Webhook, Bot Initialization & Greeting)**: инициализация метаданных обоих ботов при старте сервера (`instrumentation.ts` $\to$ `lib/bot/botManager.ts` с кэшем в `globalThis`); проверка секретного токена заголовка (403); обработка `/start` и `/help`, кнопка WebApp, эскалация к менеджеру (`contact_manager`), обработка колбэков подтверждения `client:confirm:<orderId>` / `client:decline:<orderId>` и отслеживание блокировки бота (`my_chat_member` $\to$ `isBlocked`).
- **FR-05 (initData Verification)**: проверка HMAC-SHA256 данных Telegram WebApp, допустимый clock skew $\pm 60$с, максимальный возраст 3600с. Передача `customerTgId` без валидного `initData` отклоняется с HTTP 401.
- **FR-06 (WhatsApp Webhook)**: проверка подписи `X-Hub-Signature-256` по сырому телу запроса, отправка только утверждённых шаблонов Meta с экспоненциальным backoff.
- **FR-07 (WhatsApp Cooldown)**: не более одного автоответа на номер в течение 24 часов (`lastAutoReplyAt`).
- **FR-08 (Knowledge Ingestion)**: парсинг `content/knowledge.md` и `content/knowledge.pdf` под жесткими лимитами (10 MB, 50 страниц, максимум 200 чанков по 500 токенов с перекрытием 50) под защитой `pg_try_advisory_xact_lock(hashtext('knowledge_reindex'))` с записью в `KnowledgeChunk.tsv` через `to_tsvector`.
- **FR-09 (FTS Question Answering)**: фильтр prompt-injection и поиск по `KnowledgeChunk` через `plainto_tsquery` (топ-5, $\le 8\,000$ токенов). Запрет галлюцинаций цен и политик.
- **FR-10 (Deterministic AI Fallback & Escalation)**: тайм-бюджет 8 секунд (primary модель `AI_MODEL` 4с, fallback модель `AI_FALLBACK_MODEL` до 3с). При отсутствии ответа в базе знаний или двойном сбое — создание `EscalationTicket` и отправка алерта в `ADMIN_CHAT_ID`.
- **FR-11 (Telegram Stars Prepayment)**: синхронная обработка в вебхуке; `pre_checkout_query` проверяет холд без списания; списание на `successful_payment` атомарно проводит заказ.
- **FR-12 (NOWPayments Crypto Prepayment)**: верификация `x-nowpayments-sig` (сортировка ключей по ASCII, JSON.stringify, HMAC-SHA512 с `NOWPAYMENTS_IPN_SECRET`), правило недоплаты 99%.
- **FR-13 (PAID Transition & Stock Integrity)**: атомарное списание склада `OrderItem.stockDecremented`. При исчерпании склада заказ не падает, помечается `PAID_OUT_OF_STOCK` для ручного разбора.
- **FR-14 (Durable Inbox Queue, In-Process Poller & Offline/Admin Drain)**: лимит тела запроса 64 KB, валидация дискриминированных схем Zod (до 16 KB), атомарный claim/lease воркера, встроенный 5-секундный поллер (`lib/jobs/inboxPoller.ts`), автономный CLI-дренаж (`scripts/drain-inbox.ts`) и админский HTTP-эндпоинт `POST /api/admin/tools/drain-inbox`.
- **FR-15 (Health Endpoint)**: `/api/health` выполняет `SELECT 1` к базе, возвращает 200 при успехе и 503 при сбое. Секреты и PII не раскрываются.
- **FR-16 (Telemetry, Error Serialization & Log Redaction)**: рекурсивный дени-лист токенов, телефонов, email, `customerNotes`, `rescheduleToken`, `otp`, `initData`, `rawBody`, `payload` и подписей в `logger.ts`, а также извлечение неперечислимых полей `message`/`name`/`stack` у экземпляров `Error` (`serializeFields`).

### 4.2. Корзина услуг, Staff-бот и умное подтверждение (`002-service-cart-and-staff-bot`)
- **FR-101 / FR-001 (Multi-Service Basket)**: приём массива идентификаторов услуг `itemIds: string[]` (от 1 до 10 услуг) при расчёте слотов и взятии холда.
- **FR-102 / FR-002 & FR-002a (Cumulative Duration, Price & Authoritative Cart Snapshot)**: серверная перезагрузка `Item[]` внутри транзакции, запрет дублей (код `DUPLICATE_CART_ITEM`), неактивных услуг (`ITEM_NOT_FOUND_OR_INACTIVE`), не-сервисных позиций (`NON_SERVICE_ITEM_IN_BOOKING_CART`), смешанных валют (`MIXED_CART_CURRENCIES`) и суммарной длины $> 480$ минут (`MAX_DURATION_EXCEEDED`); сохранение неизменяемых снимков `OrderItem` (`titleSnapshot`, `priceMinor`, `currency`, `quantity`, `durationMin`).
- **FR-103 / FR-003 & FR-004 (30-Minute Grid & Contiguous Window Validation)**: генерация стартовых точек с шагом `slotGridStepMin` (30 минут) и фильтрация любых окон, где непрерывный интервал `[T, T + totalDurationMin]` пересекает перерыв, конец смены, `minNoticeMin` или активную бронь.
- **FR-105 / FR-005 (Resource Calendar Exclusion Constraint)**: атомарная защита календаря ресурса через `acquireResourceSlotLock` и PostgreSQL GiST exclusion constraint `slot_resource_no_overlap` по `("resourceId" WITH =, tstzrange("startTime", "endTime") WITH &&) WHERE status IN ('HELD', 'BOOKED')`.
- **FR-106 / FR-006 (Customer Notes & Fixed-Price Disclaimer)**: поле `customerNotes` (до 1 000 символов, санитизация HTML/скриптов) с обязательным UI-дисклеймером о фиксированном прайсе и запрете торга.
- **FR-107 / FR-007 & FR-008 (Dedicated Staff Bot, 3-Tier Role Authorization & Operational Order Card)**: автономный бот мастера (`STAFF_BOT_TOKEN`, `/api/bot/staff/webhook`), проверка `staffDestinationChatId` (`STAFF_CHAT_ID`) и 3-уровневая авторизация мастера (`ShopSettings.authorizedStaffUserIds`, `.env` `STAFF_AUTHORIZED_IDS`/`STAFF_ADMIN_IDS` или личный чат 1-на-1). Автоматическая постановка карточки в очередь (`dispatchStaffOrderPagerCard`) при создании бронирования слота и при оформлении заказа на чекауте (включая товарные заказы). Поскольку отдельной веб-админки у мастера нет, карточка содержит рабочие контакты (`customerPhone`, `hasWhatsApp`, `customerTgUsername`, `hasTelegram`), примечание `customerNotes`, блок для быстрого копирования и 6 инлайн-кнопок (`approve`, `reject`, `reschedule`, `blacklist`, `fulfill`, `copy_contacts`).
- **FR-109 / FR-009, FR-010 & FR-021 (Transactional CAS Staff Actions & Master Reply Templates)**: идемпотентные транзакционные переходы с проверкой `scheduleVersion` и дедупликацией `staff_cbq_${callbackQueryId}` для `[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]` и `[Заказ выполнен]` с немедленным удалением `inline_keyboard`, отправкой уведомления клиенту и генерацией готового текстового шаблона (`formatMasterTemplate`) в чат мастера для ручной пересылки клиенту.
- **FR-111 / FR-011 (Single-Use HMAC Magic Reschedule Link)**: выделенный серверный модуль `lib/bot/magicReschedule.ts` (`node:crypto`) генерирует одноразовую ссылку переноса `orderId:scheduleVersion:expiresAtMs:nonce` с HMAC-SHA256 (TTL 24ч), хранением `rescheduleTokenHash = sha256(nonce)` и погашением `rescheduleTokenConsumedAt = now()` + инкрементом `scheduleVersion`.
- **FR-112 / FR-012, FR-013, FR-014 & FR-015 (Omnichannel Reminder, Client Confirmation Wiring & Smart New-Client Auto-Cancellation)**: напоминание за `confirmationNoticeHours` (24ч) в Telegram или WhatsApp; обработка колбэков `client:confirm:<orderId>` и `client:decline:<orderId>` как напрямую в `telegramBot.ts`, так и через `inboxProcessor.ts` с эмитом `order/client-confirmed` / `order/client-declined`; автоотмена неподтверждённых записей за `autoCancelDeadlineHours` (6ч) только для **новых клиентов** (`autoCancelOnNoConfirmation = true`, причина `AUTO_CANCELLED_NO_CONFIRMATION`), сохранение записи с алертом мастеру для постоянных клиентов ($\ge 1$ выполненный заказ по `customerTgId`, `customerPhone` или `customerTgUsername`).
- **FR-116 / FR-016, FR-018 & FR-019 (Pay-On-Site & Delayed Invoicing State Machine)**: поддержка `PAY_ON_SITE` без шлюзов и настраиваемого момента предоплаты (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL` с 15-минутным таймером `AWAITING_PAYMENT` $\to$ `PAYMENT_EXPIRED`).
- **FR-117 / FR-017 (Blacklist, Phone OTP Ownership & Audited Unblock)**: блокировка по стабильному Telegram ID / `customerId` и верифицированному телефону E.164 (включая нормализацию `8...` $\to$ `+7...`) с ответом **HTTP 403 Forbidden**; 90-дневное истечение риск-маркеров телефона; защита рециклированных номеров через `MANUAL_REVIEW` и OTP-перепривязку (`verifyPhoneOtpPure`); аудируемый разбан через `POST /api/admin/users/unblock`.
- **FR-120 / FR-020 (Telegram GDPR Redaction on Explicit Erase)**: при вызове эндпоинтов `POST /api/admin/users/purge` или `POST /api/admin/orders/[id]/purge` система обнуляет ПДн в БД и ставит задачу приоритета `CRITICAL_GDPR_AND_MARKUP (100)` (`enqueueStaffMessageRedaction`) на замену текста карточки в чате Staff-бота строкой `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`. При штатных операционных переходах контакты в чате мастера сохраняются для связи с клиентом, удаляется только `inline_keyboard`.
- **FR-122 / FR-022 (Provider-Separated Refunds & Immutable PaymentEvent)**: ведение возвратов исключительно через `RefundOperation` (`TELEGRAM_STARS_REFUND` и `CRYPTO_REIMBURSEMENT` с 24ч SLA) при полной неизменяемости таблицы `PaymentEvent`.
- **FR-123 (Client Messenger Flags & Copy Contacts Action)**: хранение в `Order` полей `customerTgUsername`, `hasWhatsApp` и `hasTelegram` (миграция `20261020140000_add_client_contact_fields`) и обработка немутирующей кнопки `📋 Копировать контакты` (`staff:copy_contacts:<orderId>`) с отправкой мастеру форматированной карточки контактов (`formatCopyContactsText`).
- **FR-124 (Graceful Inngest Degradation & In-Process Continuity)**: проверка `isInngestConfigured` (`Boolean(process.env.INNGEST_EVENT_KEY)`) перед отправкой событий в Inngest SDK, чтобы локальная разработка и работа при недоступности Inngest Cloud продолжались без ошибок за счёт встроенного 5-секундного поллера `inboxPoller.ts` и `deadlineSweeper.ts`.

### 4.3. Релиз 004: платежи/FSM, надёжность, i18n, waitlist (`004-release-readiness`, 2026-10-24)
- **FR-401..FR-440 (сокращённая сводка, полные акцептансы в `specs/004-release-readiness/spec.md`)**: провайдер-нейтральный платёжный контракт `lib/payments/providerContract.ts` (реестр адаптеров, minor units, zero-provider семантика), двухтрековый FSM (`lib/kernel/bookingFsm.ts`: FREE/PREPAID, hold 15 мин, UNDERPAID, поздний платёж FR-432), durable Telegram outbox с шейпингом 429, waitlist (фан-аут офферов ≤10, атомарный claim), i18n ru/en (locale chain), кастомные поля бронирования, гибридный Telegram-режим витрины, контент-админка (3 таба), presigned R2-медиа, PII-редакция аудита, transactional email.

### 4.4. Релиз 005: Stripe fiat-рельс + sovereign auth (`005-stripe-adapter-and-sovereign-auth`, 2026-10-26)
- **FR-501..FR-505 (Auth hardening)**: Argon2id с прозрачным пере-хешем scrypt при следующем логине (`Account.passwordAlgo`), сериализация Argon2-операций мьютексом (≤1 оп/процесс, очередь ≤10, таймаут 5с → 503), мгновенный массовый отзыв сессий `sessionEpoch`/`epochCreated` (Model A: строгое равенство int-снимков), per-IP anti-bruteforce (5 неудач/15 мин → блок 30 мин) поверх per-account lockout 004, auth-аудит-события (`STAFF_SIGN_IN`, `STAFF_SIGN_IN_FAILED`, `STAFF_ACCOUNT_LOCKED`, `STAFF_IP_RATE_LIMITED`, `STAFF_SESSIONS_REVOKED`) с PII-редакцией (IP /24).
- **FR-510..FR-516 (Stripe-адаптер)**: четвёртый провайдер `PaymentProvider` (`lib/payments/stripe.ts`, `id: "STRIPE"`, dashboard-driven методы без `payment_method_types`), Checkout Session `mode:"payment"` с TTL = hold-TTL 15 мин, сессия создаётся ДО холда (отказ Stripe → 503 без холда, аудит `STRIPE_INVOICE_FAILED`, Idempotency-Key `inv_<orderId>`), канонический `providerPaymentId = payment_intent (pi_...)`, вебхук `POST /api/payments/stripe/webhook` с **атомарной транзакцией** (InboxEvent-дедуп + FSM-переход в одном `prisma.$transaction` — исключает потерю оплат на реплеях), возвраты вручную в Dashboard → `RefundOperation(kind: STRIPE, actor: stripe_dashboard)`.
- **FR-530..FR-531 (Booking API consolidation)**: `/api/booking/lock` → 308 Permanent Redirect с заголовками `Deprecation`/`Sunset` (+90 дней); 410 не позже релиза 006.
- **FR-540..FR-542 (Polish)**: `staffRejectNotifyMode` env → колонка `ShopSettings` (+enum `StaffRejectNotifyMode`, idempotent backfill), uk-локаль data-only (гейт ⇔ `enabledLocales`), `formatMinor` по registry-скейлу (JPY 0 / KWD 3).
- **FR-550 (Orphan cleanup)**: 14 schema-only моделей 003 удалены из `schema.prisma` без SQL (таблиц не существовало) + CI rg-гейт.
- **Design upgrade (послепечатная полировка 2026-10-26)**: хедер очищен от дублирующих нав-кнопок Catalog/Book Slot (каталог = главная, букать — с карточки услуги; логотип ведёт на `/`), ноль эмодзи в chrome (SVG-иконки), `LocaleSwitcher` — одиночная кнопка с dropdown-пиклистом (нативные названия, check-индикатор, Esc/click-outside), `ThemeSwitcher` — system/light/dark с `localStorage` + anti-FOUC инлайн-скриптом, шрифты Geist/Geist Mono через `next/font/google`, favicon как бренд-логотип хедера, `text-wrap: balance/pretty`, микро-интеракции `active:scale-[0.98]`.
- **Отложенный долг**: миграция zod 3.25 → 4.x (единственный audit-high GHSA-mrhx-c7xc-m3w5) — перенесена в ближайший релиз (кандидат на 006).

### Матрица переходов конечного автомата заказа

| Текущий `OrderStatus` | `ConfirmationStatus` | `ReservationStatus` | Событие / Триггер | Новый `OrderStatus` | Новый `ConfirmationStatus` | `cancellationReason` | Новый `ReservationStatus` |
|---|---|---|---|---|---|---|---|
| `PENDING` | `PENDING_STAFF_REVIEW` | `HELD` | Мастер: `[Принять]` (`PAY_ON_SITE`) | `PENDING` | `STAFF_APPROVED` | — | `BOOKED` |
| `PENDING` | `PENDING_STAFF_REVIEW` | `HELD` | Мастер: `[Принять]` (`AFTER_STAFF_APPROVAL`) | `AWAITING_PAYMENT` | `STAFF_APPROVED` | — | `HELD` (15m) |
| `AWAITING_PAYMENT` | `STAFF_APPROVED` | `HELD` | Таймер 15 минут истёк | `PAYMENT_EXPIRED` | `STAFF_APPROVED` | `PAYMENT_EXPIRED` | `RELEASED` |
| `AWAITING_PAYMENT` | `STAFF_APPROVED` | `HELD` | Клиент оплатил вовремя | `PAID` | `STAFF_APPROVED` | — | `BOOKED` |
| `PAYMENT_EXPIRED` | `STAFF_APPROVED` | `RELEASED` | Запоздалый платёж (слот свободен) | `PAID` | `STAFF_APPROVED` | — | `BOOKED` |
| `PAYMENT_EXPIRED` | `STAFF_APPROVED` | `RELEASED` | Запоздалый платёж (слот перехвачен) | `PAID_REQUIRES_RESOLUTION` | `STAFF_APPROVED` | — | `RELEASED` (SLA 24ч) |
| `PENDING`/`AWAITING_PAYMENT` | любая | `HELD`/`BOOKED` | Мастер: `[Отклонить]` | `CANCELLED` | без изменений | `STAFF_REJECTED` | `RELEASED` |
| `PENDING`/`AWAITING_PAYMENT` | любая | `HELD`/`BOOKED` | Мастер: `[В чёрный список]` | `CANCELLED` | без изменений | `CLIENT_BLOCKED` | `RELEASED` |
| `PENDING`/`PAID` | `STAFF_APPROVED` | `BOOKED` | Клиент подтвердил пуш: `[Буду]` | без изменений | `CLIENT_CONFIRMED` | — | `BOOKED` |
| `PENDING`/`PAID` | `STAFF_APPROVED` | `BOOKED` | Клиент отклонил пуш: `[Не смогу]` | `CANCELLED` | без изменений | `CLIENT_DECLINED` | `RELEASED` |
| `PENDING`/`PAID` | `STAFF_APPROVED` | `BOOKED` | Дедлайн новичка истёк | `CANCELLED` | без изменений | `AUTO_CANCELLED_NO_CONFIRMATION` | `RELEASED` |
| `PAID`/`PENDING` | `STAFF_APPROVED`/`CLIENT_CONFIRMED` | `BOOKED` | Мастер: `[Заказ выполнен]` | `FULFILLED` | без изменений | — | `BOOKED` |

---

## 5. Non-Functional Requirements (NFR)

- **NFR-01 / NFR-003 (Memory Fencing)**: Потребление памяти контейнера приложения зафиксировано на уровне **$\le 500\text{ MB RAM}$** (включая два инстанса Telegram-ботов, встроенный `inboxPoller`, Inngest-воркеры, PDF-парсер, 100 конкурентных запросов бронирования и активный Telegram outbox).
- **NFR-02 / NFR-002 (Webhook & Staff Notification SLA)**: Ответ вебхуков и постановка уведомления в очередь Staff-бота выполняются быстрее **1.5 секунды** (постановка в очередь логируется событием `[STAFF_DISPATCH_SENT]`, фактическая отправка — `[TELEGRAM_OUTBOUND_SENT]`).
- **NFR-03 (Perimeter Security)**: Все секреты передаются только через environment. Rate limiting (10 req / 60s на 10k ключей) валиден строго при `REPLICA_COUNT=1`.
- **NFR-04 (Whitelabel Split)**: Брендовая статика задается в коде (`config/shop.config.ts`); расписание, шаг сетки, тайминги напоминаний/автоотмены, режим предоплаты и список `authorizedStaffUserIds` хранятся в `ShopSettings`.
- **NFR-05 (Availability & Operational SLO)**: Целевая доступность контейнера **99.0%**, целевой **RTO $\le 30$ минут**.
- **NFR-001 (Slot Query Latency)**: Вычисление доступных сплошных слотов для корзины из 5 услуг на горизонт 7 дней выполняется быстрее **50 мс (p95)**.
- **NFR-006 (4-Stage DDL Compaction & Validation)**: Бэкфилл и `SET NOT NULL` никогда не выполняются в одной транзакции; используются `SET lock_timeout = '2s'`, `SET statement_timeout = '5s'`, `CHECK ... NOT VALID` + `VALIDATE CONSTRAINT` и до 5 ретраев с фоллбеком на сервисное окно.
- **NFR-007 (Job Engine Continuity)**: Все дедлайны и события очередей хранятся в PostgreSQL и страхуются встроенным 5-секундным поллером `inboxPoller.ts`, эндпоинтом `POST /api/admin/tools/drain-inbox` и независимым `deadlineSweeper.ts` с алертом при отставании $> 120$ секунд.

---

## 6. Регламент Disaster Recovery (Zero-Bullshit SLA)

1. **Честный RPO (Запрет спекуляций о PITR)**:
   - В шаблоне **нет встроенного демона непрерывного резервного копирования (PITR)**.
   - **RPO строго равен интервалу хостового задания бэкапа** (Restic + `pg_dump` на сервере Hetzner CPX42, номинально **6 часов**).
2. **Обязательный DR-дрилл Дня 14**:
   - До созвона сдачи проекта оператор запускает скрипт `docker/bench-memory.sh` и `.specify/scripts/bash/migrate-safe.sh`, проводя тестовое восстановление дампа `pg_dump` в изолированный тестовый контейнер PostgreSQL.

---

## 7. Политика конфиденциальности и GDPR (Data Hygiene)

- **Основание для финансового учета (GDPR Art. 6(1)(c))**: записи `PaymentEvent` и `RefundOperation` классифицируются как бухгалтерский реестр и хранятся в течение установленного законом срока (по умолчанию **5 лет**).
- **30-дневный ретеншн ПДн и заметок (`NFR-004`)**: ночной джоб Inngest (`nightlyPurge`) обнуляет `customerName`, `customerPhone`, `customerEmail`, `customerNotes` и текст тикетов эскалации для завершённых/отменённых заказов старше 30 дней.
- **90-дневный ретеншн Telegram ID и телефонных риск-маркеров**: `customerTgId` и `phoneRiskExpiresAt` автоматически очищаются через 90 дней.
- **7-дневный скраббинг инбокса**: записи `InboxEvent` в статусах `SENT` и `FAILED` старше 7 дней очищают `payloadJson` в пустой объект `{}`.
- **Немедленное право на забвение и редакция в Telegram (`FR-020`)**: эндпоинты `POST /api/admin/users/purge` и `POST /api/admin/orders/[id]/purge` немедленно зачищают ПДн (включая `customerNotes`) в БД и ставят высокоприоритетную (`priority=100`) задачу редактирования сообщений в чате Staff-бота на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`.

---

## 8. Модель угроз STRIDE и меры противодействия

| Угроза (STRIDE) | Вектор атаки | Архитектурное противодействие |
|---|---|---|
| **Spoofing (Подмена)** | Подделка вебхуков, `initData` или нажатий кнопок в группе мастеров | Проверка `X-Telegram-Bot-Api-Secret-Token` (`TELEGRAM_WEBHOOK_SECRET` и `STAFF_WEBHOOK_SECRET`), HMAC-SHA256 `initData`, `X-Hub-Signature-256` и 3-уровневая сверка `authorizeStaffCallback` (`staffDestinationChatId` + `authorizedStaffUserIds` / `STAFF_AUTHORIZED_IDS` / 1-на-1 чат). |
| **Tampering (Искажение)** | Подделка ссылки переноса слота или суммы платежа NOWPayments | Подпись Magic Reschedule Link (`lib/bot/magicReschedule.ts`) через HMAC-SHA256 (`orderId:scheduleVersion:expiresAt:nonce`) + одноразовый `rescheduleTokenHash`; HMAC-SHA512 верификация IPN и правило 99%. |
| **Repudiation (Отказ)** | Несанкционированные действия персонала, разбан или спор по возврату | Структурированное логирование `[STAFF_ACTION]`, `[CLIENT_BLACKLISTED]`, `[CLIENT_UNBLOCKED]` с `actor` и `reason`; неизменяемый `PaymentEvent` и идемпотентный `RefundOperation`. |
| **Information Disclosure** | Утечка ПДн и секретов в логи или остаточные карточки после GDPR-запроса | Расширенный дени-лист в `logger.ts` (`customerNotes`, `phone`, `email`, `rescheduleToken`, `otp`, `initData`, `rawBody`, `payload`), GDPR-редакция `editMessageText` по `/purge` и ночной скраббинг `nightlyPurge`. |
| **Denial of Service** | Комбинаторный взрыв корзины, паразитный холд слотов, 429 бан бота в Telegram | Лимит корзины $\le 10$ услуг и $\le 480$ минут, периметр 403 blacklist до взятия лока, durable Telegram outbox с шейпингом частоты и общим кулдауном `retry_after`. |
---

## 9. Функциональные требования интеграционного контура (Feature 006)

- **FR-601 (OAuth2 Connect)**: Строго OWNER подключает Google Calendar (`/admin/settings`, OPERATOR/PERFORMER → 403) через OAuth2 consent с offline access. Токены шифруются `AES-256-GCM` (`INTEGRATION_ENCRYPTION_KEY`) в `IntegrationCredential.encryptedPayload`. Связь per-resource (`resourceId`) с каскадным удалением (`onDelete: Cascade`).
- **FR-602 (Push: Бронь → GC)**: Асинхронный push через outbox по полной Decision Table (`gcalMapping.ts`): `BOOKED` → создание/обновление события ( Meet-ссылка при `remoteMeetingEnabled=true`), `CANCELLED`/`RELEASED` → удаление события (ошибки 404/410 от Google трактуются как идемпотентный NOOP).
- **FR-603 (Import: GC → Занятость)**: Инкрементальный фоновый sync каждые 15 мин с гранулярным advisory lock per-credential (`gcal_sync_<id>`). События системы с `undresellerOrderId` строго фильтруются (защита от самоблокировки слотов). Сторонняя занятость сохраняется в `ExternalBusyBlock`.
- **FR-604 (Sync Health)**: Статусы `CONNECTED / NEEDS_REAUTH / DISABLED` в админке; `invalid_grant` переводит интеграцию в `NEEDS_REAUTH` + алерт в `STAFF_CHAT_ID`; сбой GC никогда не блокирует приём броней (fail-open для бронирования).
- **FR-605 (ICS Attach)**: Генерация RFC 5545 `.ics` аттача со стабильным UID (`booking-<orderId>@<instance>`) и таймзоной из `ShopSettings.timeZone` в email-подтверждении и отмене.
- **FR-606 (Webhook Registry & Delivery)**: Регистрация до 5 эндпоинтов (OWNER) с шифрованием секретов (`encryptedSecret`) через `secretVault.ts`. Доставка через Inngest (`retries: 5`) с HMAC-SHA256 подписью (`X-Undreseller-Signature`). SSRF socket-level pinning (`undici.Agent`) и Circuit Breaker (авто-отключение при `failureCount >= 10`).
- **FR-607 (Webhook Events)**: События `booking.created`, `confirmed`, `cancelled`, `paid`, `rescheduled` с payload (контакты замаскированы по умолчанию, `pii=masked`).
- **FR-608 (Public Read API)**: `GET /api/public/bookings` с Bearer токеном `PUBLIC_API_KEY`, лимитом 30 req/min и детерминированной пагинацией по compound opaque-курсору `nextCursor`.
- **FR-630..632 (Zod 4 Migration)**: Переход на Zod 4.x exact-pin, механическая миграция по changelog со снапшот-тестами форм 400-ответов (блогер merge при расхождении).
- **NFR-601..605**: Память инстанса $\le 500\text{ MB RSS}$ (пачки sync $\le 50$), задержка слот-расчёта p95 $\le 50$ мс, шифрование секретов в покое, SLA доставки вебхуков $\le 5$ с, supply chain compliance (`googleapis` Apache-2.0).
