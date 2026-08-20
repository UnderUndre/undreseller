# ЧАСТЬ 1: Глубокий аудит категорий (Deep Categorical Teardown)

```
                     ┌────────────────────────────────────────────────────────┐
                     │          ENTERPRISE-GRADE FOSS SMB STACK 2026          │
                     └────────────────────────────────────────────────────────┘
                                                  │
         ┌──────────────────┬─────────────────────┼─────────────────────┬──────────────────┐
         ▼                  ▼                     ▼                     ▼                  ▼
   [PROJECTS & OPS]     [WIKI & DOCS]       [SUPPORT/DESK]        [SYNC & DRIVE]    [INTERNAL TOOLS]
    Plane.so / Vikunja   Outline / BookStack  Chatwoot / FreeScout  OCIS / Seafile    Budibase / Appsmith
         │                  │                     │                     │                  │
         └──────────────────┴─────────────────────┼─────────────────────┴──────────────────┘
                                                  ▼
                                       [SHARED FOUNDATION]
                                  PostgreSQL + Redis + Traefik/Caddy
```

---

### 1. Project & Task Management (Замена Linear, Jira, Asana, Monday)

*SaaS-Tax Kill Ratio:* Linear ($8–16/user/mo) или Jira ($8.15–16/user/mo). Для компании на 20 человек это **$1 900 – $3 800 в год**.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Plane.so** | Django / Python + Next.js / TypeScript<br>*(Postgres, Redis, MinIO)* | **4 – 6 GB** | Apache-2.0 (Core) / BSL (Commercial).<br>SAML/SSO в Enterprise. | Лучший UI на рынке (близко к Linear), Cycles, Modules, Pages, полная замена Jira. | 8–10 контейнеров в compose-файле. Миграции между версиями иногда роняют схемы БД, если не читать release notes. |
| **Huly Platform** | Node.js + React<br>*(CockroachDB, Elasticsearch, Redpanda, MinIO)* | **8 – 16 GB** | EPL-2.0 / BSL.<br>Лимиты на звонки/LiveKit. | Объединяет Linear + Slack + Notion + GitHub Sync. Экстремальная скорость UI. | **Инфраструктурный ад.** Тянет CockroachDB, Redpanda (Kafka), Elasticsearch. Жрёт память как не в себя. Для VPS за $20 не вариант. |
| **Vikunja** | Go + Vue.js<br>*(PostgreSQL / SQLite)* | **256 – 512 MB** | AGPL-3.0.<br>Полностью открыта, без paywall. | Монолит на Go, взлетает за 30 секунд, идеален для Kanban/Gantt и простых списков задач. | Нет продвинутого трекинга дефектов и циклов (Cycles) для чисто продуктовой разработки уровня Linear. |

* **Вердикт для агентства:** **Plane.so** — если клиенту нужен уровень Linear/Jira для IT-команд. **Vikunja** — если у клиента классический non-tech SMB (услуги, логистика, консалтинг), где 95% функционала Jira только создают засор в мозгах.

---

### 2. Knowledge Base & Team Wiki (Замена Notion, Confluence, Slite)

*SaaS-Tax Kill Ratio:* Notion ($10–18/user/mo) / Confluence ($6–11/user/mo). Экономия: **$2 400 – $4 300 в год** на 20 человек.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Outline** | Node.js + React<br>*(PostgreSQL, Redis, S3/MinIO)* | **1 – 1.5 GB** | BSL 1.1 (Source-Available).<br>Бесплатно внутри компании, запрещено перепродавать как multi-tenant SaaS. | Эталонный Notion-like UI. Совместное редактирование в реальном времени, экспорт в Markdown, молниеносный поиск. | Принудительно требует внешний OIDC/OAuth провайдер (Google Workspace / Authentik / Keycloak / Slack) — встроенного логина с паролем из коробки нет. |
| **Docmost** | NestJS + React<br>*(PostgreSQL, Redis)* | **1 – 2 GB** | AGPL-3.0 (Core).<br>SSO (SAML/OIDC), MFA и Bases залочены в Business ($3.5/user/mo). | Есть встроенная локальная авторизация (email/pass), Spaces, диаграммы Draw.io/Excalidraw/Mermaid. | Разработчики начали закручивать гайки: MFA и базы данных вырезали в коммерческий план. |
| **BookStack** | PHP (Laravel) + Blade/JS<br>*(MySQL / MariaDB)* | **256 – 512 MB** | MIT (Полная свобода).<br>Всё бесплатно, включая SAML/OIDC. | Неубиваемый танк. Четкая структура (Книги > Главы > Страницы). Стабильность миграций 100%. | UI морально остался в 2018 году. Нет модного "блочного" редактирования через слеш-команды (/slash). |

