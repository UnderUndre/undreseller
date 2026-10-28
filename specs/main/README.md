# 📚 UnderUndre Modular Commerce — Documentation Hub

**Repository**: `UnderUndre/undreseller`  
**Version**: 2.4.0 (`001`+`002`+`003.1` actualized, `004` & `005` shipped, `006-integrations` specced & reviewed PASS per Principle VI)  
**Product**: Sprint B (HERO) — 14-Day SaaS MVP & Sovereign Commerce Factory ($4,900 flat)  
**Methodology**: **Diátaxis Framework** (Tutorials, How-To, Reference, Explanation)  
**Compliance Standards**: ISO/IEC/IEEE 29148:2018, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v20.0**

---

## 🧭 Навигационная карта документации (Diátaxis Matrix)

```text
                       ПРАКТИКА                         ТЕОРИЯ
            ┌──────────────────────────────┬──────────────────────────────┐
            │ 1. TUTORIALS (Обучение)      │ 4. EXPLANATION (Концепции)   │
            │                              │                              │
ДЕЙСТВИЕ    │ • Руководство быстрого пуска │ • Системная архитектура v2.1 │
            │   docs/whitelabel-           │   specs/main/                │
            │   quickstart.md              │   architecture.md            │
            │ • Регламент ручного QA       │ • Операционное ядро v3       │
            │   docs/manual-qa-            │   specs/003-commerce-        │
            │   test-cases.md              │   operations-capability-packs│
            ├──────────────────────────────┼──────────────────────────────┤
            │ 2. HOW-TO GUIDES (Ранбуки)   │ 3. REFERENCE (Справочники)   │
            │                              │                              │
ЗНАНИЕ      │ • Day-14 Onboarding Checklist│ • Системные требования v2.1  │
            │ • Дренаж очередей (CLI/API)  │   specs/main/requirements.md │
            │ • Непрерывность Inngest/CAS  │ • Схема данных Prisma        │
            │ • 4-фазная миграция БД       │   prisma/schema.prisma       │
            │ • Разблокировка и возвраты   │ • Матрица совместимости DDL  │
            └──────────────────────────────┴──────────────────────────────┘
```

---

## 1. Tutorials (Обучение, быстрый старт и ручной QA)
- **[`docs/whitelabel-quickstart.md`](../../docs/whitelabel-quickstart.md)**:
  - Пошаговое развёртывание витрины с нуля за 15 минут.
  - Настройка брендинга, логотипа и цветовой палитры в `config/shop.config.ts`.
  - Выбор профиля внешней интеграции (`ENABLED_EXTERNAL_INTEGRATION`: `TELEGRAM_BUNDLE`, `WHATSAPP`, `NOWPAYMENTS`, `NONE`).
  - Запуск базы данных, выполнение миграций (`npm run db:migrate`) и наполнение демо-магазина (`npm run db:seed`).
- **[`docs/manual-qa-test-cases.md`](../../docs/manual-qa-test-cases.md)** и **[specs/002-service-cart-and-staff-bot/checklists/00-START-HERE.md](../002-service-cart-and-staff-bot/checklists/00-START-HERE.md)**:
  - Полный регламент ручного и автоматизированного регрессионного тестирования (35 тест-кейсов: 5 браузерных `TC-WEB-01..05`, 11 Telegram-кейсов `TC-BOT-CLIENT-01..04` и `TC-BOT-STAFF-01..06`, возвраты `TC-PAY-01` и 19 bash-скриптов в `specs/002-service-cart-and-staff-bot/checklists/scripts/`).
  - Автоматическая регистрация вебхуков обоих ботов через `specs/002-service-cart-and-staff-bot/checklists/scripts/_setup-webhooks.sh` или `setup-webhooks.ps1`.

---

## 2. How-To Guides (Эксплуатационные регламенты оператора)

### 📋 Протокол сдачи проекта (Day-14 Onboarding Checklist)
Проводится в формате 60-минутного живого созвона с клиентом перед закрытием эскроу Upwork / подписанием акта DocuSeal:
- [ ] **1. Изоляция ключей и проверка профиля интеграции**: Клиент в присутствии инженера вставляет боевые ключи в хостовое окружение согласно выбранному профилю (`ENABLED_EXTERNAL_INTEGRATION="TELEGRAM_BUNDLE"` $\to$ `TELEGRAM_BOT_TOKEN` + `STAFF_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `STAFF_WEBHOOK_SECRET`, `STAFF_CHAT_ID`, `STAFF_AUTHORIZED_IDS`, `ADMIN_TOKEN`, `ADMIN_CHAT_ID`, `AI_API_KEY`). Fail-closed валидатор (`lib/config/integrationProfile.ts`) блокирует смешанные ключи разных контуров и любой третий бот-токен.
- [ ] **2. Тестовая бронь корзины услуг и Staff-бот**: Оформление комплексной записи из 2–3 услуг с шагом 30 минут, указанием пожеланий (`customerNotes`) и контактов мессенджеров (`customerTgUsername`, `hasWhatsApp`, `hasTelegram`). Проверка прихода карточки в `staffDestinationChatId` (или `STAFF_CHAT_ID`), работы 6 инлайн-кнопок (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Заказ выполнен]`, `[Копировать контакты]`) и автогенерации шаблонного текста ответа клиенту (`formatMasterTemplate`).
- [ ] **3. Тестовая транзакция / Pay-On-Site**: Проведение тестового заказа через `PAY_ON_SITE` либо боевого платежа минимального номинала (1 Star или $1 в крипте) с проверкой `PaymentEvent` и прихода карточки товара/услуги мастеру.
- [ ] **4. Проверка DR-восстановления и 4-фазной миграции**: Демонстрация лога успешного тестового наката дампа и `.specify/scripts/bash/migrate-safe.sh` в изолированный тестовый контейнер PostgreSQL.
- [ ] **5. Фиксация RPO/RTO**: Клиент уведомлен, что RPO равен 6 часам (интервал хостового Restic/pg_dump), восстановление — из дампа (не PITR).
- [ ] **6. Подписание приемки**: Релиз эскроу-платежа (остаток 50% = $2,450).

