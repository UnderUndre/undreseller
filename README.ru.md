# 🛍️ undreseller — Booking & Commerce Engine on Payload

> "Без бумажки ты какашка." — Народная мудрость (2ch Folk)
> "Деплой в пятницу — как русская рулетка, только барабан полный." — DevOps & Deploy

**Repository**: `UnderUndre/undreseller`
**Foundation**: официальный [Payload Ecommerce Template](https://github.com/payloadcms/payload/blob/3.x/templates/ecommerce) (payload 3.93.0 / Next 16.4.1 / React 19.2.9 / next-intl 4.15 / grammY 1.46 / PostgreSQL 16) — pinned

---

## Что это

Отчуждаемый white-label движок для сервисного бизнеса: витрина услуг → слоты → бронь (OTP trust gate) → депозит/предоплата → уведомления (email + Telegram). Решает проблему No-Show (10–25% без защит; депозиты/no-show fees режут на ~54–69% — клиническое рецензируемое исследование + vendor-стадии). Scope Knife: ровно 3 staff-роли (`OWNER` / `OPERATOR` / `PERFORMER` + `customer`), 1 сквозной процесс, ≤1 внешняя бизнес-интеграция (Calendar Feed ICS push, отгружен; Google two-way — frozen).

### Что умеет приложение (простым языком)

1. **Онлайн-запись и магазин в одном сайте (`RU / EN`)** — клиент выбирает услугу, видит только реально свободные окна (с учётом расписания мастера, исключений и буферов до/после визита), оставляет контакты и при желании комментарий к заказу (`customerNotes`). Система на уровне базы данных гарантирует, что два человека не займут одно и то же время.
2. **Защита от ботов и «пустых» записей (Trust Gate)** — новая бронь подтверждается одноразовым 6-значным кодом на email (постоянный клиент узнаётся по защищённой cookie и проходит без кода), есть скрытое honeypot-поле от спам-ботов, rate-limiting и чёрный список по телефону/Telegram.
3. **Защита от неявок (No-Show Protection & Депозиты)** — для каждой услуги можно включить полную предоплату или частичный депозит через Stripe: слот временно держится 15 минут до оплаты и сам освобождается, если клиент не оплатил. Правила отмены/возврата считают дедлайн до визита автоматически; клиент может сам отменить или перенести запись по одноразовой ссылке из письма.
4. **Автозаполнение отменившихся окон (Waitlist)** — если слотов на нужный день нет, клиент подписывается на лист ожидания (с подтверждением почты). Как только кто-то отменяет бронь или истекает неоплаченный холд, система сама рассылает приглашение следующим в очереди.
5. **Два Telegram-бота для команды и клиентов** — персоналу прилетают карточки новых записей с кнопками (`Approve / Reject / Reschedule / Complete / Blacklist`), а клиентам — напоминания и кнопки подтверждения/отмены. Очередь сообщений (`TelegramOutbox`) переживает падения сети и лимиты Telegram.
6. **Подписка на расписание в любом календаре (ICS Feed)** — каждый мастер получает приватную ссылку `webcal://` для Google Calendar, Apple Calendar или Outlook без сложной OAuth-авторизации. Если ссылка утекла, владелец перевыпускает её одной кнопкой.
7. **Локальный AI-помощник для разбора заявок (LM Studio, опционально)** — если к записи приложен свободный текст (описание поломки, адрес выезда, ориентир бюджета), фоновая задача без задержки клиента чистит текст от телефонов, email, паспортов и IBAN, отправляет его в локальную модель на вашем GPU (данные не уходят в облако), извлекает суть, сумму и срочность. Простые заявки в пределах лимита (например, `≤ 1500 AED`) помечаются для оператора (`🟢 OPERATOR`), а дорогие/срочные/неясные — эскалируются владельцу (`🔴 OWNER ESCALATION`). Если модель выключена, всё продолжает работать в ручном режиме без единого сбоя.
8. **Личный кабинет, админка и чистка персональных данных (GDPR)** — владелец управляет каталогом, ресурсами и настройками в `/admin`, операторы работают с очередью заявок и возвратами через API без доступа к админке, а старые терминальные записи автоматически обезличиваются ночной задачей через 90 дней.

### Дорожная карта (as-built 2026-11-18)

| Спека | Статус | Содержание |
| :--- | :--- | :--- |
| **001-reinit** | ✅ implemented (rev 1.3) | Payload-фундамент, роли, SpecKit-говернанс, FSM-kernel, payments invariants |
| **002-booking-domain** | ✅ accepted (rev 1.2) | Слоты/availability, бронирование, GiST+advisory двойная броня, OPERATOR approvals, /book витрина, rate limit |
| **003-no-show-protection** | ✅ implemented (`3697b3d`) | Депозиты/предоплата (Stripe webhooks CAS), возвраты, напоминания (Resend), самоотмена/перенос по токенам |
| **004-telegram-bots** | ✅ implemented (`9efe76a`) | Dual bots (staff pager + client), durable outbox (CTE SKIP LOCKED), CAS-действия, blacklist, GDPR-редакция |
| **005-calendar-feed** | ✅ implemented (rev 2.1, `3a576e4`) | Однонаправленный ICS push per-resource (RFC 5545, HMAC-токен + ротация, ETag/304); GC two-way frozen |
| **006-waitlist-autofill** | ✅ implemented (`a66eed5`) | Waitlist с double-opt-in, матчинг освободившихся слотов, claim FSM (HMAC bind), campaign cap |
| **007-booking-trust-gate** | ✅ implemented (`b1d095b`) | Двухфазная OTP-бронь (BookingIntents), trust-cookie fast path, honeypot, серверная идемпотентность |
| **008-audit-hardening** | ✅ implemented (`db0d91c`) | Доменная миграция (12 таблиц), CSP, GDPR purge, переписанная staff authz, fail-closed |
| **009-ux-hygiene** | ✅ implemented (`03ce933`) | 13+ UX-фиксов из FR-BK backlog, grid-валидация reschedule |
| **010-i18n** | ✅ implemented (`4f8f5e0`) | next-intl ru/en, `[locale]`-роутинг, locale detect middleware |
| **011-multitenant** | ❄️ frozen | только design.md (tenant-per-database vs shared DB) — ждёт спроса |
| **012-deposit-telegram** | ✅ implemented (`30b0072`) | `paymentMode DEPOSIT` (charge только депозита), DepositPayment (Stripe Elements), env-проводка токенов ботов |
| **013-local-ai-triage** | ✅ implemented (`a2fd283`) | Асинхронный Local AI Triage (LM Studio на GPU хоста), PII-санитайзер, детерминированная матрица делегирования, eval-сьют (26 кейсов) |

---

## Быстрый старт

```bash
cp .env.example .env                     # задай DATABASE_URL, POSTGRES_PASSWORD, PAYLOAD_SECRET (fail-closed)
pnpm ii                                  # install (настройки в pnpm-workspace.yaml)
docker compose up -d                     # Postgres 16 (undreseller_db :5432)
docker exec undreseller_db psql -U postgres -c "CREATE DATABASE undreseller_test"  # однократно, для int-тестов
pnpm dev                                 # dev-сервер (push-схема)
```

> ⚠️ Первый пользователь инстанса: на пустой БД `Users.create` требует заголовок `X-Bootstrap-Token` (timing-safe vs `OWNER_BOOTSTRAP_TOKEN`, fail-closed). Регистрируй OWNER **до открытия публичного ingress** — takeover-окно равно нулю (runbook: `specs/main/architecture.md` §4.1).

### Опциональный Local AI Triage (LM Studio на GPU хоста)

```bash
# 1. Подними Local Server в LM Studio на своём ПК/GPU (например, порт 1235) с загруженной моделью
# 2. Добавь в .env (если не задано — триаж безопасно отключается в skipped):
LOCAL_LLM_BASE_URL=http://127.0.0.1:1235/v1
LOCAL_LLM_MODEL=gemma-4-e2b-uncensored-hauhaucs-aggressive
# 3. Прогони живой бенчмарк из 26 кейсов:
pnpm eval:ai
```

### Команды

| Команда | Что делает |
| :--- | :--- |
| `pnpm validate` | tsc --noEmit |
| `pnpm lint` | eslint (flat config) |
| `pnpm build` | production Next build |
| `pnpm test:int` | vitest — 21 интеграционный сьют (изолированная `undreseller_test` через `test.env`) |
| `pnpm eval:ai` | живой AI-бенчмарк (26 кейсов против локальной LM Studio) |
| `pnpm test:e2e` | playwright (нужны Stripe test keys + `pnpm stripe-webhooks`) |
| `pnpm stripe-webhooks` | форвард stripe CLI → `/api/payments/stripe/webhooks` (dev) |
| `pnpm generate:types` | регенерация `src/payload-types.ts` (ручные правки запрещены) |
| `pnpm audit` | supply-chain gate (0 High/Critical) |

### Роли и доступ

| Роль | Payload /admin | Возможности |
| :--- | :--- | :--- |
| `OWNER` | ✅ полный | всё, включая роли, настройки, ротацию calendar-feed |
| `OPERATOR` | ❌ | диспетчеризация броней + решения по возвратам (app-API: approvals, staff/refunds) |
| `PERFORMER` | ❌ | персональное расписание (app-API) |
| `customer` | ❌ | покупка/бронирование, свои заказы |

---

## Архитектура (кратко)

```text
[Браузер/TMA] ──► Next.js 16 (App Router, [locale] ru/en)
                    ├── витрина: /shop /book /book/[slug] /checkout /orders
                    │   waitlist + страницы cancel/reschedule/acknowledge по токенам
                    ├── /api: booking (двухфазный OTP) · approvals · waitlist ·
                    │   calendar feed (ICS) · telegram webhooks · stripe
                    └── (payload) админка (OWNER-only)
                          │
                          ▼
                 Payload 3.93 (Local API + REST; GraphQL выключен в prod)
                    ├── BookingIntents · SlotReservations (FSM) · WaitlistEntries
                    ├── TelegramOutbox · TgLink · Blacklist · InboxEvent
                    ├── AuditEvents (append-only) · EmailDeliveryLog · PaymentEvents
                    └── @payloadcms/db-postgres ──► PostgreSQL 16
                          │  GiST EXCLUDE + advisory locks (double-booking)
                          ▼
                 Stripe PaymentIntent (checkout + депозиты; Payload Jobs ×9 sweeps/tasks)
```

- **Booking FSM** — pure-ядро `src/lib/kernel/bookingFsm.ts` (two-track FREE/PREPAID, hold TTL 15m, UNDERPAID staff resolution); IO-слой — `src/lib/booking/bookingService.ts` (единственный писатель статусов, xact advisory lock).
- **Trust gate** — `POST /api/booking` фаза 1 создаёт интент + OTP на email (202); фаза 2 верифицирует OTP → бронирует (201); валидный trust-cookie (HMAC, 90d) идёт мимо OTP.
- **Availability** — pure `src/lib/availability/computeSlots.ts` + DB-resolver + slot-cache 20s; публичный `GET /api/availability`.
- **Fail-closed** повсюду: секреты, доступы, коллекции default-deny, boot-проверка `REPLICA_COUNT=1`.

---

## Тесты

**21 сьют / 212 тестов** (vitest, изолированная тест-БД — никогда не трогает dev):

booking-fsm (43 сценария) · trust-gate (22) · payments-invariants (13) · calendar-feed (11) · booking-service (12) · availability BVA (11) · waitlist (11) · prepaid-booking (10) · booking-route (10) · local-ai-triage (10) · telegram-client/outbox (13) · tokens-sweep (6) · gist-race (100 конкурентных вставок → 1/99×23P01) · refund-policy · deposit-flow · rate-limit · error-shapes · access-roles · bootstrap-token.

Регрессионный эталон легаси: 58 сьютов / 436 тестов — источник тест-дизайна.

---

## Документация (Diátaxis hub: [`specs/main/README.md`](specs/main/README.md))

- **Architecture (as-built v3.1.0)**: [`specs/main/architecture.md`](specs/main/architecture.md)
- **Requirements map**: [`specs/main/requirements.md`](specs/main/requirements.md)
- **Спеки 001–010, 012–013 (implemented)**: таблица в hub'е · **011-multitenant**: [`specs/011-multitenant/design.md`](specs/011-multitenant/design.md) (frozen)
- **SpecKit pipeline**: `/speckit.specify → .requirements-audit → .plan → .tasks → .test-design → .analyze → .review (×2) → .implement → .qa-signoff` — конституция [`.specify/memory/constitution.md`](.specify/memory/constitution.md) v1.10.1

## Инфраструктура

- Docker: `docker-compose.yml` — Postgres 16 (Memory Fencing 4096/2048M); app-сервис ≤500 MB (deploy runbook)
- Миграции: `payload migrate` (prod) — 5 миграций, включая доменную схему (12 таблиц), deposit enum и local AI triage; dev — push
- Variables: см. `.env.example` (`PAYLOAD_SECRET` fail-throw на буте; все HMAC/OTP-токены keyed на нём — ротация инвалидирует one-time ссылки)