* **Вердикт для агентства:** **Outline** в связке с Authentik (OIDC) — продаётся с закрытыми глазами, клиентский восторг обеспечен. Если клиент консервативен и авторизация по SSO ему сложна — ставим **BookStack**.

---

### 3. Customer Support & Live Chat (Замена Intercom, Zendesk, Crisp)

*SaaS-Tax Kill Ratio:* Intercom ($39–99/seat/mo) / Zendesk ($55–115/seat/mo). Экономия: **$6 000 – $15 000 в год** на команду из 5 саппортов + 15 участников.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Chatwoot** | Ruby on Rails + Vue.js<br>*(PostgreSQL, Redis, Sidekiq)* | **2 – 3 GB** | MIT (Community) / EE.<br>Audit logs и расширенный CSAT за пейволлом. | Омниchannel: Telegram, WhatsApp, Email, Live-chat на сайте. Готовые мобильные приложения (iOS/Android). | Ruby/Sidekiq прожорливы к памяти при всплесках трафика. Настройка интеграции с WhatsApp Business API требует времени. |
| **FreeScout** | PHP (Laravel) + Vue.js<br>*(MySQL / MariaDB)* | **300 – 500 MB** | AGPL-3.0 (Core).<br>Модули (WhatsApp, Telegram, LiveChat) платные ($10–$40 one-time). | 1-в-1 клон Help Scout. Работает на копеечном сервере. Идеальная обработка входящего Shared Inbox по Email. | Модульная система коммерциализирована создателем (хотя разовые платежи за модули копеечные). |

* **Вердикт для агентства:** **Chatwoot** — абсолютный отраслевой стандарт для многоканального саппорта с мобилками.

---

### 4. Meeting Scheduling & Booking (Замена Calendly, Chili Piper)

*SaaS-Tax Kill Ratio:* Calendly ($12–16/user/mo). Экономия: **$1 500 – $2 500 в год** на 10–15 активных сотрудников.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cal.com** | Next.js + Node.js + Prisma<br>*(PostgreSQL, Redis)* | **1.5 – 2.5 GB** | AGPL-3.0 + Commercial clauses.<br>Whitelabeling и Teams фичи частично ограничены. | Убивает Calendly наглухо. Интеграция с Google/Outlook календарями, Cal Video / Jitsi / Zoom, прием оплат через Stripe. | Тяжелый билд при сборке из исходников. Лучше разворачивать строго через официальный docker-compose образ. |
| **Easy!Appointments** | PHP (CodeIgniter) + JS<br>*(MySQL)* | **128 – 256 MB** | GPL-3.0.<br>Полный Open Source. | Легче пера, разворачивается за 5 минут для парикмахерских, клиник или частных консультантов. | Устаревший UI, слабая командная маршрутизация (Round-Robin для сейлзов отсутствует). |

* **Вердикт для агентства:** **Cal.com**. Клиент получает премиальный интерфейс букинга встреч со своим логотипом на своем домене (`meet.clientdomain.com`).

---

### 5. Product & Web Analytics (Замена Google Analytics 4, Mixpanel, Amplitude)

