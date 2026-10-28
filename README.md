# 🛍️ UnderUndre Modular Commerce & Service Engine (Track 1)

> "Без бумажки — ты какашка, а без воспроизводимого ранбука — твой релиз просто русская рулетка." — Валера  
> "Гладко было на бумаге, да забыли про овраги." — Народная мудрость  
> "Какое ТЗ — такое и ХЗ." — Requirements define outcome quality  
> "Пока не доказано — не ебёт, что сказано." — Презумпция в L1-аудите

**Repository**: `UnderUndre/undreseller`  
**Version**: 2.4.0 (Production Architecture — Track 1 Mono-Engine, Features 004/005 Shipped, 006 Integration Ready)  
**Methodology**: **Diátaxis Framework** (Tutorials, How-To Guides, Reference, Explanation)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering), ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v20.0**

---

## 🧭 Навигационная матрица Diátaxis

```text
                       ПРАКТИКА                         ТЕОРИЯ
            ┌──────────────────────────────┬──────────────────────────────┐
            │ 1. TUTORIALS (Обучение)      │ 4. EXPLANATION (Концепции)   │
            │                              │                              │
ДЕЙСТВИЕ    │ • Быстрый старт за 15 минут  │ • Системная архитектура      │
            │ • Кастомизация витрины и TMA │ • Двухуровневый барьер слотов│
            │ • docs/whitelabel-           │ • Docker Memory Fencing      │
            │   quickstart.md              │ • Scope Knife и Demand Gate  │
            ├──────────────────────────────┼──────────────────────────────┤
            │ 2. HOW-TO GUIDES (Ранбуки)   │ 3. REFERENCE (Справочники)   │
            │                              │                              │
ЗНАНИЕ      │ • Day-14 Onboarding Runbook  │ • API-эндпоинты и коды (409) │
            │ • Аварийный дренаж инбокса   │ • Спецификация .env.example  │
            │ • Беспростойная ротация токена│ • Матрица интеграций         │
            │ • 4-фазные safe-миграции     │ • Схема БД Prisma & GiST     │
            │ • Честный DR-дрилл бэкапа    │ • GDPR & STRIDE периметр     │
            └──────────────────────────────┴──────────────────────────────┘
```

---

## 1. Коммерческие границы и разделение сервисов

### 💼 Параметры коммерческого предложения (Sprint B HERO)
- **Стоимость и таймлайн**: **$4,900 flat fee**, срок выполнения — строго **14 календарных дней** (50% аванс через эскроу Upwork / DocuSeal, 50% финальный релиз в День 14).
- **Продукт 0 (Tripwire / Workaround TCO Audit)**: TDABC-аудит костылей и проектирование системного байпаса (**$350–$490 flat**, SLA 24–48 часов).
- **Demand Gate**: продажа больших форков заблокирована до закрытия **10 оплаченных Workaround TCO Audit**.
- **Scope Knife (Границы поставки)**:
  - Ровно **3 роли**: `OWNER`, `OPERATOR`, `PERFORMER`.
  - Ровно **1 бизнес-процесс**: витрина каталога $\to$ мульти-сервисная корзина с шагом 30 минут $\to$ бронь слота $\to$ согласование/оплата.
  - **Первая бизнес-интеграция**: Google Calendar (двусторонняя sync push/freeBusy, расходует лимит «≤1» бизнес-интеграции). Riders (zod 4, ICS, outbound webhooks, read-only API) — инфраструктурный контур, лимит не расходуют.
- **Гарантии**: 7-дневный Bugfix SLA (устранение блокеров P1/P2 за $< 24$ч) с последующим переходом на поддержку Care Standard ($349/мес).
- **Внимание**: Все легаси-версии признаны устаревшими. Коммерческим источником правды является исключительно **v20.0**.

### 🌐 Сервисная граница с `repos/undrllanding`
- **Маркетинговый лендинг (`repos/undrllanding`)**: живёт в отдельном репозитории `projects/undreseller/`, содержит прогрев лидов, 90-секундное видео Loom, trust-бейджеры Upwork/Salesforce и 2-SKU карточки тарифов ($3,500 FOSS / $4,900 Factory). Внутри `undreseller` маркетинговые лендинги **не создаются и не описываются**.
- **Транзакционный движок (`undreseller`)**: данный репозиторий. Содержит только функционал интернет-магазина, каталог `/catalog`, запись `/book`, чекаут `/checkout`, Telegram Mini App (TMA), служебный бот мастера (`STAFF_BOT_TOKEN`), фоновые очереди Inngest и базу данных.

