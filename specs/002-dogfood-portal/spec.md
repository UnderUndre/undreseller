# Feature Specification: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Feature Branch**: `002-dogfood-portal`  
**Created**: 2026-10-05  
**Status**: Approved (Executable Spec)  
**Input**: Business Plan `undreseller-business-plan.md` v18.3 & Live Dogfooding Architecture (Twenty CRM, Outline, Chatwoot, Cal.diy, Authentik, DocuSeal, PostgreSQL + PgBouncer на Hetzner CPX42; Inngest Cloud; pgBackRest PITR)

---

## 📖 Executive Summary & Core Concept

**UnderUndre** (`underundre.com`) — международное инженерное бюро Productized Engineering & Turnkey B2B Systems.
Портал построен на принципе **100% Dogfooding («Skin in the Game»)**:
1. **Боевой закрытый контур (Internal Ops):** боевой стек бюро (Twenty CRM, Outline, Chatwoot, Cal.diy, Authentik, DocuSeal + PostgreSQL + PgBouncer + портал Next.js на Hetzner CPX42) развернут для собственной работы 24/7 за шлюзом Authentik SSO / Cloudflare Access.
2. **Публичная витрина (Showcase & Interactive Walkthroughs):** посетители сайта изучают живую работу сервисов через интерактивные встраиваемые туры (Arcade / Supademo) и прозрачные дашборды телеметрии памяти, исключая расходование оперативной памяти хоста на параллельный дублирующий демо-стек.
3. **Безопасность периметра (Zero-Open-Ports):** категорический запрет на прямой проброс портов (Port Forwarding на бытовых роутерах). Доступ к хостам обеспечивается строго через Cloudflare Tunnel (`cloudflared`) или дата-центровый WAF.

## 📌 Clarifications

### Session 2026-10-07 (Post-Audit Hardening per `grok-4.7.md`)
- **Q (Хостинг API vs закрытый Postgres):** Где исполняются серверные роуты, если Postgres за `nftables default drop`? → **A:** Vercel / Cloudflare Pages исключены полностью — serverless-функции не имеют TCP-маршрута к Postgres за туннелем. Весь Next.js 15 App Router (SSR + API routes + Inngest-хендлеры in-process) живёт в контейнере `portal` на том же CPX42 за Cloudflare Tunnel; Cloudflare — только DNS/CDN/WAF перед туннелем. Postgres публикуется без `ports:` на хост.
- **Q (DSN discipline):** Какой DSN у прикладной записи лида? → **A:** Только `DATABASE_URL` (PgBouncer, порт 6432). `DIRECT_URL` (порт 5432) — сугубо `prisma migrate`/DDL и pg_dump. Исправлено в US2 Independent Test и `plan.md`.
- **Q (Бэкап: PITR или RPO 6h?):** Дамп раз в 6 часов — это не PITR. → **A:** Внедрён pgBackRest/WAL-G: базовый бэкап каждые **6 часов** + **непрерывная WAL-архивация** (`archive_timeout = 60s`) → настоящий PITR с **RPO ≤ 5 минут**. Две независимые офсайт-копии (Hetzner Storage Box **и** Backblaze B2) с object-lock/immutable retention ≥ 30 дней, алерт при пропуске base backup/WAL. Restore-тест T-027 — гейт до первого боевого лида.
- **Q (Сборка образов):** Где собирается Cal.diy/портал, если build-heap доходит до 6 GB? → **A:** На CPX42 сборки запрещены. Образы собираются в CI (GitHub Actions) и доставляются через GHCR (`docker compose pull`).
- **Q (Регион VPS):** Где размещается CPX42? → **A:** `fsn1` (Falkenstein, DE); задержку для US/CA-посетителей витрины гасит Cloudflare edge.
- **Q (Trailblazer URL):** Что считается верифицированным бейджем? → **A:** Конкретный URL страницы бейджа на Trailblazer.me / Credly (placeholder `<TRAILBLAZER_URL>` — заполняет фаундер до publish). Ссылка на поиск/ленту не считается верификацией.
- **Q (Arcade/Storylane vs PageSpeed):** Как туры не убивают LCP? → **A:** Туры — click-to-play (постер, iframe грузится только по клику), телеметрия RAM — ленивая загрузка; в tasks добавлен PageSpeed-гейт T-028.