*SaaS-Tax Kill Ratio:* Mixpanel ($28–100/mo) / Amplitude ($49–150/mo) / Упущенная выгода от потери данных из-за блокировщиков GA4 (до 30% трафика).

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Umami** | Next.js / Node.js<br>*(PostgreSQL или MySQL)* | **300 – 500 MB** | MIT (Полный Open Source).<br>Никаких скрытых пейволлов. | GDPR-compliant без cookie-баннеров, обходит AdBlock (работает через custom proxy/subdomain), чистейший быстрый UI. | Это Web-аналитика (трафик, UTM, базовые события), а не глубокие когортные воронки или A/B тесты. |
| **Plausible** | Elixir + React<br>*(ClickHouse, PostgreSQL)* | **1 – 1.5 GB** | AGPL-3.0.<br>Enterprise SSO за пейволлом. | Быстрый благодаря ClickHouse, красивые дашборды. | Наличие ClickHouse усложняет бэкапы по сравнению с простым pg_dump у Umami. |
| **PostHog** | Python + Django + React<br>*(ClickHouse, Kafka/Redpanda, Postgres, Redis)* | **12 – 16+ GB** | MIT (Docker Compose Hobby).<br>Enterprise Self-hosted выпилен вендором. | Полноценный клон Mixpanel + Session Replay + Feature Flags. | **Гидроудар по серверу.** Без выделенного девопса ClickHouse и Kafka рухнут через 3 недели сбора событий. |

* **Вердикт для агентства:** **Umami** (100% случаев для SMB сайтов и лендингов). Если клиенту жизненно нужен Mixpanel/Amplitude уровня продуктовой аналитики сотен тысяч событий — отправляем на PostHog Cloud (у них бесплатный tier до 1M событий в месяц выгоднее любого хостинга).

---

### 6. Internal Communication & Team Chat (Замена Slack, MS Teams)

*SaaS-Tax Kill Ratio:* Slack Pro ($8.75/user/mo) / MS Teams ($6–12.50/user/mo). Экономия: **$2 100 – $4 200 в год** на 20 человек.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mattermost** | Go + React<br>*(PostgreSQL)* | **2 – 3 GB** | AGPLv3 / Commercial.<br>CE ограничена по LDAP sync / advanced permissions. | Прямой клон Slack. Отличные десктопные и мобильные клиенты, Playbooks, Boards. Стабилен как гранит. | Push-уведомления на мобилки идут через Test Push Notification Service (TPNS) с лимитами, если не купить лицензию или не собрать свой mobile app. |
| **Zulip** | Python (Django) + JS<br>*(PostgreSQL, Redis, RabbitMQ)* | **2 – 4 GB** | Apache-2.0 (100% Open Source).<br>Все фичи открыты, включая SSO/OIDC. | Уникальная система тредов/тем (потоков), которая предотвращает хаос в переписке 50+ человек. | Специфический UX: сейлзы и менеджеры часто саботируют модель "Topic-based threading", требуя "обычный чат". |
| **Rocket.Chat** | TypeScript / Node.js<br>*(MongoDB)* | **3 – 5 GB** | MIT / Proprietary.<br>В CE ограничили число push-уведомлений до 10к/мес и заблокировали кучу фич. | Богатый функционал omni-channel и матричных интеграций. | MongoDB в основе (лишняя СУБД в стеке), вендор агрессивно режет возможности бесплатной версии. |

* **Вердикт для агентства:** **Mattermost** для классических команд; **Zulip** для инженерных команд с высокой плотностью обсуждений.

---

### 7. Cloud Storage & Drive (Замена Google Drive, Dropbox, Box)

*SaaS-Tax Kill Ratio:* Google Workspace / Dropbox Business ($15–18/user/mo). Экономия: **$3 600 – $4 300 в год** на 20 человек.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ownCloud Infinite Scale (OCIS)** | Go (Микросервисы)<br>*(Metadata на диске/S3, No DB)* | **500 MB – 1 GB** | AGPL-3.0.<br>Чистый FOSS. | **Новый король.** Написан на Go, файловая система CS3/TUS, не требует SQL-базы, работает в 10 раз быстрее Nextcloud, нативный Nextcloud-compatible WebDAV. | Меньше плагинов, чем у Nextcloud (чисто файловый сервер и диск). |
| **Nextcloud Hub** | PHP + Vue.js<br>*(PostgreSQL / MariaDB, Redis)* | **3 – 6 GB** | AGPL-3.0.<br>Полный FOSS. | Огромная экосистема: интеграция OnlyOffice/Collabora, контакты, календари, задачи. | Монолит на PHP. Медленная синхронизация миллионов мелких файлов, тяжелые миграции, частые конфликты версий плагинов при апгрейдах. |
| **Seafile** | C + Python<br>*(MySQL/PostgreSQL, Memcached)* | **1 – 1.5 GB** | AGPL-3.0 (Community) / Pro (до 3 юзеров бесплатно). | Блочный (дельта) алгоритм синхронизации на C — самый быстрый в мире sync файлов без конфликтов. | Хранит файлы блоками/чанками (внутри своего блоб-хранилища), на сервере файлы нельзя прочитать напрямую через файловую систему. |