---

## 2. Системная архитектура и технологический стек

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
│                               │  HTTP Links / TMA   │                               │
│  Host:                        │────────────────────►│  Host:                        │
│   • underundre.com            │  (/book, /catalog)  │   • demo.undreseller.com      │
│   • undreseller.com           │                     │   • shop.underundre.com       │
└───────────────────────────────┘                     └───────────────────────────────┘
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

| Компонент | Технология | Версия / Стандарт | Назначение в архитектуре |
|---|---|---|---|
| **Web Framework** | Next.js 15 (App Router, no `src/`) | `15.2.1` | Серверный рендеринг, API-маршруты, zero-client bundle |
| **Runtime & Language** | Node.js 22 LTS / TypeScript | `5.8.2` | Строгая статическая типизация, ES Modules |
| **Database & Storage** | PostgreSQL 16 + Prisma ORM | `6.4.1` | Реляционная СУБД, расширение `btree_gist`, пул PgBouncer |
| **Job Queue & Timers** | Inngest Cloud + PG Deadline Sweeper | `3.40.1` | Фоновые жизненные циклы с CAS, свиперы, ночной purge |
| **Telegram Bot API** | grammY (Client Bot + Staff Bot) | `1.35.0` | Витрина магазина и пейджер мастера с маскированием ПДн |
| **Telegram Mini App** | @twa-dev/sdk | `8.0.2` | Нативная интеграция TMA: тема, HapticFeedback, MainButton |
| **In-Memory Cache & Limits**| lru-cache | `11.1.0` | Рейт-лимитер 10 req/60s со startup assertion `REPLICA_COUNT=1` |
| **Tokenization & RAG** | js-tiktoken | `1.0.20` | Токенизация `cl100k_base` и локальный полнотекстовый поиск FTS |
| **Schema Validation** | Zod | `3.24.2` | Валидация входных тел запросов и дискриминированных схем |

### Ключевые архитектурные инварианты
1. **Docker Memory Fencing (v18.3)**: лимит памяти контейнера приложения зафиксирован на уровне **$\le 500\text{ MB RAM}$** (`deploy.resources.limits.memory: 500M`). Тяжелые локальные ML-модели, headless-браузеры и внешние микросервисы запрещены.
2. **Двухуровневый барьер слотов (Zero Overbooking)**:
   - *Уровень 1*: транзакционный замок `acquireResourceSlotLock(tx, resourceId)` через `pg_advisory_xact_lock`.
   - *Уровень 2*: аппаратный GiST exclusion constraint `slot_resource_no_overlap` по `("resourceId" WITH =, tstzrange("startTime", "endTime") WITH &&) WHERE status IN ('HELD', 'BOOKED')`. Ошибка PostgreSQL `23P01` маппится в чистый HTTP 409 Conflict.
3. **Защита спящих воркеров Inngest (CAS + `cancelOn`)**:
   - Декларативные матрицы `cancelOn` содержат строго $\le 4$ событий (лимит Inngest).
   - При пробуждении воркер сверяет версию `order.scheduleVersion === event.data.scheduleVersion`. При переносе или отмене заказа воркер мгновенно выходит как no-op.
   - Независимый `deadlineSweeper.ts` сканирует базу PostgreSQL и страхует исполнение дедлайнов при сетевых сбоях Inngest Cloud.
4. **Durable Telegram Dispatcher (`lib/bot/telegramOutbox.ts`)**:
   - Шейпинг частоты (~1 сообщ./с в ЛС, ~20 сообщ./мин в группу `-100...`).
   - Автоматический кулдаун при HTTP 429 по заголовку `retry_after`.
   - Приоритетная очередь с защитой от голодания (`CRITICAL=100` для GDPR-редакции и снятия клавиатуры).
   - Постоянные ошибки Telegram API (`message to edit not found`, `chat not found`, 400/403) обрабатываются как терминальный no-op (`TERMINAL_NO_OP`), предотвращая заклинивание очереди.
5. **Неизменяемость `PaymentEvent` и таблица `RefundOperation`**:
   - Таблица `PaymentEvent` остаётся неизменяемым append-only реестром поступлений. Отрицательные записи запрещены.
   - Возвраты фиксируются только в таблице `RefundOperation` (`TELEGRAM_STARS_REFUND` через `refundStarPayment` и `CRYPTO_REIMBURSEMENT` с 24-часовым регламентным SLA).
