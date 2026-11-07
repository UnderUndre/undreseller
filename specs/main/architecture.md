# Architecture (as-built): undreseller on Payload — v2.1.0

**Date**: 2026-11-07 · **Lineage**: 001-reinit (legacy v1.x architecture archived in `repos/undreseller-legacy/specs/main/`)
**Фундамент**: официальный Payload Ecommerce Template (payload 3.93.0 / Next 16.3.3→16.4.1 hotfix / React 19 / PG16 / Stripe) — pinned.

## 1. Topography

```text
undreseller/
├── src/
│   ├── payload.config.ts        # Payload root: collections, db-postgres, plugins, globals, jobs
│   ├── collections/             # Users, Pages, Categories, Media, Products (plugin) — template
│   │   │                        #   + SlotReservations, Resources, WeeklyHours,
│   │   │                        #     AvailabilityExceptions, AuditEvents (002)
│   │   └── Users/hooks/         # ensureFirstUserIsOwner (bootstrap-token, 002)
│   ├── access/                  # roles.ts (hasMinimumRole max-иерархия) + helpers (001 sweep)
│   │   └── bootstrapToken.ts    # timing-safe OWNER bootstrap (002)
│   ├── globals/ShopSettings.ts  # timeZone + quantumMin (002)
│   ├── lib/
│   │   ├── kernel/              # bookingFsm.ts (pure FSM 1:1 легаси) + reservationStatus.ts (SSOT enum)
│   │   ├── booking/             # bookingService.ts — доменный сервис, ЕДИНСТВЕННЫЙ status-writer (002)
│   │   ├── availability/        # computeSlots.ts (PURE) + tz.ts + resolver.ts (002)
│   │   └── payments/            # invariants.ts (minor units, Stars/фиат, Order.amount polymorphic) — 001
│   ├── security/rateLimiter.ts  # bounded fixed window + trusted proxy IP (002)
│   ├── plugins/                 # ecommerce (carts/orders/transactions/variants), seo, form-builder
│   ├── app/(app)/               # storefront: /shop /book /book/[slug] /book/confirmation /checkout /orders
│   ├── app/api/                 # availability · booking (+[id], [id]/cancel) · approvals · stripe (шаблон)
│   └── app/(payload)/           # Payload admin (OWNER-only)
├── src/migrations/              # payload migrate: full-schema snapshot + defense DDL (GiST/EXCLUDE/B-tree/partial-unique)
├── tests/
│   ├── int/                     # 10 сьютов: api, bootstrap-token, booking-fsm (42 legacy scenarios),
│   │                            #   access-roles, payments-invariants, error-shapes, gist-race (100×),
│   │                            #   availability BVA, rate-limit
│   ├── e2e/                     # playwright: admin, frontend/checkout (Stripe test keys), booking-flow
│   └── helpers/                 # seedUser.ts (explicit OWNER)
├── specs/                       # SpecKit contour: 001 (implemented), 002 (implemented), 003–005 (drafts)
└── docker-compose.yml           # Postgres 16 (fencing 4096/2048M) + app-сервис doc-block ≤500 MB
```

## 2. Data flow (as-built 001+002)

### Booking (FREE track — IN_CALL, auto-confirm)
```text
/book → GET /api/availability?service&date        # pure computeSlots: weekly hours
       │                                          # − exceptions − busy(±buffers) − past
       ▼
POST /api/booking {product, start, customer, idempotencyKey}
       │  rate-limit 10/60s → валидация → drizzle.transaction:
       │    pg_advisory_xact_lock(resource)        # L1 сериализация
       │    re-check overlap (±buffers)            # L1 повторная проверка
       │    transitionBookingFsm(AVAILABLE, CREATE_BOOKING)  # pure FSM
       │    INSERT SlotReservation(BOOKED) + Order(processing) + AuditEvent
       │    [GiST EXCLUDE = L2 backstop → 23P01 → 409]
       ▼
GET /book/confirmation/[id]?accessToken&cancelToken   # one-time cancel link
```