* **Вердикт для агентства:** **ownCloud Infinite Scale (OCIS)** — если нужен быстрый Google Drive без головной боли. **Nextcloud** — только если клиенту нужен OnlyOffice для совместного редактирования документов прямо в браузере.

---

### 8. Internal Tool Builders & Admin Panels (Замена Retool, Appsmith Cloud)

*SaaS-Tax Kill Ratio:* Retool ($10–50/user/mo). Экономия: **$2 400 – $6 000 в год**.

| Решение | Стек & СУБД | Production RAM | Лицензия & Грабли | Железные плюсы | Скрытые засоры (Dealbreakers) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Budibase** | Node.js + Svelte<br>*(CouchDB / MinIO / PostgreSQL)* | **1.5 – 2.5 GB** | GPL-3.0.<br>SSO/Audit logs в Enterprise. | Быстрая сборка форм, CRUD-панелей и авто-генерация UI под существующую SQL БД. Отличный UX для non-tech пользователей. | Встроенная база на CouchDB накладывает нюансы на бэкапы. |
| **Appsmith** | Java (Backend) + React<br>*(MongoDB, PostgreSQL)* | **2 – 4 GB** | Apache-2.0.<br>RBAC и аудит залочены в Business. | Мощнейшая работа с JS-кодом внутри виджетов, тысячи готовых коннекторов к REST/GraphQL/БД. | Backend на Java жрёт память; монструозный размер образов. |
| **NocoBase** | Node.js + React/Koa<br>*(PostgreSQL / MySQL / SQLite)* | **1 – 1.5 GB** | AGPL-3.0 (Core) + Плагины.<br>Часть enterprise-плагинов платная. | Полностью плагинная архитектура. Позволяет собрать собственный аналог Airtable/Airtable+Retool без единой строчки кода. | Более молодой проект, комьюнити меньше, чем у Appsmith. |

* **Вердикт для агентства:** **Budibase** для быстрой сборки типовых корпоративных порталов/панелей за 1 рабочий день.

---

# ЧАСТЬ 2: "Grand Slam Self-Hosted Office" (Топ-5 Must-Have стек)

Пакетное предложение для SMB, разворачиваемое за 1–2 рабочих дня на одном выделенном сервере.

```
                    ┌──────────────────────────────────────────────────┐
                    │       HETZNER CPX41 (8 vCPU, 16 GB RAM)         │
                    └──────────────────────────────────────────────────┘
                                              │
                      Traefik v3 (Reverse Proxy + Auto SSL Let's Encrypt)
                                              │
         ┌───────────────┬────────────────────┼───────────────────┬───────────────┐
         ▼               ▼                    ▼                   ▼               ▼
    [OUTLINE]       [PLANE.SO]           [CHATWOOT]            [CAL.COM]       [AUTHENTIK]
  (Wiki / Docs)   (Tasks / Issues)   (Omnichannel Inbox)   (Booking Engine)   (SSO IdP Hub)
   ~1.5 GB RAM      ~4.0 GB RAM          ~2.5 GB RAM          ~2.0 GB RAM       ~1.5 GB RAM
         │               │                    │                   │               │
         └───────────────┴────────────────────┼───────────────────┴───────────────┘
                                              ▼
                             Shared Infrastructure Tier:
                 PostgreSQL 16 + Redis 7 + MinIO (S3) [Total RAM: ~2.5 GB]
```

### Железо & Экономика

* **Сервер:** Hetzner Cloud **CPX41** (8 vCPU AMD, 16 GB RAM, 240 GB NVMe) = **~€28/месяц**.
* **Суммарное потребление RAM стека в боевом режиме:** ~14–15 GB (с буферами БД).
* **Юнит-экономика для агентства:**
  * Стоимость внедрения "под ключ" (Setup Fee): **$3 500**.
  * Ежемесячный саппорт/бэкапы/мониторинг (SLA): **$350–$500/месяц**.
  * Себестоимость инфраструктуры: ~$30/месяц.
  * **Клиент экономит от $15 000/год** на SaaS-подписках, получая полную независимость данных (GDPR/Compliance Ready).

