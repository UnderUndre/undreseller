# 🌐 Бизнес-План Международного Агентства и Платформы Undreseller

**Версия:** 16.0 (Alpha Validation & Live Onboarding Protocol Edition: Устранение 4 критических течей — замена Sandbox сдачи на Live Onboarding Protocol на 14-й день, двухэтапная снайперская воронка 100 DM ➔ 15 Loom, фокус строго на 2 платящих SKU $3.5k/$4.9k с заморозкой $35k Medusa, материальный Git-артефакт по NACE 62.01, компенсация клиентских комиссий Upwork)  
**Дата:** 16 августа 2026 г.  
**Бренд:** `undreseller` (`undreseller.com` / `undreseller.io`)  
**Статус:** **ALPHA VALIDATION / EXECUTABLE READY. Viability score: 7.8/10 (Grounded in Alpha Execution). Productized Engineering Conveyor. Upwork Direct Contracts (0% with Freelancer Plus) + Payoneer + Georgia Small Business 1% Gross (NACE 62.01). 2-Stage Outbound Funnel. 20h Architecture / 20h Sales split.**  
**Язык:** Доступный инженерно-коммерческий документ для международных заказчиков, инвесторов и партнеров.

---

## 🧾 0. История Изменений (Changelog)

| Версия | Дата | Изменения | Причина / Источник |
| :--- | :--- | :--- | :--- |
| **v16.0** | 16.08.2026 | **Опрессовка 4 Критических Течей (`gemini-flash.md`):**<br>1. **Live Onboarding Protocol (Day 14):** Отказались от "Sandbox-only" сдачи. День 14 фиксируется 60-минутным созвоном с вводом продовых API-ключей клиентом и $1 проверочным платежом до релиза эскроу.<br>2. **Двухэтапный Outbound:** 100 снайперских DM-инвайтов в неделю ──► запись 90-сек Loom **только заинтересованным 10–15 лидам** (экономия 35+ часов/мес).<br>3. **Фокус на 2 Core SKUs:** Скрыты $35k Medusa и PoC из первичного питча. Оставлены 2 продукта: B2B Automation ($3.5k) и 14-Day SaaS MVP ($4.9k).<br>4. **Git-Артефакт NACE 62.01:** Product 0 обязателен к выгрузке в Git (OpenAPI 3.0, Supabase DDL SQL, Docker Mock) для защиты от 20% налога GAAR. | Ликвидация 4 dealbreaker-протечек аудита `gemini-flash.md` |
| **v15.0** | 16.08.2026 | Внедрение AI-пайплайнов n8n с MCP-сервером `czlonkowski/n8n-mcp`, Hybrid TypeScript+Zod Code Nodes, `nextjs/saas-starter`. | Vibecoding & MCP стандарты |
| **v14.3** | 16.08.2026 | Upwork Freelancer Plus ($19.99/mo) 0% fee hack, Dual Payoneer EUR/USD cards. | Комиссии и FX |

---

## 📖 1. Суть и Позиционирование (Executive Summary)

### Концепция Productized Engineering Bureau
**Undreseller** — это международное бюро **Productized Engineering & Turnkey B2B Systems**.

В 2026 году на рынке B2B-разработки образовался гигантский разрыв: традиционные агентства выставляют чеки в $40,000–$80,000 и раздувают сроки до 6 месяцев, а почасовые фрилансеры срывают дедлайны. **Undreseller** закрывает эту боль с помощью **Productized Engineering** — поставки фиксированных инженерных результатов за 3–14 дней по прозрачной фиксированной цене на проверенных бойлерплейтах (Next.js 15, Supabase, n8n MCP).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│       UNDRESELLER PRODUCTIZED CONVEYOR v16.0                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ OUTBOUND FUNNEL (2-STAGE HIGH-TOUCH):                                        │
│   • 100 Targeted Text DMs/wk ──► 15 Personalized 90s Looms ──► 1 Close / 2 wks   │
│ PAYMENT & CAPITAL RAILS:                                                     │
│   • Upwork Direct Contracts (0% fee via Freelancer Plus $19.99/mo) ──► Escrow│
│   • Dual Payoneer Cards: USD Card (Vercel/OpenAI) + EUR Card (Hetzner) 0% FX │
│ CONVEYOR CORE SKUs (2 PRIMARY OFFERS ONLY):                                  │
│   1. SPRINT A: B2B Workflow Plumbing ($3,500 + $500/mo) — 3–5 Days Delivery  │
│   2. SPRINT B: 14-Day SaaS MVP Engine ($4,900 flat) — 14 Days Live Delivery  │
│ FROZEN / DEFERRED:                                                           │
│   • Custom Medusa Core ($32k–$35k) — Activated post $15k MRR only            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🤖 1.1. AI-Vibecoding, Trigger.dev v3 & n8n Licensing Architecture

