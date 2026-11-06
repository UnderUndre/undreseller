# Architecture (as-built): undreseller on Payload — v2.0.0

**Date**: 2026-11-06 · **Lineage**: reinit spec 001 (legacy v1.x architecture archived in `repos/undreseller-legacy/specs/main/`)
**Фундамент**: официальный Payload Ecommerce Template (payload 3.93.0 / Next 16.3.3 / React 19 / PG16 / Stripe) — pinned.

## 1. Topography

```text
undreseller/
├── src/
│   ├── payload.config.ts        # Payload root: collections, db-postgres, plugins, globals
│   ├── collections/             # Users, Pages, Categories, Media (template) + SlotReservations (001)
│   │   └── Users/hooks/         # ensureFirstUserIsAdmin → OWNER (001)
│   ├── access/                  # roles.ts (hasMinimumRole) + composed helpers (001 sweep)
│   ├── lib/
│   │   └── kernel/              # bookingFsm.ts (pure FSM port) + reservationStatus.ts (SSOT enum) — 001
│   ├── payments (lib/payments)  # invariants.ts (pure money-path guards) — 001; adapters 004+
│   ├── plugins/                 # ecommerce (carts/orders/transactions/variants), seo, form-builder
│   ├── app/(app)/               # storefront (shop, checkout, orders, account) + next/preview|seed
│   └── app/(payload)/           # Payload admin panel
├── tests/
│   ├── int/                     # vitest: api smoke, booking-fsm, access-roles, payments-invariants, error-shapes
│   ├── e2e/                     # playwright: admin + frontend/checkout (Stripe test keys)
│   └── helpers/                 # seedUser.ts (explicit OWNER role)
├── specs/                       # SpecKit contour (governance restored in 001)
└── docker-compose.yml           # Postgres 16 (undreseller_db) — app-сервис 002+
```

## 2. Data flow (001 scope)

- **Checkout (template)**: cart → `POST /api/payments/stripe/initiate` (PaymentIntent + transaction) → Stripe Elements → `confirm-order` (settlement-валидация, атомарный инвентарь-декремент, order + accessToken для гостей). Stripe webhook-хендлеры шаблоном не регистрируются — известное поведение, докрутка 004.
- **Auth**: Payload JWT-cookie (14d), `Users.roles` = set (`OWNER|OPERATOR|PERFORMER|customer`), access-решения по max-рангу `hasMinimumRole`; `/admin` — OWNER-only; first user → OWNER.
- **Booking skeleton**: `SlotReservations` (OWNER-only CRUD, status readOnly, enum = `kernel/reservationStatus.ts` SSOT); FSM ядро pure — проводка в БД и публичное API — 002 (с GiST EXCLUDE + advisory locks).

## 3. Extension surfaces (planned, legacy port map)

| Поверхность | Спека | Механика |
| --- | --- | --- |
| Booking domain (FSM-проводка, public booking API, GiST/advisory) | 002 | Payload custom migrations (raw SQL) + доменный сервис |
| Staff Telegram bot (pager, outbox, CAS actions) | 003 | grammY поверх Inngest; durable outbox-коллекция |
| Payments: Stars / NOWPayments адаптеры + Stripe webhooks | 004 | pluggable `PaymentAdapter` + серверные хендлеры; инварианты уже в `lib/payments/invariants.ts` |
| Google Calendar sync + secretVault | 005 | токены в Payload-коллекции (AES-256-GCM), sync-логика легаси |
| Waitlist, i18n-локализация, AI-RAG, R2 uploads, email-канал | 006+ | по мере спек |

## 4. Governance

- Constitution: `.specify/memory/constitution.md` v1.10.1 (app-repo adaptation: pnpm/vitest/playwright; clai-helpers/publish gates N/A).
- Quality gates: `pnpm validate` · `pnpm lint` · `pnpm test:int` · `pnpm build` · `pnpm generate:types` drift-free · `pnpm audit` 0 H/C · log-hygiene (PCI DSS Req 10).
- Deploy: Docker image из тегированных коммитов на VPS заказчика (002+, Memory Fencing ≤500 MB — doc-block в compose).

### 4.1. Deployment runbook — bootstrap владельца (SEC-1 компенсирующий контроль, до 002)

1. Deploy образа на VPS, ingress **закрыт** (firewall / Traefik без роута / basic-auth на edge).
2. Владелец открывает `/admin` и регистрируется — `ensureFirstUserIsAdmin` назначает `OWNER`.
3. Только после шага 2 открывается публичный ingress. Порядок нарушать нельзя: `Users.create` публичен, первый зарегистрировавшийся = OWNER (setup-token bootstrap приходит в 002 и убирает это окно).

## 5. Feature Reference (as-built)

| Feature | Статус | Ключевые артефакты |
| --- | --- | --- |
| 001-reinit | **implement (override-gate)** | roles/FSM kernel/SlotReservations/invariants/governance restore; см. `specs/001-.../` |
| Легаси 001–007 | archived (`../undreseller-legacy`) | port map: `specs/001-.../legacy-port-map.md` |
| 002+ | backlog | port map, спеки по канону SpecKit |