6. **Запрет n8n**: внутри клиентских SaaS категорически запрещён n8n во избежание коммерческих лицензионных претензий Sustainable Use License (SUL) на $50,000/год.

---

## 3. Руководство быстрого запуска (Tutorials: 15-Minute Setup)

### Требования к окружению
- **Node.js**: `22.x LTS`
- **PostgreSQL**: `16.x` с поддержкой расширения `btree_gist`
- **Docker & Docker Compose**: для продакшен-развертывания с Traefik v3

### Пошаговая инициализация
```bash
# 1. Клонирование репозитория
git clone https://github.com/UnderUndre/undreseller.git app
cd app

# 2. Подготовка переменных окружения
cp .env.example .env
# Заполните безопасные плейсхолдеры в .env своими учетными данными

# 3. Установка зафиксированных зависимостей
npm install

# 4. Безопасный 4-фазный накат миграций базы данных (через DIRECT_URL)
npm run db:migrate

# 5. Первоначальное наполнение демо-магазина
npm run db:seed

# 6. Запуск статической проверки типов и полного пакета тестов
npm run validate
npm test

# 7. Сборка оптимизированного продакшен-бандла Next.js
npm run build

# 8. Запуск сервера приложения
npm run start
```

---

## 4. Эксплуатационные регламенты оператора (How-To Guides / Runbooks)

