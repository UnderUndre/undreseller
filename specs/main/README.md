# 📚 UnderUndre Modular Commerce — Documentation Hub

**Repository**: `UnderUndre/undreseller`  
**Product**: Sprint B (HERO) — 14-Day SaaS MVP & Sovereign Commerce Factory ($4,900 flat)  
**Methodology**: **Diátaxis Framework** (Tutorials, How-To, Reference, Explanation)  
**Compliance Standards**: ISO/IEC/IEEE 29148:2018 & NIST SP 800-218 SSDF

---

## 🧭 Навигационная карта документации (Diátaxis Matrix)

```text
                       ПРАКТИКА                         ТЕОРИЯ
            ┌──────────────────────────────┬──────────────────────────────┐
            │ 1. TUTORIALS (Обучение)      │ 4. EXPLANATION (Концепции)   │
            │                              │                              │
ДЕЙСТВИЕ    │ • Руководство быстрого пуска │ • Системная архитектура      │
            │   docs/whitelabel-           │   specs/main/                │
            │   quickstart.md              │   architecture.md            │
            ├──────────────────────────────┼──────────────────────────────┤
            │ 2. HOW-TO GUIDES (Ранбуки)   │ 3. REFERENCE (Справочники)   │
            │                              │                              │
ЗНАНИЕ      │ • Day-14 Onboarding Checklist│ • Системные требования       │
            │ • Аварийный дренаж очередей  │   specs/main/requirements.md │
            │ • Ротация ADMIN_TOKEN        │ • Схема данных Prisma        │
            │ • Тестовый DR-дрилл БД       │   prisma/schema.prisma       │
            └──────────────────────────────┴──────────────────────────────┘
```

---

## 1. Tutorials (Обучение и быстрый старт)
- **[`docs/whitelabel-quickstart.md`](../../docs/whitelabel-quickstart.md)**:
  - Пошаговое развёртывание витрины с нуля за 15 минут.
  - Настройка брендинга, логотипа и цветовой палитры в `config/shop.config.ts`.
  - Запуск базы данных, выполнение начальной миграции и наполнение демо-магазина (`npm run db:seed`).

---

## 2. How-To Guides (Эксплуатационные регламенты оператора)

### 📋 Протокол сдачи проекта (Day-14 Onboarding Checklist)
Проводится в формате 60-минутного живого созвона с клиентом перед закрытием эскроу Upwork / подписанием акта DocuSeal:
- [ ] **1. Изоляция ключей**: Клиент в присутствии инженера вставляет боевые ключи в хостовое окружение: `TELEGRAM_BOT_TOKEN`, `WHATSAPP_APP_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `ADMIN_TOKEN`, `ADMIN_CHAT_ID`, `AI_API_KEY`. Фаундер не сохраняет ключи локально.
- [ ] **2. Тестовая транзакция**: Проведение боевого платежа минимального номинала (1 Star или $1 в крипте) на тестовом товаре.
- [ ] **3. Подтверждение вебхука**: Визуальная фиксация строки в таблице `PaymentEvent` и перевод заказа в статус `PAID` на экране.
- [ ] **4. Проверка DR-восстановления**: Демонстрация лога успешного тестового наката дампа в изолированный тестовый контейнер PostgreSQL.
- [ ] **5. Фиксация RPO/RTO**: Клиент уведомлен, что RPO равен 6 часам (интервал хостового Restic/pg_dump), восстановление — из дампа (не PITR).
- [ ] **6. Подписание приемки**: Релиз эскроу-платежа (остаток 50% = $2,450).

### 🚨 Аварийный сброс очереди сообщений (`scripts/drain-inbox.ts`)
При сбое или недоступности Inngest Cloud оператор выполняет ручной дренаж очереди в обход облака:
```bash
# 1. Подключиться по SSH к хосту приложения
# 2. Перейти в директорию приложения:
cd /opt/undreseller

# 3. Запустить автономный обработчик инбокса:
npm run inbox:drain
```
*Утилита использует атомарный claim/lease на уровне PostgreSQL и воспроизводит сайд-эффекты исключительно из сохранённого `payloadJson`.*

### 🔑 Процедура бесшовной ротации `ADMIN_TOKEN`
1. Сгенерировать новый токен `NEW_TOKEN`.
2. Установить в `.env`: `ADMIN_TOKEN="NEW_TOKEN,OLD_TOKEN"` и `ADMIN_OLD_TOKEN_EXPIRES_AT="<NOW + 24 HOURS>"`.
3. Перезагрузить сервис: запросы по старому токену продолжают работать, логируя предупреждение `[OLD_ADMIN_TOKEN_USED]`.
4. Обновить интеграции на клиентах.
5. Через 24 часа оставить только `ADMIN_TOKEN="NEW_TOKEN"` и очистить переменную срока грации.

---

## 3. Reference (Технические справочники)
- **[`specs/main/requirements.md`](requirements.md)**: Свод функциональных требований (FR-01 – FR-16), нефункциональных требований (NFR-01 – NFR-05), честного SLA и модели угроз STRIDE.
- **[`prisma/schema.prisma`](../../prisma/schema.prisma)**: Полная реляционная схема базы данных с перечислениями, индексами и констрейнтами.
- **[`.env.example`](../../.env.example)**: Справочник всех переменных окружения с описанием форматов.
- **[`config/shop.config.ts`](../../config/shop.config.ts)**: Конфигурация брендинга, таймзоны, FTS и правил санитизации.

---

## 4. Explanation & Architecture Records
- **[`specs/main/architecture.md`](architecture.md)**:
  - Топология шлюза Traefik v3 и изоляция сетей `web_gateway` / `backend_network`.
  - Двухуровневый барьер конкуренции слотов: `pg_advisory_xact_lock` + PostgreSQL GiST `slot_no_overlap`.
  - Синхронный жизненный цикл платежей Telegram Stars (`pre_checkout_query` vs `successful_payment`).
  - Стандарт **Docker Memory Fencing (v18.3)** на сервере Hetzner CPX42 (лимит 500 MB RAM на контейнер приложения).
