# Feature Specification: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Feature Branch**: `002-dogfood-portal`  
**Created**: 2026-10-05  
**Status**: Approved (Executable Spec)  
**Input**: Business Plan `undreseller-business-plan.md` v18.3 & Live Dogfooding Architecture (Twenty CRM, Outline, Plane, Chatwoot, Cal.com, Authentik, Supabase RLS, Trigger.dev v3)

---

## 📖 Executive Summary & Core Concept

**UnderUndre** (`underundre.com`) — международное инженерное бюро Productized Engineering & Turnkey B2B Systems.
Портал построен на принципе **100% Dogfooding («Skin in the Game»)** с жестким физическим разделением сред:
1. **Боевой закрытый контур (Internal Ops):** все сервисы, которые бюро продает клиентам (Sprint A: $3,500 + $500/mo FOSS Office Stack на Hetzner CPX42), развернуты и используются агентством для собственной работы 24/7 за шлюзом Authentik SSO / Cloudflare Access.
2. **Публичные изолированные демо-песочницы (Public Showcases):** клиенты взаимодействуют с отдельными демонстрационными инстансами с синтетическими данными (mock data) и автоматическим ночным сбросом по расписанию (`seed-reset.sh` в 04:00 UTC), исключая утечку коммерческой тайны и персональных данных реальных лидов.

## 📌 Clarifications

### Session 2026-10-06 (Post-Audit Hardening per `gemini-3.8-flash.md`)
- **Q (CRM Engine):** Какой селф-хостед CRM-движок использовать как основной? → **A:** **Twenty CRM (`twentyhq/twenty`)** на TypeScript/NestJS/Postgres с нативным MCP-сервером.
- **Q (Demo Security & PII Isolation):** Как организовать демонстрацию стека без риска утечки реальных лидов (GDPR/CCPA)? → **A:** **Полная физическая изоляция Демо и Продакшена**. Боевой инстанс закрыт за Authentik SSO/mTLS. Демо-песочницы (`demo-crm.underundre.com`, `demo-plane.underundre.com`) работают на синтетических фикстурах с ночным авто-сбросом базы в 04:00 UTC.
- **Q (Router & Stack Hygiene):** Какой роутер и ORM использовать во фронтенде? → **A:** Чистый **Next.js 15 App Router (`app/`)** без гибридного зоопарка; база данных — **PostgreSQL + Prisma ORM с пулером PgBouncer** (избыточный клиентский Supabase RLS вырезан).
- **Q (Async Task Runner):** Чем оркестрировать лидогенерацию и алерты? → **A:** Легковесный **Inngest Serverless / BullMQ** (с автоматическими ретраями) вместо развертывания отдельного тяжелого self-hosted кластера Trigger.dev.
- **Q (Upwork & Contract Gate):** Как технически устроен шлюз мгновенной оплаты? → **A:** Для Tripwire SpecKit ($490) используется **Upwork Project Catalog** с прямой публичной ссылкой; для кастомных спринтов — ручной инвайт в Upwork Direct Contracts; DocuSeal контракт активируется строго по вебхуку оплаты 40% аванса через Stripe/Paddle.

---

## 🎯 User Scenarios & Testing (Prioritized User Stories)

### User Story 1 - Live Authority Hook & SaaS Savings Calculator (Priority: P1)

Посетитель (фаундер SMB/CTO) заходит на `underundre.com`, видит позиционирование 3x Certified Salesforce Developer со ссылкой на официальный верификатор **Salesforce Trailblazer / Credly**, рассчитывает экономию от отказа от SaaS-налога ($15k–$40k/год) и переходит в изолированные демо-песочницы сервисов.

**Why this priority**: Главный конверсионный экран (Hero), мгновенно отстраивающий UnderUndre от традиционных агентств за счет доказанной экспертизы и интерактивного расчета ROI.