Для 100% стабильной оркестрации процессов без юридических рисков и лицензионных ловушек применяется **Двухуровневая стратегия оркестрации (Code-First + n8n SUL Compliance)**:

1. **Sprint B (14-Day SaaS MVP Engine): Trigger.dev v3 / Inngest (Code-First TS Engine)**
   - Внутри продуктов SaaS категорически **исключён n8n** во избежание $50,000/год Embed License платить правообладателям n8n GmbH по лицензии Sustainable Use License (SUL).
   - Автоматизация и фоновые задачи изолируются прямо в код Next.js 15 / Node.js через **Trigger.dev v3 (100% Apache 2.0 Free OS)** или **Inngest** (`app/api/inngest/route.ts`).
   - Вся логика типизирована через **TypeScript + Zod**, верифицируется через `vitest` и версионируется в едином Git-репозитории клиента без JSON-простынь.

2. **Sprint A (B2B Operations Plumbing): Dedicated n8n SUL Instance**
   - Разворачивается **выделенный изолированный инстанс n8n** на сервере заказчика (Hetzner / VPS), что на 100% соответствует SUL-лицензии n8n (бесплатное использование в рамках индивидуальной консалтинговой настройки).
   - Генерация нод оптимизируется через **MCP-сервер `czlonkowski/n8n-mcp`** и Hybrid TypeScript + Zod Code Nodes (`NODE_FUNCTION_ALLOW_EXTERNAL=zod`).

---

## 💰 2. Линейка Продуктов (Фокус на 2 Core SKUs)

### 📐 Продукт 0 (SPECIFICATION): Productized Software Architecture & Codebase Prototyping
* **Суть:** Проектирование архитектуры ПО, выгрузка OpenAPI 3.0 спецификации, Supabase DDL SQL-схемы базы данных и Docker Compose Mock-сервера в Git-репозиторий клиента (**код NACE 62.01**). *(Слова "Audit" и "Consulting" строго запрещены во всех инвойсах под Постановление №415/GAAR).*
* **Срок:** 3–5 рабочих дней.
* **Цена:** **$1,500 – $2,500 fixed** (100% предоплата).

---

### ⚡ Продукт 1 (SPRINT A): B2B Operations & Workflow Plumbing (Fastest Cash)
* **Для кого:** Владельцы агентств, оптовики, логисты, у которых сотрудники вручную копипастят лиды, сопоставляют таблицы в Excel и выставляют счета.
* **Срок:** **3–5 рабочих дней**.
* **Цена:** **$3,500 setup + $500/мес** (Retainer за мониторинг и поддержку).
* **Стек:** n8n Docker + кастомные ноды на TypeScript (Zod) + Claude 3.7 API.
* **Оплата:** **Upwork Direct Contracts (0% с Freelancer Plus)**.

---

### 🚀 Продукт 2 (SPRINT B — HERO): 14-Day SaaS MVP Factory
* **Для кого:** Нетехнические фаундеры, инвесторы и C-level менеджеры с новой продуктовой гипотезой, которым нужен рабочий SaaS с подписками за 2 недели.
* **Срок:** **14 календарных дней** (строгий Timebox).
* **Цена:** **$4,900 flat-fee** (Фиксированный чек).
* **Что входит в поставку (Fixed Scope Boundary):**
  1. **Frontend & Auth:** Next.js 15 / Tailwind / Supabase Auth (SSR Cookies).
  2. **Backend & DB:** Supabase PostgreSQL + Row Level Security (RLS) + Storage.
  3. **Billing & Live Launch:** Lemon Squeezy MoR / Stripe via US LLC (подписки, вебхуки, инвойсы).
  4. **Границы скоупа:** Максимум 2 роли (Admin + User), 1 бизнес-процесс, 1 интеграция API. Нативные мобильные приложения и микросервисы **исключены**.