### 📋 Протокол сдачи проекта (Day-14 Onboarding Checklist)
Проводится в формате 60-минутного живого созвона с клиентом перед закрытием эскроу Upwork / подписанием акта DocuSeal:
- [ ] **1. Изоляция ключей и проверка интеграционного профиля**: Клиент в присутствии инженера вставляет боевые ключи в хостовый `.env`:
  `TELEGRAM_BOT_TOKEN`, `STAFF_BOT_TOKEN`, `STAFF_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `ADMIN_CHAT_ID`, `AI_API_KEY`. Фаундер не сохраняет ключи локально. Fail-closed чекер блокирует запуск при смешении ключей.
- [ ] **2. Тестовая бронь корзины и Staff-бот**: Оформление комплексной записи из 2 услуг с шагом 30 минут, проверка доставки карточки заказа в `staffDestinationChatId` с маскированным телефоном (`+7 *** *** 4567`) и согласование в 1 клик.
- [ ] **3. Тестовая транзакция**: Проведение боевого платежа минимального номинала (1 Star или $1 в крипте) либо проверка `PAY_ON_SITE`. Подтверждение создания записи `PaymentEvent` и перевода заказа в статус `PAID`.
- [ ] **4. Проверка DR-восстановления**: Демонстрация успешного лога тестового наката дампа в изолированный тестовый контейнер PostgreSQL.
- [ ] **5. Фиксация RPO/RTO**: Клиент под роспись уведомлен, что RPO равен 6 часам (интервал хостового Restic/pg_dump), восстановление — из дампа (не PITR).
- [ ] **6. Подписание приемки**: Релиз эскроу-платежа (остаток 50% = $2,450).

---

### 🚨 Аварийный дренаж очередей при сбое Inngest Cloud (`scripts/drain-inbox.ts`)
**Симптомы**: Зависание событий в статусе `PENDING` в таблице `InboxEvent`, отсутствие ответа на внешние вебхуки или недоступность серверов Inngest Cloud.

1. Подключиться по SSH к хосту приложения.
2. Перейти в корень проекта:
   ```bash
   cd /opt/undreseller
   ```
3. Запустить автономный обработчик в обход Inngest:
   ```bash
   npm run inbox:drain
   ```
4. Скрипт использует атомарный захват лиза в PostgreSQL (`status = 'PROCESSING', lockedAt = now(), lockedBy = workerId`), восстанавливает сайд-эффекты исключительно из сохранённого `payloadJson` и переводит обработанные строки в `SENT` (или `FAILED` при 10 ошибках).
5. Проверить отсутствие зависших строк:
   ```sql
   SELECT count(*) FROM "InboxEvent" WHERE status = 'PENDING';
   ```

---

### 🔑 Беспростойная ротация токена администратора (`ADMIN_TOKEN`)
1. Сгенерировать новый криптостойкий токен: `openssl rand -hex 32`.
2. В файле `.env` на хосте выставить двойной токен через запятую и задать 24-часовой срок грации:
   ```env
   ADMIN_TOKEN="<NEW_TOKEN>,<OLD_TOKEN>"
   ADMIN_OLD_TOKEN_EXPIRES_AT="<NOW + 24 HOURS ISO TIMESTAMP>"
   ```
3. Перезапустить контейнер приложения: `docker compose restart app`. Запросы по старому токену продолжают приниматься с записью предупреждения `[OLD_ADMIN_TOKEN_USED]`.
4. Обновить токен во внешних дашбордах и мониторинге.
5. Через 24 часа оставить в `.env` только новый токен:
   ```env
   ADMIN_TOKEN="<NEW_TOKEN>"
   ADMIN_OLD_TOKEN_EXPIRES_AT=""
   ```
6. Финальный перезапуск: `docker compose restart app`. Старый токен отклоняется с HTTP 401.

---

### 🗄️ Безопасный 4-фазный накат миграций БД (`.specify/scripts/bash/migrate-safe.sh`)
Миграции схемы разделены на 4 изолированных развёртывания (Principle X):
1. **Expand**: добавление nullable колонок и таблиц, снятие NOT NULL с `itemId` без блокировок.
2. **Backfill**: батчевое заполнение `totalDurationMin` и `resourceId` (`LIMIT 500`) с помещением аномальных строк в `SlotReservationQuarantine` без `SET NOT NULL`.
3. **Validate & Cutover**: префлайт-проверка пересечений (`r1.id < r2.id`), добавление `CHECK ... NOT VALID`, валидация отдельной транзакцией и навешивание GiST `slot_resource_no_overlap`.
4. **Contract**: мгновенный метадата-переход `SET NOT NULL` (по валидированному `CHECK`), удаление временных проверок и старого `slot_no_overlap`.

Каждая стадия использует жесткие таймауты `lock_timeout='2s'` и `statement_timeout='5s'`. Запуск выполняется скриптом с 5 экспоненциальными попытками:
```bash
DIRECT_URL="<YOUR_DIRECT_POSTGRES_URL>" .specify/scripts/bash/migrate-safe.sh
```
*При исчерпании 5 попыток деплой безопасно прерывается до смены схемы и требует перевода в регламентное окно.*

---

### 🛡️ Честный Disaster Recovery: RPO, RTO и тестовый дрилл (Zero-Bullshit SLA)
- **Запрет спекуляций о PITR**: В кодовой базе **нет и не заявляется Continuous Point-in-Time Recovery**. Называть 6-часовые дампы термином PITR строго запрещено.
- **Честный RPO**: строго равен интервалу хостового задания Restic / `pg_dump` на сервере Hetzner CPX42 (номинально **6 часов**).
- **Честный RTO**: $\le 30$ минут на развертывание свежего контейнера PostgreSQL и накат дампа.
- **Обязательный DR-дрилл до сдачи проекта**:
  ```bash
  # Запуск бенчмарка памяти и DR-проверки наката дампа:
  ./docker/bench-memory.sh
  ```
  Оператор восстанавливает контрольный дамп в изолированный временный контейнер базы данных и проверяет соответствие количества строк и индексов.

---

### 🔓 Аудируемый разбан клиентов и проведение возвратов
- **Разблокировка клиента**:
  ```bash
  curl -X POST https://shop.client.com/api/admin/users/unblock \
    -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"customerTgId": "12345678", "actor": "admin_ivan", "reason": "Клиент подтвердил согласие с фикс-прайсом"}'
  ```
- **Проведение возврата (Stars или Crypto)**:
  ```bash
  curl -X POST https://shop.client.com/api/admin/orders/<ORDER_ID>/refund \
    -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"kind": "TELEGRAM_STARS_REFUND", "idempotencyKey": "refund_ord1_v1", "amountMinor": 1000, "currency": "XTR", "actor": "operator_anna"}'
  ```

---

## 5. Технический справочник (Reference)

### Реестр ключевых API-маршрутов

| Маршрут | Метод | Авторизация | Описание и статус-коды |
|---|---|---|---|
| `/api/catalog` | `GET` | Публичный | Список активных товаров и услуг витрины. `200 OK`. |
| `/api/booking/slots` | `GET` | Публичный | Расчет доступных непрерывных окон с шагом 30 мин (`?itemIds=id1,id2`). `200 OK`, `400 Bad Request`. |
| `/api/booking/lock` | `POST` | `initData` / RateLimit | Мульти-сервисный холд слота на 15 минут. `201 Created`, `400 Bad Request`, `403 Forbidden` (Blacklist), `409 Conflict` (`23P01`). |
| `/api/checkout` | `POST` | `initData` / RateLimit | Оформление `PAY_ON_SITE`, генерация инвойса Stars или NOWPayments. `200/201 OK`, `400 Bad Request`. |
| `/api/bot/telegram/webhook` | `POST` | `X-Telegram-Secret` | Вебхук клиентского бота (синхронный Stars `pre_checkout_query` и `successful_payment`). |
| `/api/bot/staff/webhook` | `POST` | `X-Telegram-Secret` | Вебхук Staff-бота мастера (`approve`, `reject`, `reschedule`, `blacklist`, `fulfill`). `403` при несовпадении прав. |
| `/api/bot/whatsapp/webhook` | `POST` | `X-Hub-Signature` | Вебхук Meta WhatsApp Cloud API с верификацией подписи. |
| `/api/admin/settings` | `PUT` | Bearer `ADMIN_TOKEN` | Обновление `ShopSettings`, таймингов и профиля интеграций. `200 OK`, `401 Unauthorized`. |
| `/api/admin/users/unblock` | `POST` | Bearer `ADMIN_TOKEN` | Аудируемый разбан Telegram ID или телефона. `200 OK`, `401 Unauthorized`. |
| `/api/admin/users/purge` | `POST` | Bearer `ADMIN_TOKEN` | GDPR-зачистка ПДн клиента + замена сообщений в Telegram на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`. |
| `/api/admin/orders/[id]/refund` | `POST` | Bearer `ADMIN_TOKEN` | Создание и проведение `RefundOperation` без изменения `PaymentEvent`. |
| `/api/health` | `GET` | Публичный | Healthcheck базы данных (`SELECT 1`). `200 OK`, `503 Service Unavailable`. |

