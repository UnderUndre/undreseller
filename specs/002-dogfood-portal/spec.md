# Feature Specification: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Feature Branch**: `002-dogfood-portal`  
**Created**: 2026-10-05  
**Status**: Approved (Executable Spec)  
**Input**: Business Plan `undreseller-business-plan.md` v18.3 & Live Dogfooding Architecture (Twenty CRM, Outline, Plane, Chatwoot, Cal.com, Authentik, Supabase RLS, Trigger.dev v3)

---

## 📖 Executive Summary & Core Concept

**UnderUndre** (`underundre.com`) — международное инженерное бюро Productized Engineering & Turnkey B2B Systems.
Портал построен на принципе **100% Dogfooding («Skin in the Game»)**: все сервисы, которые бюро продает клиентам (Sprint A: $3,500 + $500/mo FOSS Office Stack на Hetzner CPX42), развернуты и используются самим бюро для собственной операционной деятельности 24/7. Посетители сайта могут взаимодействовать с живыми инстансами (CRM, чат поддержки, бронирование звонков, база знаний, таск-трекер) прямо в процессе изучения предложений.

## 📌 Clarifications

### Session 2026-10-05
- **Q:** Какой селф-хостед CRM-движок использовать как основной для dogfooded-инфраструктуры? → **A:** **Twenty CRM (`twentyhq/twenty`)** на TypeScript/NestJS/Postgres с нативным MCP-сервером.
- **Q:** Как организовать доступ к живым демо-песочницам стека на поддоменах? → **A:** **Публичный Read-Only гостевой доступ (Demo Mode)** с синтетическими демонстрационными данными без обязательной предварительной регистрации.

---

## 🎯 User Scenarios & Testing (Prioritized User Stories)

### User Story 1 - Live Authority Hook & SaaS Savings Calculator (Priority: P1)

Посетитель (фаундер SMB/CTO) заходит на `underundre.com`, видит позиционирование 3x Certified Salesforce Developer, интерактивно рассчитывает свою экономию от отказа от SaaS-налога ($15k–$40k/год) и видит кнопки прямого перехода в демонстрационные живые песочницы сервисов.

**Why this priority**: Главный конверсионный экран первого экрана (Hero), мгновенно отстраивающий UnderUndre от традиционных агентств за счет доказанной экспертизы и интерактивного расчета ROI.

**Independent Test**: Доступен на `GET /`, калькулятор динамически пересчитывает годовую экономию при выборе количества сотрудников (1–50) и текущего стека (Salesforce, Slack, Intercom, Notion, Linear) и выводит чистый годовой выигрыш и срок окупаемости спринта.

**Acceptance Scenarios**:
1. **Given** пользователь выбирает 15 сотрудников и стек Salesforce + Slack + Intercom + Notion, **When** ползунок передвигается, **Then** калькулятор отображает: «Текущий расход: $28,800/год ➔ Расход с UnderUndre: $6,000/год ➔ Экономия: $22,800/год (Окупаемость Sprint A за 55 дней)».
2. **Given** пользователь нажимает «Live Stack Demo», **Then** открывается интерактивная панель со статусом 6 рабочих сервисов (`crm.underundre.com`, `docs.underundre.com`, `plane.underundre.com`, `chat.underundre.com`, `cal.underundre.com`, `auth.underundre.com`) и графиком потребления RAM (Hetzner CPX42 <14GB).

---

### User Story 2 - Automated Scoping Intake & Cal.com Embed (Priority: P2)

Потенциальный клиент нажимает «Book 20-Min Scoping Call», проходит 4-шаговый квалификационный опрос (размер команды, текущие боли, бюджет, серверные предпочтения) и выбирает удобный слот во встроенном виджете Cal.com.

**Why this priority**: Фильтрует нецелевые лиды («воздуханов»), сохраняет квалификационные данные прямо в Twenty CRM и бронирует звонок без ручной переписки.

**Independent Test**: Доступен на `/book`, отправка формы создает событие в Supabase, триггерит таск Trigger.dev и открывает слот в Cal.com.

**Acceptance Scenarios**:
1. **Given** пользователь заполнил интейк-форму, **When** он выбирает время в Cal.com и подтверждает встречу, **Then** таск Trigger.dev:
   - Создает лид в `crm.underundre.com` (Twenty CRM) со всеми полями интейка;
   - Шлет мгновенный алерт в Telegram фаундеру с кнопками подтверждения;
   - Создает приватную заметку в `docs.underundre.com` (Outline) для ведения брифа.

---

### User Story 3 - Product Ladder & Instant Deal Closing Gateway (Priority: P3)