### OUT_CALL (требует approval)
```text
POST /api/booking → FSM AVAILABLE → PENDING_APPROVAL
GET /api/approvals (OPERATOR+) → POST approve → FSM STAFF_APPROVE → CONFIRMED/BOOKED (CAS scheduleVersion)
                              → POST reject  → FSM STAFF_REJECT → RELEASED (слот свободен)
```

### Checkout (шаблон, продукты)
`POST /api/payments/stripe/initiate` (PaymentIntent + transaction) → Elements → `confirm-order` (settlement-валидация + атомарный инвентарь) → Order по `accessToken` для гостей. Серверные Stripe webhook-хендлеры — 003 (с PREPAID-треком броней).

## 3. AuthN/AuthZ

- Payload JWT-cookie (14d), `Users.roles` = hasMany set; решения по max-иерархии `hasMinimumRole(roles, min)` (`src/access/roles.ts`).
- `/admin` и все adminOnly-поверхности — только OWNER; OPERATOR/PERFORMER — app-API (002 approvals; 003+ боты).
- **Bootstrap**: пустой инстанс → `Users.create` требует `X-Bootstrap-Token` (timing-safe vs `OWNER_BOOTSTRAP_TOKEN`); после первого OWNER публичная регистрация открыта (только `customer`). Takeover-окно = 0.
- Поле `status` SlotReservations — airtight (field-access `create/update: false`); мутации — только доменный сервис.

## 4. Double-booking defense (двухуровневая)

1. **L1** `pg_advisory_xact_lock(hashtext('resource_slot_lock_'||resourceId))` в транзакции бронирования.
2. **L2** GiST EXCLUDE-констрейнт `(resource_id WITH =, tstzrange(start,end) WITH &&) WHERE status IN (active)` — 23P01 → 409.
Плюс B-tree `(resource_id, start_time)` для availability-запросов (p95 < 50 ms) и partial-unique `idempotency_key`.
Миграция: `src/migrations/` (Expand-only, down.sql дропает только новое).

## 5. Extension surfaces (roadmap 003+)

| Поверхность | Спека | Механика |
| --- | --- | --- |
| No-Show Protection (депозиты, reminders, cancel/reschedule policy) | 003 | Stripe webhooks + Payload Jobs (schedule/waitUntil) + Resend-канал |
| Telegram bots (staff pager, client confirm, outbox) | 004 | grammY + durable outbox-коллекция |
| Payments: Stars / NOWPayments | 006 | pluggable PaymentAdapter + `lib/payments/invariants.ts` (уже pure в 001) |
| Google Calendar sync | 005 | OAuth vault + FSM→GC decision table + syncToken import |
| Мульти-сервисная корзина, waitlist, PII-гигиена, i18n-поля | 006+ | port-map |

## 6. Governance

- Constitution: `.specify/memory/constitution.md` v1.10.1 (app-repo adaptation: pnpm/vitest/playwright; clai-helpers/publish gates N/A).
- Quality gates: `pnpm validate` · `pnpm lint` · `pnpm test:int` · `pnpm build` · `pnpm generate:types` drift-free · `pnpm audit` 0 H/C · log-hygiene (PCI DSS Req 10).
- Deploy: Docker image из тегированных коммитов на VPS заказчика; app ≤500 MB RAM (NFR-103); миграции — `payload migrate`.
- Deployment runbook (bootstrap владельца до ingress): §4.1.

## 7. Feature Reference (as-built)

| Feature | Статус | Ключевые артефакты |
| --- | --- | --- |
| 001-reinit | ✅ implemented | фундамент, governance, FSM-kernel, invariants, roles |
| 002-booking-domain | ✅ implemented (override-gate) | bookingService, availability, GiST, approvals, /book UI, 108 тестов |
| 003-no-show-protection | drafted | депозиты Stripe + reminders + policy (спека rev 1.0) |
| 004-telegram-bots | drafted | dual bots + durable outbox (спека rev 1.0) |
| 005-google-calendar-sync | drafted | vault + decision table + syncToken (спека rev 1.0) |
| Легаси 001–007 | archived (`../undreseller-legacy`) | port-map: `specs/001-.../legacy-port-map.md` (11/11 доменов) |
