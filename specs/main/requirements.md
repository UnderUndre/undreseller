# System Requirements: Modular E-Commerce Starter (Track 1)

**Repository**: `UnderUndre/undreseller`  
**Version**: 1.0.0  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering) & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**

---

## 1. Product Vision & Commercial Boundary

`undreseller` — флагманский продукт международного инженерного бюро **UnderUndre**:
- **Предложение**: **Sprint B (HERO)** — запуск готового B2B SaaS MVP за 14 календарных дней по фиксированной цене **$4,900 flat fee**.
- **Продукт 0 (Tripwire)**: Архитектурный аудит и проектирование кодовой базы (**$350–$490 flat**, SLA 24–48 часов).
- **Demand Gate**: продажа больших спринтов (Sprint A и B) заблокирована до закрытия **10 оплаченных трипвайров** ($350–$490).
- **Гарантии**: 7-дневный Bugfix SLA (устранение P1/P2 багов за < 24ч) с последующим переходом на поддержку $500–$650/мес.

---

## 2. Technical Stack

| Компонент | Технология | Точная версия / Стандарт | Назначение |
|---|---|---|---|
| **Framework** | Next.js 15 (App Router, no `src/`) | `next@15.2.1` | SSR, API-роуты, статическая генерация |
| **Runtime & Language** | Node.js 22 LTS / TypeScript | `typescript@5.8.2` | Строгая типизация, ESM |
| **Database & ORM** | PostgreSQL 16 + Prisma | `prisma@6.4.1`, `@prisma/client@6.4.1` | Реляционная модель, транзакции |
| **Queue / Background Jobs** | Inngest Cloud | `inngest@3.40.1` | Фоновые свиперы, ретраи, лимиты concurrency |
| **Telegram Bot API** | grammY | `grammy@1.35.0` | Вебхуки, команды, инлайн-кнопки |
| **Telegram Mini App** | @twa-dev/sdk | `@twa-dev/sdk@8.0.2` | Темы, гаптика, безопасные отступы |
| **In-Memory Cache / Limiter** | lru-cache | `lru-cache@11.1.0` | Рейт-лимитер (10 req / 60s на 10k ключей) |
| **Tokenization & RAG** | js-tiktoken | `js-tiktoken@1.0.20` | Токенизация `cl100k_base` (500/50 чанки) |
| **PDF Ingestion** | pdf-parse | `pdf-parse@1.1.1` | Парсинг базы знаний (до 10 MB, до 50 стр) |
| **Schema Validation** | Zod | `zod@3.24.2` | Валидация входных тел и пейлоудов |
| **Edge Proxy** | Traefik v3 | `traefik:v3.3` | Reverse proxy, Auto Let's Encrypt SSL |

---

## 3. Commercial Scope Knife & Architectural Invariants

1. **Запрет n8n внутри клиентских SaaS (SUL License Liability)**:
   - Внутри `undreseller` категорически **запрещён n8n** во избежание лицензионных сборов $50,000/год. Фоновые процессы реализуются кодом через Inngest.
2. **Запрет форков сторонних платформ (Medusa / Payload / SaaS Starters)**:
   - Приложение является специализированным чистым монолитом. Запрещено форкать Medusa, Saleor, Payload Ecommerce или комьюнити-стартеры.
3. **Границы аутентификации v1 (Zero Customer Accounts)**:
   - Публичные посетители не имеют аккаунтов, паролей и профилей.
   - Единственный оператор аутентифицируется через ротируемый Bearer-токен `ADMIN_TOKEN`.
   - Переход к сессионной авторизации (кандидат — Better Auth) возможен только в Phase 2 при наличии $>1$ администратора по Principle IX.
4. **Фиксированный объем (Scope Knife)**:
   - Ровно **2 роли** (посетитель + администратор);
   - Ровно **1 бизнес-процесс** (каталог $\to$ холд слота $\to$ оплата);
   - Ровно **2 платёжных рельса** (Telegram Stars + NOWPayments Crypto). Все остальные рельсы — Phase 2 по $100/час.

---

## 4. Functional Requirements (FR Inventory)