**Independent Test**: Доступен на `GET /`, калькулятор динамически пересчитывает годовую экономию при выборе количества сотрудников (1–50) и текущего стека (Salesforce, Slack, Intercom, Notion, Linear) и выводит чистый годовой выигрыш и срок окупаемости спринта.

**Acceptance Scenarios**:
1. **Given** пользователь выбирает 15 сотрудников и стек Salesforce + Slack + Intercom + Notion, **When** ползунок передвигается, **Then** калькулятор отображает: «Текущий расход: $28,800/год ➔ Расход с UnderUndre: $6,000/год ➔ Экономия: $22,800/год (Окупаемость Sprint A за 55 дней)».
2. **Given** пользователь кликает по бейджу Salesforce, **Then** открывается официальная страница подтверждения сертификации на Trailblazer.me / Credly.
3. **Given** пользователь нажимает «Live Stack Demo», **Then** открывается интерактивная панель со статусом демонстрационных песочниц (`demo-crm.underundre.com`, `docs.underundre.com`, `demo-plane.underundre.com`, `chat.underundre.com`, `cal.underundre.com`) и графиком потребления RAM.

---

### User Story 2 - Automated Scoping Intake & Cal.com Embed (Priority: P2)

Потенциальный клиент нажимает «Book 20-Min Scoping Call», проходит 4-шаговый квалификационный опрос (размер команды, текущие боли, бюджет, серверные предпочтения) и выбирает удобный слот во встроенном виджете Cal.com.

**Why this priority**: Фильтрует нецелевые лиды («воздуханов»), сохраняет квалификационные данные прямо в Twenty CRM и бронирует звонок без ручной переписки.

**Independent Test**: Доступен на `/book`, отправка формы создает запись в PostgreSQL, запускает воркер Inngest/BullMQ и открывает слот в Cal.com.

**Acceptance Scenarios**:
1. **Given** пользователь заполнил интейк-форму, **When** он выбирает время в Cal.com и подтверждает встречу, **Then** воркер Inngest/BullMQ:
   - Создает лид в боевой `crm.underundre.com` (Twenty CRM) со всеми полями интейка;
   - Шлет мгновенный алерт в Telegram фаундеру с кнопками подтверждения;
   - Создает приватную заметку в `docs.underundre.com` (Outline) для ведения брифа.

---

### User Story 3 - Product Ladder & Instant Deal Closing Gateway (Priority: P3)

Клиент изучает 3 продуктовых предложения (Tripwire SpecKit $350–$490, Sprint A $3,500 FOSS Office, Sprint B $4,900 14-Day SaaS MVP) и выбирает способ безопасной сделки: через **Upwork Project Catalog** (для $490), **Upwork Direct Contracts** (для спринтов) или прямой договор через **DocuSeal + Stripe Invoice** по модели 40/40/20.

**Why this priority**: Устраняет трение при оплате и недоверие зарубежных клиентов из США/Канады/ЕС через признанный эскроу Upwork и юридически обязывающее подписание с мгновенным инвойсом.

**Independent Test**: На `/pricing` клик по «Buy via Upwork» перенаправляет на верифицированную карточку в Upwork Project Catalog ($490); клик по «Direct B2B Invoice» открывает форму генерации DocuSeal договора со ссылкой на оплату первого транша (40%).

**Acceptance Scenarios**:
1. **Given** клиент заказывает Tripwire SpecKit Audit ($490), **When** выбирает Upwork, **Then** открывается страница Upwork Project Catalog с четким SLA «48 hours delivery, OpenAPI 3.0 + Supabase DDL + Docker Mock».
2. **Given** клиент выбирает Direct B2B Contract, **When** подписывает договор в DocuSeal, **Then** формируется инвойс на 40% аванса через Stripe/Paddle, а статус проекта переходит в `ACTIVE` только после поступления платежа по вебхуку.

---

### User Story 4 - Live Omnichannel Support (Chatwoot Widget) (Priority: P4)