### Session 2026-10-06 (Post-Audit Hardening per `grok-4.6.md`, `gemini-3.8-flash.md` & `keenetic-red-team-audit.md`)
- **Q (Арифметика RAM и Memory Fencing):** Каков точный бюджет оперативной памяти контейнеров на 16 GiB Hetzner CPX42? → **A:** Суммарный лимит контейнеров жестко ограничен **≤ 13.5 GB RAM** (текущая сумма с порталом — **13.4 GB**), оставляя **≥ 2.6 GB неснижаемого буфера под ядро Linux, page cache и dockerd**:
  - `twenty-crm` (server + worker): **2.5 GB**
  - `chatwoot` (Puma single worker + Sidekiq concurrency 5): **2.5 GB**
  - `authentik` (server + worker): **2.0 GB**
  - `outline`: **1.0 GB**
  - `cal-diy`: **1.0 GB**
  - `docuseal`: **1.0 GB**
  - `postgres-16` (shared_buffers **512 MB** — остальной кэш отдан page cache хоста через `effective_cache_size`) + `pgbouncer` (max 30 pool): **2.0 GB**
  - `redis-7`: **0.5 GB** (`maxmemory-policy noeviction` — вытеснение ключей Sidekiq/BullMQ выглядит как «пропали письма»; при исчерпании памяти — алерт и вынос очередей на второй инстанс, не eviction)
  - `cloudflared` + internal reverse proxy: **0.3 GB**
  - `portal` (Next.js 15 standalone: SSR + API routes + Inngest in-process): **0.6 GB**
  - *Swap:* 4 GB NVMe чисто как предохранитель ядра (`vm.swappiness=10`), на воркерах `memswap_limit = mem_limit` (самоперезапуск утекающих воркеров по healthcheck без I/O троттлинга диска).
- **Q (Лицензия Cal.com vs Cal.diy):** Какой контур календаря разворачивается как FOSS? → **A:** Разворачивается **`Cal.diy` (MIT)** для стандартного персонального букинга (после закрытия исходников Cal.com 15.04.2026). Командный роутинг при необходимости подключается через Cal.com Cloud.
- **Q (Prisma Migrate & PgBouncer):** Как избежать сбоя миграций в transaction mode пулера? → **A:** Внедрены **два DSN**: `DATABASE_URL` (порт 6432 с `?pgbouncer=true`) для прикладных запросов и `DIRECT_URL` (порт 5432) сугубо для `prisma migrate` и DDL-структур.
- **Q (Резервное копирование и риск сбоя NVMe):** Как защищены данные на single VPS без аппаратного RAID? → **A:** pgBackRest/WAL-G конвейер: базовый бэкап каждые **6 часов** + **непрерывная WAL-архивация** (RPO ≤ 5 минут) в две независимые шифрованные офсайт-копии (**Hetzner Storage Box и Backblaze B2**, object-lock/immutable ≥ 30 дней) с проверочным restore-тестом до первого боевого лида по стандарту `[P0-05: Backup 3-2-1-1-0]`.
- **Q (GDPR / PII в Telegram):** Как отправлять алерты без утечки персональных данных в облако Telegram? → **A:** В Telegram отправляется только обезличенный `Lead ID`, имя компании и кнопка-ссылка в закрытую CRM (`crm.underundre.com` за Authentik SSO). Сырые email и телефоны в текст сообщений Telegram **не передаются**.
- **Q (Калькулятор экономии):** Как учитывается стоимость внедрения Sprint A? → **A:** Для Года 1 формула: $(\text{SaaS Seat} \times N \times 12) - \$9,500$ (учитывая $\$3,500$ setup + $\$500 \times 12$ retainer); для Года 2+: $(\text{SaaS Seat} \times N \times 12) - \$6,000$.
- **Q (PageSpeed NFR vs Виджеты):** Как обеспечить PageSpeed $\ge 95$ при наличии Chatwoot и Cal.diy? → **A:** Скрипты Chatwoot и Cal.diy загружаются **строго отложенно** (по `requestIdleCallback` или первому пользовательскому скроллу), не блокируя FCP и LCP первого экрана.

---

## 🎯 User Scenarios & Testing (Prioritized User Stories)

### User Story 1 - Live Authority Hook & SaaS Savings Calculator (Priority: P1)

Посетитель (фаундер SMB/CTO) заходит на `underundre.com`, видит позиционирование 3x Certified Salesforce Developer со ссылкой на официальный верификатор **Salesforce Trailblazer / Credly**, рассчитывает экономию от отказа от SaaS-налога с учетом стоимости сетапа и изучает интерактивные туры сервисов.

**Why this priority**: Главный конверсионный экран (Hero), мгновенно отстраивающий UnderUndre от традиционных агентств за счет доказанной экспертизы и интерактивного расчета ROI.