### 🚨 Обработка очереди `InboxEvent` и аварийный дренаж (`inboxPoller.ts`, CLI и Admin API)
Обработка входящих/исходящих событий `InboxEvent` (`TELEGRAM_UPDATE`, `TELEGRAM_OUTBOUND`, `STAFF_BOT_OUTBOUND`, `SYSTEM_ALERT`) застрахована тремя независимыми механизмами:
1. **Встроенный фоновый поллер (`lib/jobs/inboxPoller.ts`)**: автоматически запускается при старте сервера Next.js через `instrumentation.ts` и опрашивает таблицу `InboxEvent` каждые **5 секунд** (пачками по 10 записей), не требуя внешнего Inngest Cloud для базовой доставки сообщений и обработки колбэков.
2. **CLI-дренаж по SSH (`scripts/drain-inbox.ts` / `scripts/drain-inbox-mjs.mjs`)**:
   ```bash
   cd /opt/undreseller
   npm run inbox:drain
   ```
3. **Админский HTTP-эндпоинт (`POST /api/admin/tools/drain-inbox`)**:
   ```bash
   curl -X POST http://localhost:3000/api/admin/tools/drain-inbox \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```
   Атомарно захватывает и обрабатывает до 100 записей `PENDING`, возвращая JSON-отчёт `{ summary: { total, drained, failed }, results }`.

*Подробный регламент восстановления дедлайнов напоминаний, автоотмен и 15-минутных счетов, а также миграции на self-hosted Inngest приведён в [`docs/inngest-continuity-runbook.md`](../../docs/inngest-continuity-runbook.md).*

### 🗄 Безопасный накат миграций БД (`.specify/scripts/bash/migrate-safe.sh`)
Все изменения схемы выполняются по 4-фазному стандарту **Expand $\to$ Backfill $\to$ Validate/Cutover $\to$ Contract** с барьерами `SET lock_timeout = '2s'` и `SET statement_timeout = '5s'` и до 5 ретраев с экспоненциальным backoff (`scripts/migrate.ts`), включая миграцию контактных полей клиента `20261020140000_add_client_contact_fields`:
```bash
DIRECT_URL="postgresql://..." .specify/scripts/bash/migrate-safe.sh
```
*Матрица обратной совместимости и результаты бенчмарка на снимке v1 задокументированы в [specs/002-service-cart-and-staff-bot/migration-compatibility-matrix.md](../002-service-cart-and-staff-bot/migration-compatibility-matrix.md).*

### 🔓 Разблокировка клиента, GDPR-зачистка и проведение возвратов
- **Аудируемый разбан клиента**: `POST /api/admin/users/unblock` (требует Bearer `ADMIN_TOKEN`, `actor`, `reason`, `customerTgId` или `phone`). Сбрасывает `isBlocked` и записывает событие `[CLIENT_UNBLOCKED]`.
- **Право на забвение (GDPR Purge)**: `POST /api/admin/users/purge` и `POST /api/admin/orders/[id]/purge` обнуляют ПДн заказа (`customerName`, `customerPhone`, `customerEmail`, `customerTgId`, `customerNotes`), очищают `MessengerContact` / `InboxEvent` и ставят задачу приоритета `CRITICAL_GDPR_AND_MARKUP (100)` на замену текста карточки в чате Staff-бота строкой `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`.
- **Провайдер-изолированный возврат средств**: `POST /api/admin/orders/[id]/refund` (требует `idempotencyKey`, `kind: 'TELEGRAM_STARS_REFUND' | 'CRYPTO_REIMBURSEMENT'`, `actor`). Создаёт и проводит `RefundOperation`, оставляя `PaymentEvent` неизменяемым.

### 🔑 Процедура бесшовной ротации `ADMIN_TOKEN`
1. Сгенерировать новый токен `NEW_TOKEN`.
2. Установить в `.env`: `ADMIN_TOKEN="NEW_TOKEN,OLD_TOKEN"` и `ADMIN_OLD_TOKEN_EXPIRES_AT="<NOW + 24 HOURS>"`.
3. Перезагрузить сервис: запросы по старому токену продолжают работать, логируя предупреждение `[OLD_ADMIN_TOKEN_USED]`.
4. Обновить интеграции на клиентах.
5. Через 24 часа оставить только `ADMIN_TOKEN="NEW_TOKEN"` и очистить переменную срока грации.