* **Оплата:** 50% ($2,450) через Upwork Direct Contracts Escrow до создания git-репозитория, 50% ($2,450) при подписании акта на 14-й день.

---

### 🔒 Продукти 3 и 4 (FROZEN / POST-MRR ONLY)
* **B2B Checkout PoC ($2.5k–$4.5k)** и **Custom Medusa Core ($32k–$35k)** заморожены и скрыты из публичного маркетинга до достижения $15k MRR на продуктах 1 и 2, чтобы не разрывать фокус позиционирования.

---

## 🛡️ 3. Инженерные Правила Защиты Сделок (OpSec & SLA)

1. **Правило Upwork Escrow (Zero Risk Policy):** Клиент вносит 50% или 100% средств в Upwork Direct Contracts Escrow до старта спринта. С подпиской **Upwork Freelancer Plus ($19.99/mo)** комиссия платформы за Direct Contracts составляет **0%**.
2. **2-Страничный Timebox Scope Knife & Feature Freeze:** До старта фиксируется строгий чек-лист. Любые хотелки клиента переводятся в *Phase 2 Backlog* по ставке $100/ч.
3. **Live Onboarding Protocol (Day 14 Live Setup):** Отказались от отгрузки на тестовых ключах. День 14 завершается **60-минутным экранированным созвоном**, где фаундер помогает клиенту ввести продовые API-ключи Stripe/Lemon Squeezy, делает проверочный платеж на $1 и верифицирует продакшен-вебхуки до релиза эскроу.
4. **7-Day Bugfix SLA Knife & Retainer Lock:** Включено **7 календарных дней бесплатной поддержки** (только P1/P2 крит-баги). На 8-й день проект переходит на **MVP Maintenance Retainer ($650/mo)**.

---

## ⚖️ 4. Платёжный Грааль, Налоги и Юрконтур (Georgia IE 1% NACE 62.01)

### 4.1. Золотой Платёжный Сплит (Upwork + Payoneer + ИП Грузия)

```
[Клиент Инвойс $4,900] ──► [Upwork Direct Contracts (0% fee via Freelancer Plus)] ──► [Payoneer ($0–$1.50)]
                                                                                              │
                                ┌─────────────────────────────────────────────────────────────┴─────────────────────────────────────────────┐
                                ▼                                                                                                           ▼
             [ Dual Payoneer Cards (0% FX) ]                                                                             [ SWIFT / Bank of Georgia ]
             • USD Card: Vercel, OpenAI, Claude, Cursor, Smartlead                                                      • Декларирование 1% Gross на rs.ge
             • EUR Card: Hetzner Cloud (0% FX на евро!)                                                                 • Чистый вывод на жизнь в лари
```

1. **Upwork Direct Contracts (0% комиссия):** Подписка Upwork Freelancer Plus ($19.99/mo) снижает комиссию с 5% до **0%**, сохраняя +$245 чистого дохода с каждого спринта.
2. **Dual Payoneer Cards (0% FX):** 
   - USD-сервисы (Vercel, OpenAI, Claude, Cursor, Smartlead) оплачиваются с **USD карты Payoneer (0% FX)**.
   - EUR-сервисы (Hetzner Cloud) оплачиваются с **EUR виртуальной карты Payoneer (0% FX)**, исключая 3.5% FX комиссию.
3. **Компенсация клиентской комиссии Upwork:** В юнит-экономику заложен резерв $150 для частичной компенсации эквайринговой комиссии клиента на Upwork (3%).

### 4.2. Правило Декларирования 1% GROSS на `rs.ge` & CRS Комплаенс
* **Закон Грузии (RS.ge & CRS):** Налог 1% платится с **ВАЛОВОГО ДОХОДА (Gross Revenue)**. В декларации на `rs.ge` указывается полная сумма инвойса — **$4,900** ($49 налог). Данные по Payoneer Ирландия автоматически передаются в налоговую Грузии через систему **CRS**, 100% сходясь с декларациями `rs.ge`.
* **Строгий запрет слов:** Слова *Audit, Consulting, Strategy, Diagnostic* категорически **запрещены** во всех инвойсах по Постановлению №415/GAAR. Формулировка: *"Computer programming activities: Creation of OpenAPI specification, DDL database schemas and automated code deployment (NACE 62.01)"*.