### Матрица профилей внешней интеграции (`ENABLED_EXTERNAL_INTEGRATION`)

| Профиль | Разрешённые токены и переменные | Запрещённые переменные | Поведение при нарушении |
|---|---|---|---|
| **`TELEGRAM_BUNDLE`** | `BOT_TOKEN` / `TELEGRAM_BOT_TOKEN`, `STAFF_BOT_TOKEN`, `STAFF_WEBHOOK_SECRET`, `STAFF_CHAT_ID` | `WHATSAPP_*`, `NOWPAYMENTS_*`, любой третий бот-токен | Блокировка запуска (Fail-Closed) |
| **`WHATSAPP`** | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` | `BOT_TOKEN`, `STAFF_BOT_TOKEN`, `NOWPAYMENTS_*` | Блокировка запуска (Fail-Closed) |
| **`NOWPAYMENTS`** | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | `BOT_TOKEN`, `STAFF_BOT_TOKEN`, `WHATSAPP_*` | Блокировка запуска (Fail-Closed) |
| **`NONE`** | Только локальные функции витрины и `PAY_ON_SITE` | Все внешние API-токены мессенджеров и крипты | Блокировка запуска при наличии ключей |

### Политика конфиденциальности и Data Hygiene (GDPR Art. 6)
- **Бухгалтерский реестр (`PaymentEvent`)**: неизменяемый журнал платежей хранится в течение установленного законом срока (по умолчанию 5 лет).
- **30-дневная нуллификация ПДн**: фоновый ночной джоб `nightlyPurge` стирает `customerName`, `customerPhone`, `customerEmail`, `customerNotes` для закрытых и отменённых заказов старше 30 дней.
- **Редакция сообщений в Telegram**: при закрытии заказа или GDPR-запросе бот заменяет текст карточки в чате мастера на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`.
- **90-дневное истечение риск-маркеров**: маркеры риска телефона (`phoneRiskExpiresAt`) автоматически сгорают через 90 дней, исключая вечную блокировку нового владельца рециклированного номера.

---

## 6. Контроль качества и проверка перед релизом (Quality Gates)

Перед отправкой коммита или передачей релиза клиенту обязателен запуск валидационного контура:
```bash
# 1. Проверка типов TypeScript (без эмиссии артефактов)
npm run validate

# 2. Запуск полного набора юнит- и интеграционных тестов
npm test

# 3. Аудит цепочки поставок (проверка на отсутствие несовместимых AGPL/GPL лицензий)
node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf-8"));
const pkgs = lock.packages || {};
for (const [name, meta] of Object.entries(pkgs)) {
  const lic = String(meta.license || "");
  if (/(^|[^L])GPL-3|AGPL/i.test(lic)) throw new Error(`Copyleft license violation: ${name} (${lic})`);
}
console.log("✓ License audit: 0 AGPL/GPL copyleft violations");
'
```