Клиент изучает 3 продуктовых предложения (Tripwire SpecKit $350–$490, Sprint A $3,500 FOSS Office, Sprint B $4,900 14-Day SaaS MVP) и выбирает способ безопасной сделки: через Upwork Direct Contracts (5% комиссия) или прямой договор через DocuSeal по модели 40/40/20.

**Why this priority**: Устраняет трение при оплате и недоверие зарубежных клиентов из США/Канады/ЕС через признанный шлюз Upwork или цифровое подписание.

**Independent Test**: На `/hire` или `/pricing` клик по «Upwork Direct Contract» генерирует защищенную ссылку на эскроу-контракт Upwork; клик по «Direct B2B Invoice» открывает форму генерации DocuSeal договора.

**Acceptance Scenarios**:
1. **Given** клиент заказывает Tripwire SpecKit Audit ($490), **When** выбирает Upwork Direct, **Then** система открывает ссылку на Upwork с предустановленной суммой $490 и майлстоуном «OpenAPI 3.0 + Supabase DDL + Docker Mock in 48h».
2. **Given** клиент выбирает Direct B2B Contract, **When** вводит реквизиты компании, **Then** генерируется контракт DocuSeal с моделью траншей 40% аванс / 40% MVP demo / 20% финальная передача прав.

---

### User Story 4 - Live Omnichannel Support (Chatwoot Widget) (Priority: P4)

Посетитель сайта нажимает на иконку онлайн-чата в правом нижнем углу и задает технический вопрос. Сообщение мгновенно попадает в селф-хостед инбокс `chat.underundre.com` (Chatwoot), откуда фаундер отвечает через веб или мобильное приложение.

**Why this priority**: Прямая демонстрация работы омниканального виджета Chatwoot на реальном трафике лендинга.

**Independent Test**: Виджет Chatwoot загружается на всех публичных страницах `underundre.com`, сообщение посетителя появляется в инбоксе `chat.underundre.com`.

---

## ⚙️ Functional Requirements & Specifications

### 1. Frontend & UI (`/`)
* **FR-01 (Hero Section):** Заголовок, подзаголовок, бейдж 3x Salesforce Certified Developer, кнопки CTA («Рассчитать экономию», «Забронировать аудит $490»).
* **FR-02 (SaaS Savings Interactive Calculator):** Ползунки количества сотрудников (1–50) и чекбоксы заменяемых сервисов (Salesforce, Zendesk, Slack, Linear, Notion, DocuSign). Формула: $\text{Savings} = \sum (\text{SaaS Monthly Seat} \times N \times 12) - \$6,000$.
* **FR-03 (Live Dogfooding Dashboard):** Табы со статусом 6 поддоменов (`crm`, `docs`, `plane`, `chat`, `cal`, `auth`) с кнопками входа в демо-режим.
* **FR-04 (Product Ladder Cards):**
  * *Card 0: Tripwire SpecKit Audit* — $350–$490 Flat, 24–48h SLA.
  * *Card 1: Sprint A (FOSS Office Stack)* — $3,500 setup + $500/mo retainer.
  * *Card 2: Sprint B (14-Day SaaS MVP Factory)* — $4,900 Flat.
* **FR-05 (Trust & Escrow Badges):** Upwork Direct Contracts 5% fee, Payoneer, Stripe, Paddle MoR, 40/40/20 Milestone Protection.

### 2. Backend, Database & Pipelines (`/api`)
* **FR-06 (Supabase / Postgres Schema):** Таблицы `leads`, `intake_submissions`, `calculator_logs`, `sprint_bookings`.
* **FR-07 (Trigger.dev / Inngest Workflow):** Таск `lead-enrichment-and-dispatch`: валидация email $\to$ создание лида в Twenty CRM $\to$ алерт в Telegram $\to$ создание бриф-документа в Outline.
* **FR-08 (Cal.com Webhook Handler):** Синхронизация статусов встреч (Booking Created, Rescheduled, Cancelled).
* **FR-09 (DocuSeal / Upwork Webhook Handler):** Обновление статуса контрактов и запуск спринта.

### 3. Non-Functional Requirements & Security
* **NFR-01 (Performance):** PageSpeed Score $\ge 95$ на десктопе, First Contentful Paint $< 0.8\text{ s}$.
* **NFR-02 (Data Sovereignty & RLS):** 100% таблиц Supabase защищены политиками Row Level Security (RLS).
* **NFR-03 (Memory Fencing Spec):** Документированная конфигурация Docker Compose для развертывания на Hetzner CPX42 (суммарно $\le 13.3\text{ GB RAM}$ при 16GB NVMe Swap).