---

## 📊 5. Опрессованная Юнит-Экономика Сделок (Stress-Tested)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│          РЕАЛИСТИЧНЫЙ ФИНАНСОВЫЙ РАСЧЕТ СПРИНТА B (FREELANCER PLUS 0%)      │
├──────────────────────────────────────────┬──────────────────┬───────────────┤
│ СТАТЬЯ РАСХОДОВ                          │ SPRINT B ($4.9k) │ SPRINT A ($3.5k)│
│                                          │ 14-Day SaaS MVP  │ B2B Automation│
├──────────────────────────────────────────┼──────────────────┼───────────────┤
│ Валовая выручка (Gross Revenue)          │ $4,900           │ $3,500        │
│ Комиссия Upwork Direct (Freelancer Plus) │ -$0              │ -$0           │
│ Резерв компенсации Upwork Client Fee     │ -$147            │ -$105         │
│ Подписка Upwork Freelancer Plus ($20/mo) │ -$10 (сплит)     │ -$10 (сплит)  │
│ Вывод Payoneer -> SWIFT Bank of Georgia  │ -$35             │ -$25          │
│ Обслуживание Payoneer карт ($60/год)     │ -$5 (сплит)      │ -$5 (сплит)   │
│ Налог Грузии (1% Gross от инвойса)       │ -$49             │ -$35          │
│ Подписки API с Dual Payoneer (0% FX)     │ -$80             │ -$40          │
│ Outbound Stack (Smartlead/Clay/Domains)  │ -$164            │ -$164         │
│ Резерв на 7-Day Bugfix SLA (10% фикс)    │ -$300            │ -$200         │
├──────────────────────────────────────────┼──────────────────┼───────────────┤
│ РЕАЛЬНЫЙ ЧИСТЫЙ ВЫХЛОП ФАУНДЕРУ          │ $4,110 (83.8%)   │ $2,916 (83.3%)│
│ Часы фаундера (Outbound + Dev + Live Onb)│ 45 часов         │ 18 часов      │
│ ЧАСОВОЙ ВЫХЛОП ФАУНДЕРУ                  │ $91.3 / час      │ $162 / час    │
└──────────────────────────────────────────┴──────────────────┴───────────────┘
```

---

## 🎯 6. Мультиканальный GTM & Outbound Engine

### 💼 6.1. Two-Stage High-Touch LinkedIn & Smart Vanity Loom Engine
Двухэтапная воронка с экономией 35+ часов фаундерского времени в месяц:

```
[100 Targeted Text DMs / week] ──► [15 Interested Replies] ──► [15 Personalized 90s Looms] ──► [1 Close / 2 wks]
```

1. **Этап 1 (Текстовый снайперский прогрев):**  
   * Отправка 100 коротких текстовых инвайтов/сообщений в неделю фаундерам из списка Clay/Sales Navigator.  
   * *Скрипт в DM:* «Hey [Name], noticed you're scaling [Company]. Are you guys currently wasting dev hours on manual internal tooling or trying to ship a backlog feature without distracting core devs? I’ve productized a 14-day sprint where I handle the entire build (Next.js + Supabase + Payments) for a flat fee. If you have anything sitting in your backlog, let me know — happy to send a 2-minute Loom teardown.»
2. **Этап 2 (Smart Vanity Loom для проявивших интерес):**  
   * Запись 90-секундного Loom-видео **ТОЛЬКО для тех 10–15 лидов в неделю, кто ответил на сообщение**.  
   * Ссылка отправляется через поддомен **`video.undreseller.com/review-company`** с легковесным PNG (<30 КБ) для защиты от спам-фильтров Google Postmaster (<0.10%).

---

## 🎯 7. Резюме

Бюро **Undreseller** (`undreseller.com`) — это опрессованный конвейер **AI Vibecoding & Productized Engineering** в статусе **ALPHA VALIDATION / EXECUTABLE READY** со связкой Upwork Direct Contracts (0% fee via Freelancer Plus), Live Onboarding Protocol на 14-й день, двухэтапным снайперским аутричем (100 DM ➔ 15 Loom), сфокусированным прайсом на 2 SKU ($3,500 / $4,900) и 100% комплаенсом NACE 62.01!