---

## 3. Reference (Технические справочники)
- **[`specs/main/requirements.md`](requirements.md)**: Свод функциональных требований (`FR-01`–`FR-16` и `FR-101`–`FR-124`), нефункциональных требований (`NFR-01`–`NFR-07`), матрицы конечного автомата заказов, честного SLA и модели угроз STRIDE.
- **[`prisma/schema.prisma`](../../prisma/schema.prisma)**: Полная реляционная схема базы данных с перечислениями, `Order` (`customerTgUsername`, `hasWhatsApp`, `hasTelegram`), `SlotReservation` (`resourceId`), `RefundOperation`, `TelegramRateState` и констрейнтами.
- **[`.env.example`](../../.env.example)**: Справочник всех переменных окружения (включая `STAFF_CHAT_ID`, `STAFF_AUTHORIZED_IDS`, `INNGEST_EVENT_KEY`, `ENABLED_EXTERNAL_INTEGRATION`).
- **[`config/shop.config.ts`](../../config/shop.config.ts)**: Конфигурация брендинга, таймзоны (`Asia/Yerevan`), FTS (`simple`) и правил санитизации приветствия.
- **[specs/006-integrations/spec.md](../006-integrations/spec.md)**: Спецификация интеграционного контура (Google Calendar двусторонняя sync, ICS-аттач, Outbound Webhooks с HMAC/SSRF/Circuit Breaker, Public Read API, миграция Zod 4).
- **[specs/006-integrations/contracts/gcal-adapter.md](../006-integrations/contracts/gcal-adapter.md)**: Контракт Google Calendar адаптера (FSM→GC Decision Table, 404/410 NOOP, per-credential advisory lock).
- **[specs/006-integrations/contracts/outbound-webhooks.md](../006-integrations/contracts/outbound-webhooks.md)**: Контракт исходящих вебхуков (Event Envelope, HMAC подпись, SSRF socket-level pinning, Public Read API с пагинацией `nextCursor`).

---

## 4. Explanation & Architecture Records
- **[`specs/main/architecture.md`](architecture.md)**:
  - Топология шлюза Traefik v3 и изоляция сетей `web_gateway` / `backend_network`.
  - Серверная инициализация через `instrumentation.ts`: кэширование метаданных ботов в `globalThis` (`lib/bot/botManager.ts`) и встроенный 5-секундный поллер `lib/jobs/inboxPoller.ts` + процессор `lib/jobs/inboxProcessor.ts`.
  - Мульти-сервисная корзина (`CartDrawer`), сетка 30 минут, учёт истории по телефону/Telegram ID/`@username` и ресурсный барьер конкуренции слотов: `acquireResourceSlotLock` + PostgreSQL GiST `slot_resource_no_overlap`.
  - Архитектура выделенного Telegram Staff-бота (`STAFF_BOT_TOKEN`), 3-уровневая авторизация мастера (`authorizedStaffUserIds` $\to$ `STAFF_AUTHORIZED_IDS` $\to$ личный чат), 6 кнопок карточки (включая `📋 Копировать контакты`), генерация шаблонов ответов мастеру (`formatMasterTemplate`), серверный модуль переноса `lib/bot/magicReschedule.ts` и GDPR-редакция сообщений по запросу `/purge`.
  - Локальный FTS RAG-движок (`lib/ai/documentParser.ts`, `lib/ai/knowledgeEngine.ts`) с защитой от prompt-injection и каскадом моделей (`4s primary -> 3s fallback -> 8s total`).
  - Защита спящих воркеров Inngest через `cancelOn` ($\le 4$ событий) + `scheduleVersion` CAS, независимый PostgreSQL deadline sweeper и durable Telegram outbox с шейпингом и защитой от 429 rate-limit.
  - Стандарт **Docker Memory Fencing (v18.3)** на сервере Hetzner CPX42 (лимит $\le 500\text{ MB RAM}$ на контейнер приложения).
  - **Платёжная топология (004/005)**: провайдер-нейтральный контракт `lib/payments/providerContract.ts` с реестром адаптеров (NOWPayments, Telegram Stars, **Stripe Hosted Checkout**), zero-provider семантика `PAYMENT_PROVIDERS`, атомарный вебхук Stripe (`prisma.$transaction`: InboxEvent-дедуп + FSM).
  - **Sovereign auth (005)**: Argon2id (сериализация мьютексом, пик RSS ≤500 MB), мгновенный отзыв сессий `sessionEpoch` (Model A), двухфазный per-IP anti-bruteforce, auth-аудит с PII-редакцией.
  - **Chrome-дизайн (005 polish)**: хедер без дублирующих нав-кнопок (каталог = главная), dropdown-пиклисты локали и темы (system/light/dark, anti-FOUC), Geist-типографика, ноль эмодзи.
