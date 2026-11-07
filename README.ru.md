# 🛍️ undreseller — Booking & Commerce Engine on Payload

> "Без бумажки ты какашка." — Народная мудрость (2ch Folk)
> "Деплой в пятницу — как русская рулетка, только барабан полный." — DevOps & Deploy

**Repository**: `UnderUndre/undreseller`
**Foundation**: официальный [Payload Ecommerce Template](https://github.com/payloadcms/payload/blob/3.x/templates/ecommerce) (payload 3.93.0 / Next 16.4.1 / React 19 / PostgreSQL 16) — pinned
**Lineage**: ребейз 2026-11-06; легаси-линия 001–007 (Next 15 + Prisma) сохранена read-only в `../undreseller-legacy`
**Бизнес-план**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0 (Track 1 Mono-Engine, ICP: сервисный бизнес 3–25 сотрудников)
**Compliance**: ISO/IEC/IEEE 29148:2018 · ISO/IEC/IEEE 12207:2017 · NIST SP 800-218 SSDF

---

## Что это

Отчуждаемый white-label движок для сервисного бизнеса: витрина услуг → слоты → бронь → холд/оплата → уведомления. Решает проблему No-Show (10–25% без защит; депозиты режут на 55–65%). Scope Knife: ровно 3 staff-роли (`OWNER` / `OPERATOR` / `PERFORMER` + `customer`), 1 сквозной процесс, ≤1 внешняя бизнес-интеграция (Google Calendar, 005+).

### Дорожная карта

| Спека | Статус | Содержание |
| :--- | :--- | :--- |
| **001-reinit** | ✅ implemented (`c5f3bf1` lineage) | Payload-фундамент, роли, SpecKit-говернанс, FSM-kernel, payments invariants |
| **002-booking-domain** | ✅ implemented (override-gate) | Слоты/availability, бронирование, GiST+advisory двойная броня, OPERATOR approvals, /book витрина, rate limit |
| 003-no-show-protection | drafted | Депозиты (Stripe), email-reminders, самоотмена/перенос, планировщик |
| 004-telegram-bots | drafted | Dual bots, durable outbox, CAS-действия, GDPR-редакция |
| 005-google-calendar-sync | drafted | OAuth vault, push decision table, syncToken import, reconcile |
| 006+ | backlog | Мульти-сервисная корзина, Stars/NOWPayments, waitlist, PII-гигиена |

---

## Быстрый старт

```bash
pnpm ii            # install (--ignore-workspace убран; настройки в pnpm-workspace.yaml)
docker compose up -d                     # Postgres 16 (undreseller_db :5432)
docker exec undreseller_db psql -U postgres -c   "CREATE DATABASE undreseller_test"     # однократно, для int-тестов
pnpm dev           # dev-сервер (push-схема; первый вход /admin → создать OWNER)
```

> ⚠️ Первый пользователь инстанса: до 002-bootstrap OWNER создаётся через admin UI **до открытия публичного ingress** (runbook: `specs/main/architecture.md` §4.1).

### Команды

| Команда | Что делает |
| :--- | :--- |
| `pnpm validate` | tsc --noEmit |
| `pnpm lint` | eslint (flat config) |
| `pnpm build` | production Next build |
| `pnpm test:int` | vitest — интеграционные сьюты (изолированная `undreseller_test` через `test.env`) |
| `pnpm test:e2e` | playwright (нужны Stripe test keys + `pnpm stripe-webhooks`) |
| `pnpm generate:types` | регенерация `src/payload-types.ts` (ручные правки запрещены) |
| `pnpm audit` | supply-chain gate (0 High/Critical) |

### Роли и доступ

| Роль | Payload /admin | Возможности |
| :--- | :--- | :--- |
| `OWNER` | ✅ полный | всё, включая роли и настройки |
| `OPERATOR` | ❌ | диспетчеризация броней (app-API, 002: approvals) |
| `PERFORMER` | ❌ | персональное расписание (003+) |
| `customer` | ❌ | покупка/бронирование, свои заказы |

---

## Архитектура (кратко)

```text
[Браузер/TMA] ──► Next.js 16 (App Router)
                    ├── (app)    витрина: /shop /book /checkout /orders
                    └── (payload) админка (OWNER-only)
                          │
                          ▼
                 Payload 3.93 (REST/GraphQL/Local API)
                    ├── Products(+variants) · Carts · Orders · Transactions
                    ├── SlotReservations (fail-closed, FSM-статусы)
                    ├── Users (roles OWNER/OPERATOR/PERFORMER/customer)
                    ├── AuditEvents (append-only)
                    └── @payloadcms/db-postgres ──► PostgreSQL 16
                          │  GiST EXCLUDE + advisory locks (double-booking)
                          ▼
                 Stripe PaymentIntent (checkout; адаптеры Stars/NOWPayments — 006+)
```

- **Booking FSM** — pure-ядро `src/lib/kernel/bookingFsm.ts` (6 состояний, two-track FREE/PREPAID, hold TTL 15m, confirming-freeze 24h); IO-слой — `src/lib/booking/bookingService.ts` (единственный писатель статусов, xact advisory lock).
- **Availability** — pure `src/lib/availability/computeSlots.ts` + DB-resolver; публичный `GET /api/availability`.
- **Fail-closed** повсюду: секреты, доступы, коллекции default-deny.

---

## Тесты

**10 сьютов / 108+ тестов** (vitest, изолированная тест-БД — никогда не трогает dev):

bootstrap-token · gist-race (100 конкурентных вставок → 1/99×23P01) · availability BVA · booking-service (FSM/idempotency/cancel/approvals) · rate-limit · error-shapes · access-roles · payment-invariants · FSM legacy-parity (42 сценария) · api smoke.

 Регрессионное эталон легаси: 58 сьютов / 436 тестов — источник тест-дизайна.

---

## Документация (Diátaxis hub: [`specs/main/README.md`](specs/main/README.md))

- **Architecture (as-built)**: [`specs/main/architecture.md`](specs/main/architecture.md)
- **Requirements map**: [`specs/main/requirements.md`](specs/main/requirements.md)
- **Активная спека**: [`specs/002-booking-domain/`](specs/002-booking-domain/spec.md) (rev 1.2, antigravity PASS)
- **Спеки 003–005 (drafts)**: no-show-protection · telegram-bots · google-calendar-sync
- **SpecKit pipeline**: `/speckit.specify → .requirements-audit → .plan → .tasks → .test-design → .analyze → .review (×2) → .implement → .qa-signoff` — конституция [`.specify/memory/constitution.md`](.specify/memory/constitution.md) v1.10.1

## Инфраструктура

- Docker: `docker-compose.yml` — Postgres 16 (Memory Fencing 4096/2048M); app-сервис ≤500 MB — спека 002+ (deploy)
- Миграции: `payload migrate` (prod); dev — push. Defense-DDL (GiST/EXCLUDE) — `src/migrations/`
- Variables: см. `.env.example` (`PAYLOAD_SECRET` обязателен — fail-throw на буте)