- **FR-01 (Admin Catalog & Shifts CRUD)**: мутации каталога (`Item`) и смен (`WeeklyHours`) защищены `ADMIN_TOKEN`. Все операции пишут структурированный аудит `[ADMIN_ACTION]`. Публичный `/api/catalog` отдаёт только активные позиции.
- **FR-02 (Booking Windows Calculation)**: вычисление свободных окон с вычитанием занятых и активных удерживаемых слотов с учётом перерывов и `minNoticeMin`.
- **FR-03 (Slot Hold & Concurrency Guard)**: атомарный захват 15-минутного слота через advisory-lock и PostgreSQL GiST `slot_no_overlap`. Ошибка `23P01` маппится в HTTP 409.
- **FR-04 (Telegram Webhook & Greeting)**: проверка секретного токена заголовка (403), обработка `/start`, кнопка WebApp, эскалация к менеджеру, отслеживание блокировки бота (`isBlocked`).
- **FR-05 (initData Verification)**: проверка HMAC-SHA256 данных Telegram WebApp, допустимый clock skew $\pm 60$с, максимальный возраст 3600с.
- **FR-06 (WhatsApp Webhook)**: проверка подписи `X-Hub-Signature-256` по сырому телу запроса, отправка только утверждённых шаблонов Meta с экспоненциальным backoff.
- **FR-07 (WhatsApp Cooldown)**: не более одного автоответа на номер в течение 24 часов (`lastAutoReplyAt`).
- **FR-08 (Knowledge Ingestion)**: парсинг `.md` и `.pdf` под жесткими лимитами (10 MB, 50 страниц, максимум 200 чанков) с записью в `KnowledgeChunk.tsv` через `to_tsvector`.
- **FR-09 (FTS Question Answering)**: поиск по `KnowledgeChunk` через `plainto_tsquery` (топ-5, $\le 8\,000$ токенов). Запрет галлюцинаций цен и политик.
- **FR-10 (Deterministic AI Fallback & Escalation)**: тайм-бюджет 8 секунд (primary модель 4с, fallback модель 3с). При двойном сбое — создание `EscalationTicket` и алерт оператору.
- **FR-11 (Telegram Stars Prepayment)**: синхронная обработка в вебхуке; `pre_checkout_query` проверяет холд без списания; списание на `successful_payment` атомарно проводит заказ.
- **FR-12 (NOWPayments Crypto Prepayment)**: верификация `x-nowpayments-sig` (сортировка ключей по ASCII, JSON.stringify, HMAC-SHA512 с `NOWPAYMENTS_IPN_SECRET`), правило недоплаты 99%.
- **FR-13 (PAID Transition & Stock Integrity)**: атомарное списание склада `OrderItem.stockDecremented`. При исчерпании склада заказ не падает, помечается `PAID_OUT_OF_STOCK` для ручного разбора.
- **FR-14 (Durable Inbox Queue & Offline Drain)**: лимит тела запроса 64 KB, валидация дискриминированных схем Zod (до 16 KB), атомарный claim/lease воркера, автономный дренаж `scripts/drain-inbox.ts`.
- **FR-15 (Health Endpoint)**: `/api/health` выполняет `SELECT 1` к базе, возвращает 200 при успехе и 503 при сбое. Секреты и PII не раскрываются.
- **FR-16 (Telemetry & Log Redaction)**: рекурсивный дени-лист токенов, телефонов, email, initData и подписей в `logger.ts`.

---

## 5. Non-Functional Requirements (NFR)

- **NFR-01 (Memory Fencing)**: Потребление памяти контейнера приложения зафиксировано на уровне **$\le 500\text{ MB RAM}$**. Запрещены локальные тяжелые ML-модели, headless-браузеры и векторные СУБД.
- **NFR-02 (Webhook Latency SLA)**: Ответ вебхуков Telegram и WhatsApp отдается быстрее **1.5 секунды** (целевое время < 500 мс). Вызовы LLM выполняются строго асинхронно.
- **NFR-03 (Perimeter Security)**: Все секреты передаются только через environment. Rate limiting (10 req / 60s на 10k ключей) валиден строго при `REPLICA_COUNT=1` (проверяется при старте).
- **NFR-04 (Whitelabel Split)**: Брендовая статика (цвета, логотип, шрифты) задается в коде; цены, расписание, приветствие и шаблон WhatsApp хранятся в базе данных и меняются без пересборки контейнера.
- **NFR-05 (Availability & Operational SLO)**:
  - Целевая доступность контейнера: **99.0%** (ежемесячный бюджет ошибок: 7.2 часа).
  - Целевое время восстановления (**RTO**): **$\le 30$ минут** на перезапуск или пересоздание контейнера.