**Independent Test**: Доступен на `GET /`, калькулятор динамически пересчитывает годовую экономию при выборе количества сотрудников (1–50) и текущего стека и выводит чистый выигрыш за Год 1 ($-\$9,500$) и Год 2+ ($-\$6,000$).

**Acceptance Scenarios**:
1. **Given** пользователь выбирает 15 сотрудников и стек Salesforce + Slack + Intercom + Notion ($28,800/год), **When** ползунок передвигается, **Then** калькулятор отображает: «Год 1: Расход $9,500 ➔ Чистая экономия $19,300 (Окупаемость сетапа за 45 дней); Год 2+: Расход $6,000/год ➔ Экономия $22,800/год».
2. **Given** пользователь кликает по бейджу Salesforce, **Then** открывается официальная страница подтверждения сертификации на Trailblazer.me / Credly.
3. **Given** пользователь нажимает «Live Stack Demo», **Then** открывается интерактивная панель с интерактивными турами сервисов (`Twenty CRM`, `Outline`, `Chatwoot`, `Cal.diy`, `DocuSeal`) и проверенным графиком потребления RAM (13.5 GB cap).

---

### User Story 2 - Automated Scoping Intake & Cal.diy Embed (Priority: P2)

Потенциальный клиент нажимает «Book 20-Min Scoping Call», проходит 4-шаговый квалификационный опрос и выбирает удобный слот во встроенном виджете Cal.diy.

**Why this priority**: Фильтрует нецелевые лиды («воздуханов»), сохраняет квалификационные данные прямо в Twenty CRM и бронирует звонок без ручной переписки.

**Independent Test**: Доступен на `/book`, отправка формы создает запись в PostgreSQL через `DATABASE_URL` (PgBouncer, порт 6432), запускает Inngest-хендлер и открывает слот в Cal.diy.

