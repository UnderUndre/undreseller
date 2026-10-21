# 📚 UnderUndre Modular Commerce — Documentation Hub

**Repository**: `UnderUndre/undreseller`  
**Version**: 2.0.0 (`001-modular-commerce-template` + `002-service-cart-and-staff-bot`)  
**Product**: Sprint B (HERO) — 14-Day SaaS MVP & Sovereign Commerce Factory ($4,900 flat)  
**Methodology**: **Diátaxis Framework** (Tutorials, How-To, Reference, Explanation)  
**Compliance Standards**: ISO/IEC/IEEE 29148:2018, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF

---

## 🧭 Навигационная карта документации (Diátaxis Matrix)

```text
                       ПРАКТИКА                         ТЕОРИЯ
            ┌──────────────────────────────┬──────────────────────────────┐
            │ 1. TUTORIALS (Обучение)      │ 4. EXPLANATION (Концепции)   │
            │                              │                              │
ДЕЙСТВИЕ    │ • Руководство быстрого пуска │ • Системная архитектура v2   │
            │   docs/whitelabel-           │   specs/main/                │
            │   quickstart.md              │   architecture.md            │
            ├──────────────────────────────┼──────────────────────────────┤
            │ 2. HOW-TO GUIDES (Ранбуки)   │ 3. REFERENCE (Справочники)   │
            │                              │                              │
ЗНАНИЕ      │ • Day-14 Onboarding Checklist│ • Системные требования v2    │
            │ • Аварийный дренаж очередей  │   specs/main/requirements.md │
            │ • Непрерывность Inngest/CAS  │ • Схема данных Prisma        │
            │ • 4-фазная миграция БД       │   prisma/schema.prisma       │
            │ • Разблокировка и возвраты   │ • Матрица совместимости DDL  │
            └──────────────────────────────┴──────────────────────────────┘
```

---

## 1. Tutorials (Обучение и быстрый старт)
- **[`docs/whitelabel-quickstart.md`](../../docs/whitelabel-quickstart.md)**:
  - Пошаговое развёртывание витрины с нуля за 15 минут.
  - Настройка брендинга, логотипа и цветовой палитры в `config/shop.config.ts`.
  - Выбор профиля внешней интеграции (`ENABLED_EXTERNAL_INTEGRATION`: `TELEGRAM_BUNDLE`, `WHATSAPP`, `NOWPAYMENTS`, `NONE`).
  - Запуск базы данных, выполнение 4-фазных миграций и наполнение демо-магазина (`npm run db:seed`).

---

## 2. How-To Guides (Эксплуатационные регламенты оператора)