### Архитектура и бэкапы (Никаких распределенных засоров)

1. **SSO / Identity Provider:** **Authentik** (на базе PostgreSQL). Выступает единым источником правды для логинов, связывая Google Workspace/Active Directory или локальные учетки со всеми сервисами через OIDC.
2. **БД-слой:** Единый контейнер `PostgreSQL 16` с отдельными базами и пользователями под каждый сервис (`outline_db`, `plane_db`, `chatwoot_db`, `cal_db`, `authentik_db`).
3. **Хранилище файлов:** `MinIO` (S3-compatible) под маунтом локального NVMe.
4. **Канализация бэкапов (Fail-Safe Strategy):**
   * Еженощный cron-скрипт делает атомарные `pg_dumpall` с компрессией `zstd`.
   * Дампы БД + снапшоты каталогов MinIO шифруются через `restic` и улетают в удаленный бакет Hetzner Storage Box / AWS S3.
   * Восстановление с нуля (RTO) при полном сгорании ноды: **40 минут** по команде `docker compose up -d` + `restic restore`.

---

# ЧАСТЬ 3: "Blacklist: Никогда не ставь клиентам"

Если не хочешь, чтобы тебе звонил генеральный директор клиента в субботу в три часа ночи с воплями о сорванной сделке — никогда не продавай им эти технологии в виде self-hosted решений:

```
                            ╔═══════════════════════════════════╗
                            ║     THE PRODUCTION BLACKLIST      ║
                            ╚═══════════════════════════════════╝
                                 │                         │
            ┌────────────────────┴──────────┐   ┌──────────┴────────────────────┐
            ▼                               ▼   ▼                               ▼
   [SELF-HOSTED EMAIL]            [POSTHOG (CLICKHOUSE)]               [MATRIX / SYNAPSE]
   • IP Репутация & Спам-листы    • Kafka + ClickHouse = 16GB+ RAM     • Утечки памяти Python
   • PTR, DKIM, DMARC, ARC ад     • Миграции схем событий падают       • Федерация забивает диск
```

### 1. Собственные почтовые серверы (Mailcow, iRedMail, Stalwart)

* **В чем засор:** Настроить SMTP/IMAP с TLS и веб-мордой — дело одного часа. Но дальше начинается ад доставки (Deliverability). Твой чистый IP с Hetzner или DigitalOcean моментально помечается спам-фильтрами Microsoft 365, Google и корпоративных шлюзов.
* **Результат:** Коммерческие предложения клиентов улетают в спам. Ты будешь бесконечно ковыряться в PTR-записях, DKIM, DMARC, ARC, греть IP месяцами и унижаться перед поддержкой Outlook. Почту для SMB нужно брать строго на Google Workspace / M365 / Fastmail / Proton.

### 2. PostHog на собственном сервере (ClickHouse + Kafka Cluster)

* **В чем засор:** Вендор официально забил на поддержку самостоятельного Enterprise-развертывания. Остался только "Hobby" Docker Compose с непрерывными релизами без версионирования.
* **Результат:** ClickHouse и Redpanda под нагрузкой пожирают всю память, Zookeeper/ClickHouse ломают партиции, а бэкап ClickHouse требует отдельных утилит (`clickhouse-backup`) и профильного DBA. Для веб-аналитики ставь **Umami**, а продуктовые воронки держи на PostHog Cloud (бесплатного лимита хватит с головой).

### 3. Федеративный Matrix (Synapse / Dendrite)

* **В чем засор:** Протокол Matrix великолепен в теории, но эталонный сервер `Synapse` на Python — это черная дыра для оперативной памяти и дискового пространства. Включение федерации (Federation) приводит к тому, что твой сервер скачивает и хранит гигабайты медиа и сообщений из всех публичных комнат, куда зашли сотрудники.
* **Результат:** База SQLite/Postgres раздувается до сотен гигабайт за пару месяцев, а SQLite намертво лочит транзакции. Если нужен командный чат — используй **Mattermost** или **Zulip** с закрытым контуром.