**Acceptance Scenarios**:
1. **Given** пользователь заполнил интейк-форму, **When** он выбирает время в Cal.diy и подтверждает встречу, **Then** Inngest-хендлер:
   - Создает лид в боевой `crm.underundre.com` (Twenty CRM) со всеми полями интейка;
   - Шлет обезличенный алерт в Telegram фаундеру («Новый лид #124 от Acme Corp, слот 14:00 UTC») со ссылкой в закрытую CRM без утечки PII;
   - Создает приватную заметку в `docs.underundre.com` (Outline) для ведения брифа.

---

### User Story 3 - Product Ladder & Instant Deal Closing Gateway (Priority: P3)

Клиент изучает 3 продуктовых предложения (Tripwire SpecKit $350–$490, Sprint A $3,500 FOSS Office, Sprint B $4,900 14-Day SaaS MVP) и выбирает способ безопасной сделки: через **Upwork Project Catalog** (для $490), **Upwork Direct Contracts** (для спринтов) или прямой договор через **DocuSeal + Stripe Invoice** по модели 40/40/20.

**Why this priority**: Устраняет трение при оплате и недоверие зарубежных клиентов из США/Канады/ЕС через признанный эскроу Upwork и юридически обязывающее подписание с мгновенным инвойсом.

**Independent Test**: На `/pricing` клик по «Buy via Upwork» перенаправляет на верифицированную карточку в Upwork Project Catalog ($490); клик по «Direct B2B Invoice» открывает форму генерации DocuSeal договора со ссылкой на оплату первого транша (40%).

**Acceptance Scenarios**:
1. **Given** клиент заказывает Tripwire SpecKit Audit ($490), **When** выбирает Upwork, **Then** открывается страница Upwork Project Catalog с четким SLA «48 hours delivery, OpenAPI 3.0 + Supabase DDL + Docker Mock».
2. **Given** клиент выбирает Direct B2B Contract, **When** подписывает договор в DocuSeal, **Then** формируется инвойс на 40% аванса через Stripe/Paddle, а статус проекта переходит в `ACTIVE` только после поступления платежа по вебхуку с проверкой идемпотентного `event_id`.

---

### User Story 4 - Live Omnichannel Support (Chatwoot Widget) (Priority: P4)

Посетитель сайта нажимает на иконку онлайн-чата в правом нижнем углу и задает технический вопрос. Скрипт Chatwoot подгружается по клику или `requestIdleCallback`, сообщение попадает в селф-хостед инбокс `chat.underundre.com`.

**Why this priority**: Прямая демонстрация работы омниканального виджета Chatwoot на реальном трафике лендинга без деградации PageSpeed.

**Independent Test**: Виджет Chatwoot отложено инициализируется на страницах `underundre.com`, сообщение посетителя появляется в инбоксе `chat.underundre.com`.

---

## ⚙️ Functional Requirements & Specifications

### 1. Frontend & UI (Next.js 15 App Router `/app`)
* **FR-01 (Clean App Router Architecture):** Использование строго `app/layout.tsx`, `app/page.tsx`, `app/book/page.tsx`, `app/pricing/page.tsx`.
* **FR-02 (Hero Section & Verified Badges):** Заголовок, подзаголовок, кликабельный бейдж 3x Salesforce Certified Developer со ссылкой на конкретную страницу бейджа Trailblazer.me/Credly (`<TRAILBLAZER_URL>`, не на поиск/ленту), кнопки CTA.
* **FR-03 (SaaS Savings Interactive Calculator):** Ползунки количества сотрудников (1–50) и чекбоксы заменяемых сервисов. Формула: Год 1 $= \sum (\text{SaaS Monthly Seat} \times N \times 12) - \$9,500$; Год 2+ $= \sum (\text{SaaS Monthly Seat} \times N \times 12) - \$6,000$.
* **FR-04 (Live Dogfooding Dashboard):** Табы со статусом сервисов (`Twenty CRM`, `Outline`, `Chatwoot`, `Cal.diy`, `Authentik`) и интерактивными турами.
* **FR-05 (Product Ladder Cards):**
  * *Card 0: Tripwire SpecKit Audit* — $350–$490 Flat, 24–48h SLA (ссылка на Upwork Project Catalog).
  * *Card 1: Sprint A (FOSS Office Stack)* — $3,500 setup + $500/mo retainer.
  * *Card 2: Sprint B (14-Day SaaS MVP Factory)* — $4,900 Flat.

### 2. Backend, Database & Pipelines (`/app/api`)
* **FR-06 (PostgreSQL & Dual Prisma DSNs):** Таблицы `Lead`, `IntakeSubmission`, `CalculatorLog`, `BookingEvent`, `Contract`. `DATABASE_URL` через PgBouncer (порт 6432) для транзакций, `DIRECT_URL` (порт 5432) для миграций.
* **FR-07 (Inngest Task Engine):** Воркер `lead-enrichment`: валидация email $\to$ создание лида в Twenty CRM $\to$ обезличенный алерт в Telegram $\to$ бриф в Outline.
* **FR-08 (Cal.diy Webhook Handler):** Синхронизация статусов встреч (`/app/api/webhooks/caldiy/route.ts`) с проверкой подписи и идемпотентности.
* **FR-09 (DocuSeal & Payment Webhook Handler):** Связка подписи договора с получением 40% оплаты через Stripe/Paddle (`/app/api/webhooks/payment/route.ts`) с защитой от повторной обработки по `event_id`.

### 3. Non-Functional Requirements, DevOps & Security
* **NFR-01 (Performance & Lazy Loading):** PageSpeed Score $\ge 95$ на десктопе, First Contentful Paint $< 0.8\text{ s}$. Скрипты Chatwoot и Cal.diy загружаются строго через `requestIdleCallback` или по первому скроллу; туры Arcade/Storylane — click-to-play (iframe только по клику), телеметрия RAM — ленивая загрузка. Гейт: T-028.
* **NFR-02 (Zero Data Leak & Zero-Open-Ports Isolation):** Боевая CRM и сервисы закрыты за Authentik SSO/mTLS. Доступ к серверу — строго через Cloudflare Tunnel (`cloudflared`) с правилом `nftables default drop` на все входящие порты. Административный SSH — через выделенный `cloudflared` hostname с Cloudflare Access, без проброса портов.
* **NFR-03 (Hardened Memory Fencing Spec):** Конфигурация Docker Compose (`portal` + FOSS-стек) с обязательным `pgbouncer` контейнером (лимит пула 30 коннектов), суммарным лимитом контейнеров **$\le 13.5\text{ GB RAM}$** (текущая сумма **13.4 GB**) при неснижаемом буфере хоста **$\ge 2.6\text{ GB}$** на Hetzner CPX42 (16 GiB, `fsn1`).
* **NFR-04 (Offsite Automated PITR Backup):** pgBackRest/WAL-G: базовый бэкап каждые 6 часов + **непрерывная WAL-архивация** (`archive_timeout = 60s`) → настоящий PITR с **RPO ≤ 5 минут**. Две независимые офсайт-копии (Hetzner Storage Box **и** Backblaze B2) с object-lock/immutable ≥ 30 дней; алерт при пропуске бэкапа/WAL; restore-тест T-027 — гейт до первого боевого лида. Стандарт `[P0-05: Backup 3-2-1-1-0]`.