Посетитель сайта нажимает на иконку онлайн-чата в правом нижнем углу и задает технический вопрос. Сообщение мгновенно попадает в селф-хостед инбокс `chat.underundre.com` (Chatwoot), откуда фаундер отвечает через веб или мобильное приложение.

**Why this priority**: Прямая демонстрация работы омниканального виджета Chatwoot на реальном трафике лендинга.

**Independent Test**: Виджет Chatwoot загружается на всех публичных страницах `underundre.com`, сообщение посетителя появляется в инбоксе `chat.underundre.com`.

---

## ⚙️ Functional Requirements & Specifications

### 1. Frontend & UI (Next.js 15 App Router `/app`)
* **FR-01 (Clean App Router Architecture):** Использование строго `app/layout.tsx`, `app/page.tsx`, `app/book/page.tsx`, `app/pricing/page.tsx`.
* **FR-02 (Hero Section & Verified Badges):** Заголовок, подзаголовок, кликабельный бейдж 3x Salesforce Certified Developer со ссылкой на Trailblazer.me/Credly, кнопки CTA.
* **FR-03 (SaaS Savings Interactive Calculator):** Ползунки количества сотрудников (1–50) и чекбоксы заменяемых сервисов. Формула: $\text{Savings} = \sum (\text{SaaS Monthly Seat} \times N \times 12) - \$6,000$.
* **FR-04 (Live Dogfooding Dashboard):** Табы со статусом 6 поддоменов (`crm`, `docs`, `plane`, `chat`, `cal`, `auth`) с кнопками входа в демо-режим.
* **FR-05 (Product Ladder Cards):**
  * *Card 0: Tripwire SpecKit Audit* — $350–$490 Flat, 24–48h SLA (ссылка на Upwork Project Catalog).
  * *Card 1: Sprint A (FOSS Office Stack)* — $3,500 setup + $500/mo retainer.
  * *Card 2: Sprint B (14-Day SaaS MVP Factory)* — $4,900 Flat.

### 2. Backend, Database & Pipelines (`/app/api`)
* **FR-06 (PostgreSQL & Prisma Schema with PgBouncer):** Таблицы `Lead`, `IntakeSubmission`, `CalculatorLog`, `BookingEvent`, `Contract`. Подключение к базе строго через `PgBouncer` (Connection Pooling).
* **FR-07 (Inngest / BullMQ Task Engine):** Воркер `lead-enrichment`: валидация email $\to$ создание лида в боевой Twenty CRM $\to$ алерт в Telegram фаундеру $\to$ создание бриф-документа в Outline.
* **FR-08 (Cal.com Webhook Handler):** Синхронизация статусов встреч (`/app/api/webhooks/calcom/route.ts`).
* **FR-09 (DocuSeal & Payment Webhook Handler):** Связка подписи договора с получением 40% оплаты через Stripe/Paddle (`/app/api/webhooks/payment/route.ts`).

### 3. Non-Functional Requirements, DevOps & Security
* **NFR-01 (Performance):** PageSpeed Score $\ge 95$ на десктопе, First Contentful Paint $< 0.8\text{ s}$.
* **NFR-02 (Zero Data Leak Isolation):** Боевая CRM и таск-трекер закрыты за Authentik SSO/mTLS. Демо-песочницы вынесены на изолированные поддомены с синтетическими данными и ночным сбросом (`seed-reset.sh` в 04:00 UTC).
* **NFR-03 (Memory Fencing & PgBouncer Spec):** Конфигурация Docker Compose с обязательным `pgbouncer` контейнером (лимит пула 30 коннектов) и лимитами памяти (`limits.memory`): Twenty CRM (2.5G), Chatwoot (3.5G), Outline (1.5G), Cal.com (1.5G), Authentik (2.0G), Postgres+PgBouncer (2.5G), Redis (0.8G), Traefik (0.3G). Суммарно $\le 14.6\text{ GB RAM}$.