### 4. Nextcloud с сотней сторонних плагинов

* **В чем засор:** Клиенты видят встроенный магазин расширений Nextcloud и начинают накатывать всё подряд: распознавание лиц на AI, карты, трекеры привычек, почтовые клиенты.
* **Результат:** При первом же минорном обновлении версии PHP или ядра Nextcloud половина плагинов ломает совместимость, веб-сервер выдает HTTP 500, а процесс миграции зависает на этапе `occ upgrade`. Если нужен Nextcloud — держи его "голым" только под файлы, либо ставь компилируемый **ownCloud Infinite Scale (OCIS)**.

---

грок:

**Да, я в целом согласен с документом.** Он отражает реальное состояние рынка self-hosted FOSS для SMB (5–50 человек) на 2025–2026 годы: фокус на стабильности, низком операционном overhead, SaaS-Tax Kill Ratio и «продаваемости» агентством. Рекомендации основаны на актуальных данных (Docker-требования, лицензии, реальные RAM-footprint из production-деплоев). Небольшие уточнения: лицензии Plane (Community теперь AGPL-3.0) и Cal.com (открытая часть выделена в cal.diy под MIT), а также чуть более жёсткие рекомендации по RAM для Chatwoot/PostHog. Чёрный список точен.

Ниже — обновлённый аудит с опорой на данные августа 2026 (официальные docs, GitHub, production-отчёты).

### Часть 1: Глубокий аудит категорий

#### 1. Project & Task Management (Linear/Jira/Asana/Monday)

**SaaS-Tax Kill Ratio:** $1 900–3 800/год на 20 человек.  

| Решение | Стек & СУБД | Production RAM | Лицензия & грабли | Плюсы | Dealbreakers |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Plane.so** | Django/Python + Next.js (Postgres, Redis, MinIO) | 4–8 GB (min 4, rec 8) | AGPL-3.0 Community / Commercial | Лучший UI (близко к Linear), Cycles/Modules/Pages | Много контейнеров, миграции требуют внимания |
| **Vikunja** | Go + Vue (Postgres/SQLite) | 256–512 MB | AGPL-3.0 (Pro — админка/аудит) | Лёгкий монолит, Kanban/Gantt | Нет продвинутых Cycles уровня Linear |
| **Huly** | Node + React (Cockroach/ES/Redpanda) | 8–16 GB | EPL/BSL | All-in-one | Инфраструктурный ад |

**Вердикт:** Plane.so для IT-команд; Vikunja для non-tech SMB.

#### 2. Knowledge Base & Wiki (Notion/Confluence)

**SaaS-Tax:** $2 400–4 300/год.  

| Решение | Стек | RAM | Лицензия | Плюсы | Dealbreakers |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Outline** | Node/React (Postgres, Redis, S3) | 1–1.5 GB | BSL 1.1 | Notion-like UI, realtime | Только OIDC (Authentik/Keycloak) |
| **Docmost** | NestJS/React (Postgres, Redis) | 1–2 GB | AGPL-3.0 (SSO/MFA в Business) | Встроенный email/pass, Draw.io | Часть фич в пейволле |
| **BookStack** | PHP/Laravel (MySQL) | 256–512 MB | MIT | Стабильность, структура Books→Pages | UI 2018 года |

**Вердикт:** Outline + Authentik (продаётся «с закрытыми глазами»). BookStack — для консервативных клиентов.

#### 3. Customer Support & Live Chat (Intercom/Zendesk)

**SaaS-Tax:** $6 000–15 000/год.  

| Решение | Стек | RAM | Лицензия | Плюсы | Dealbreakers |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Chatwoot** | Rails + Vue (Postgres, Redis, Sidekiq) | 2–4 GB (rec 8) | MIT Community / EE | Omnichannel + мобилки | Sidekiq прожорлив при пиках |
| **FreeScout** | PHP/Laravel (MySQL) | 300–500 MB | AGPL (модули one-time) | Лёгкий Help Scout-клон | Платные модули |

**Вердикт:** Chatwoot — отраслевой стандарт.

#### 4. Meeting Scheduling (Calendly)