### 📋 Протокол сдачи проекта (Day-14 Onboarding Checklist)
Проводится в формате 60-минутного живого созвона с клиентом перед закрытием эскроу Upwork / подписанием акта DocuSeal:
- [ ] **1. Изоляция ключей и проверка профиля интеграции**: Клиент в присутствии инженера вставляет боевые ключи в хостовое окружение согласно выбранному профилю (`ENABLED_EXTERNAL_INTEGRATION="TELEGRAM_BUNDLE"` $\to$ `TELEGRAM_BOT_TOKEN` + `STAFF_BOT_TOKEN`, `STAFF_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `ADMIN_CHAT_ID`, `AI_API_KEY`). Fail-closed валидатор (`lib/config/integrationProfile.ts`) блокирует смешанные ключи разных контуров.
- [ ] **2. Тестовая бронь корзины услуг и Staff-бот**: Оформление комплексной записи из 2–3 услуг с шагом 30 минут, проверка прихода карточки в `staffDestinationChatId` с маскированным телефоном (`+7 *** *** 4567`) и подтверждение в 1 клик.
- [ ] **3. Тестовая транзакция / Pay-On-Site**: Проведение тестового заказа через `PAY_ON_SITE` либо боевого платежа минимального номинала (1 Star или $1 в крипте) с проверкой `PaymentEvent`.
- [ ] **4. Проверка DR-восстановления и 4-фазной миграции**: Демонстрация лога успешного тестового наката дампа и `.specify/scripts/bash/migrate-safe.sh` в изолированный тестовый контейнер PostgreSQL.
- [ ] **5. Фиксация RPO/RTO**: Клиент уведомлен, что RPO равен 6 часам (интервал хостового Restic/pg_dump), восстановление — из дампа (не PITR).
- [ ] **6. Подписание приемки**: Релиз эскроу-платежа (остаток 50% = $2,450).

### 🚨 Аварийный сброс очереди сообщений (`scripts/drain-inbox.ts`) и сверка дедлайнов (`docs/inngest-continuity-runbook.md`)
При сбое или недоступности Inngest Cloud оператор выполняет ручной дренаж очереди и сверку просроченных таймеров напрямую из PostgreSQL:
```bash
# 1. Подключиться по SSH к хосту приложения и перейти в директорию:
cd /opt/undreseller

# 2. Запустить автономный обработчик инбокса и Telegram-аутбокса:
npm run inbox:drain
```
*Подробный регламент восстановления дедлайнов напоминаний, автоотмен и 15-минутных счетов, а также миграции на self-hosted Inngest приведён в [`docs/inngest-continuity-runbook.md`](../../docs/inngest-continuity-runbook.md).*

### 🗄 Безопасный накат 4-фазных миграций БД (`.specify/scripts/bash/migrate-safe.sh`)
Все изменения схемы выполняются по 4-фазному стандарту **Expand $\to$ Backfill $\to$ Validate/Cutover $\to$ Contract** с барьерами `SET lock_timeout = '2s'` и `SET statement_timeout = '5s'` и до 5 ретраев с экспоненциальным backoff:
```bash
DIRECT_URL="postgresql://..." .specify/scripts/bash/migrate-safe.sh
```
*Матрица обратной совместимости и результаты бенчмарка на снимке v1 задокументированы в [`specs/002-service-cart-and-staff-bot/migration-compatibility-matrix.md`](../002-service-cart-and-staff-bot/migration-compatibility-matrix.md).*

### 🔓 Разблокировка клиента и проведение возвратов
- **Аудируемый разбан клиента**: `POST /api/admin/users/unblock` (требует Bearer `ADMIN_TOKEN`, `actor`, `reason`, `customerTgId` или `phone`). Сбрасывает `isBlocked` и записывает событие `[CLIENT_UNBLOCKED]`.
- **Провайдер-изолированный возврат средств**: `POST /api/admin/orders/[id]/refund` (требует `idempotencyKey`, `kind: 'TELEGRAM_STARS_REFUND' | 'CRYPTO_REIMBURSEMENT'`, `actor`). Создаёт и проводит `RefundOperation`, оставляя `PaymentEvent` неизменяемым.

### 🔑 Процедура бесшовной ротации `ADMIN_TOKEN`
1. Сгенерировать новый токен `NEW_TOKEN`.
2. Установить в `.env`: `ADMIN_TOKEN="NEW_TOKEN,OLD_TOKEN"` и `ADMIN_OLD_TOKEN_EXPIRES_AT="<NOW + 24 HOURS>"`.
3. Перезагрузить сервис: запросы по старому токену продолжают работать, логируя предупреждение `[OLD_ADMIN_TOKEN_USED]`.
4. Обновить интеграции на клиентах.
5. Через 24 часа оставить только `ADMIN_TOKEN="NEW_TOKEN"` и очистить переменную срока грации.

---

## 3. Reference (Технические справочники)
- **[`specs/main/requirements.md`](requirements.md)**: Свод функциональных требований (`FR-01`–`FR-16` и `FR-101`–`FR-122`), нефункциональных требований (`NFR-01`–`NFR-07`), матрицы конечного автомата заказов, честного SLA и модели угроз STRIDE.
- **[`prisma/schema.prisma`](../../prisma/schema.prisma)**: Полная реляционная схема базы данных с перечислениями, `SlotReservation` (`resourceId`), `RefundOperation`, `TelegramRateState` и констрейнтами.
- **[`.env.example`](../../.env.example)**: Справочник всех переменных окружения с описанием форматов и контуров интеграций.
- **[`config/shop.config.ts`](../../config/shop.config.ts)**: Конфигурация брендинга, таймзоны, FTS и правил санитизации.

---

## 4. Explanation & Architecture Records
- **[`specs/main/architecture.md`](architecture.md)**:
  - Топология шлюза Traefik v3 и изоляция сетей `web_gateway` / `backend_network`.
  - Мульти-сервисная корзина (`CartDrawer`), сетка 30 минут и ресурсный барьер конкуренции слотов: `acquireResourceSlotLock` + PostgreSQL GiST `slot_resource_no_overlap`.
  - Архитектура выделенного Telegram Staff-бота (`STAFF_BOT_TOKEN`), разделение `staffDestinationChatId` и `authorizedStaffUserIds`, одноразовые ссылки переноса (Magic Reschedule Link) и GDPR-редакция сообщений в чатах.
  - Защита спящих воркеров Inngest через `cancelOn` ($\le 4$ событий) + `scheduleVersion` CAS, независимый PostgreSQL deadline sweeper и durable Telegram outbox с шейпингом и защитой от 429 rate-limit.
  - Стандарт **Docker Memory Fencing (v18.3)** на сервере Hetzner CPX42 (лимит $\le 500\text{ MB RAM}$ на контейнер приложения).