---

## 6. Регламент Disaster Recovery (Zero-Bullshit SLA)

1. **Честный RPO (Запрет спекуляций о PITR)**:
   - В шаблоне **нет встроенного демона непрерывного резервного копирования (PITR)**. Заявление клиенту о наличии PITR при 6-часовых дампах квалифицируется как обман.
   - **RPO строго равен интервалу хостового задания бэкапа** (Restic + `pg_dump` на сервере Hetzner CPX42, номинально **6 часов**).
2. **Обязательный DR-дрилл Дня 14**:
   - До созвона сдачи проекта оператор запускает скрипт `docker/bench-memory.sh` и проводит тестовое восстановление дампа `pg_dump` в изолированный тестовый контейнер PostgreSQL, сверяя целостность схемы и количество строк.

---

## 7. Политика конфиденциальности и GDPR (Data Hygiene)

- **Основание для финансового учета (GDPR Art. 6(1)(c))**: записи `PaymentEvent` классифицируются как неизменяемый бухгалтерский реестр и хранятся в течение установленного законом срока (переменная `PAYMENT_LEDGER_RETENTION_YEARS`, по умолчанию **5 лет**).
- **30-дневный ретеншн ПДн**: ночной джоб Inngest (`nightlyPurge`) обнуляет `customerName`, `customerPhone`, `customerEmail` и текст тикетов эскалации для завершенных заказов старше 30 дней.
- **90-дневный ретеншн Telegram ID**: `customerTgId` сохраняется как сервисный ключ до 90 дней, после чего также нуллифицируется.
- **7-дневный скраббинг инбокса**: записи `InboxEvent` в статусах `SENT` и `FAILED` старше 7 дней очищают `payloadJson` в пустой объект `{}`. Незавершённые события (`PENDING`, `PROCESSING`) не затрагиваются.
- **Немедленное право на забвение**: эндпоинт `POST /api/admin/users/purge` немедленно зачищает ПДн в `Order`, `MessengerContact` и канонических полях `InboxEvent.payloadJson`.

---

## 8. Модель угроз STRIDE и меры противодействия

| Угроза (STRIDE) | Вектор атаки | Архитектурное противодействие |
|---|---|---|
| **Spoofing (Подмена)** | Подделка вызовов вебхуков или сессий Telegram | Проверка `X-Telegram-Bot-Api-Secret-Token`, HMAC-SHA256 для `initData` и `X-Hub-Signature-256` для WhatsApp. |
| **Tampering (Искажение)** | Подделка суммы платежа или подписи IPN | Валидация подписи NOWPayments IPN через HMAC-SHA512 от отсортированных ключей; проверка правила 99% суммы. |
| **Repudiation (Отказ)** | Заявление клиента о несовершении оплаты | Персистентный журнал `PaymentEvent` с уникальным индексом `@@unique([provider, providerRef])`. |
| **Information Disclosure** | Утечка API-ключей, токенов ботов и ПДн в логи | Дени-лист в `logger.ts`, вырезающий ключи авторизации, пароли, телефоны, email и сырые вебхуки. |
| **Denial of Service** | OOM-атака через гигантские вебхуки или PDF-бомбы | Ограничение сырого тела вебхуков 64 KB, лимит PDF 10 MB / 50 стр, потолок базы знаний 200 чанков. |
| **Elevation of Privilege** | Неавторизованный доступ к админским маршрутам | Bearer-аутентификация с постоянным по времени сравнением `timingSafeEqual`; fail-closed при отсутствии токена. |