**SaaS-Tax:** $1 500–2 500/год.  
**Cal.com / cal.diy** (Next.js + Prisma, Postgres/Redis): 1.5–2.5 GB, MIT (открытая часть) / commercial. Лучший UI, Stripe, Zoom/Jitsi. Легко через официальный Docker. Easy!Appointments — слишком устаревший.  
**Вердикт:** cal.diy / Cal.com.

#### 5. Product & Web Analytics (GA4/Mixpanel)

**SaaS-Tax + потери от блокировщиков.**  

| Решение | Стек | RAM | Лицензия | Плюсы | Dealbreakers |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Umami** | Next.js (Postgres/MySQL) | 300–500 MB | MIT | GDPR, обходит AdBlock, лёгкий | Только web-аналитика |
| **Plausible** | Elixir (ClickHouse) | 1–1.5 GB | AGPL | Красивые дашборды | ClickHouse усложняет бэкапы |
| **PostHog** | Django + ClickHouse/Kafka | 12–16+ GB | MIT Hobby | Full Mixpanel + Replay | Vendor не поддерживает self-hosted Enterprise |

**Вердикт:** Umami почти всегда. PostHog — только Cloud.

#### 6. Internal Chat (Slack/Teams)

**SaaS-Tax:** $2 100–4 200/год.  
**Mattermost** (Go + Postgres): 2–3 GB, AGPL/Commercial — лучший Slack-клон.  
**Zulip** (Django): 2–4 GB, Apache-2.0 — топики для инженеров.  
**Rocket.Chat** — MongoDB + агрессивные пейволлы.  
**Вердикт:** Mattermost (классика) / Zulip (async).

#### 7. Cloud Storage & Drive (Google Drive/Dropbox)

**SaaS-Tax:** $3 600–4 300/год.  
**ownCloud Infinite Scale (OCIS)** (Go, no DB): 500 MB–1 GB, Apache/AGPL — быстрый, WebDAV.  
**Seafile** (C/Python): 1–1.5 GB, AGPL — самый быстрый delta-sync.  
**Nextcloud** — тяжёлый PHP + плагины = головная боль.  
**Вердикт:** OCIS (или Seafile). Nextcloud — только «голый» + OnlyOffice.

#### 8. Internal Tool Builders (Retool)

**SaaS-Tax:** $2 400–6 000/год.  
**Budibase** (Node/Svelte): 1.5–2.5 GB, GPL — быстрые CRUD.  
**Appsmith** (Java/React): 2–4 GB, Apache — мощный JS.  
**NocoBase / ToolJet** — альтернативы.  
**Вердикт:** Budibase для агентства (1 день на типовой портал).

### Часть 2: «Grand Slam Self-Hosted Office» (Топ-5)

На Hetzner CPX41 (8 vCPU / 16 GB / ~€28/мес):

* **Outline** (~1.5 GB) — Wiki  
* **Plane.so** (~4 GB) — Tasks  
* **Chatwoot** (~2.5 GB) — Support  
* **Cal.com / cal.diy** (~2 GB) — Booking  
* **Authentik** (~1.5 GB) — SSO/OIDC  

**Shared:** PostgreSQL 16 + Redis + MinIO (~2.5 GB).  
Итого ~14–15 GB.  
Setup fee $3 500, поддержка $350–500/мес. Клиент экономит $15k+/год, данные под полным контролем (GDPR). Бэкапы: `pg_dumpall` + restic → Storage Box, RTO ~40 мин. Документ здесь полностью прав.

### Часть 3: Blacklist (Никогда не ставить клиентам)

1. **Self-hosted Email (Mailcow и т.п.)** — deliverability-ад: IP-репутация, PTR/DKIM/DMARC, спам-листы Microsoft/Google. Почту — только Workspace / M365 / Fastmail.
2. **PostHog self-hosted** — ClickHouse + Kafka = 16 GB+, vendor официально не поддерживает Enterprise, постоянные поломки. Только Cloud.
3. **Matrix/Synapse** — утечки памяти, федерация забивает диск гигабайтами.
4. **Nextcloud + 100 плагинов** — миграции ломают всё.

Документ точен, прагматичен и коммерчески жизнеспособен для productized-агентства. Небольшие обновления по лицензиям не меняют вердикты.
