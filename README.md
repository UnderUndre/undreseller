# 🛍️ undreseller — Booking & Commerce Engine on Payload

> "Всегда пиши код так, будто сопровождать его будет психопат, который знает, где ты живёшь." — Code Review Roasts
> "Деплой в пятницу — как русская рулетка, только барабан полный." — DevOps & Deploy

**Repository**: `UnderUndre/undreseller`
**Foundation**: the official [Payload Ecommerce Template](https://github.com/payloadcms/payload/blob/3.x/templates/ecommerce) (payload 3.93.0 / Next 16.4.1 / React 19 / PostgreSQL 16) — pinned
**Lineage**: rebased 2026-11-06; the legacy 001–007 line (Next 15 + Prisma) is preserved read-only in `../undreseller-legacy`
**Business plan**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0 (Track 1 Mono-Engine, ICP: service businesses with 3–25 staff)
**Compliance**: ISO/IEC/IEEE 29148:2018 · ISO/IEC/IEEE 12207:2017 · NIST SP 800-218 SSDF
**README на русском**: [`README.ru.md`](README.ru.md)

---

## What it is

A transferable white-label engine for service businesses: service catalog → slots → booking → hold/payment → notifications. It attacks the No-Show problem (10–25% without protection; deposits cut it by 55–65%). Scope Knife: exactly 3 staff roles (`OWNER` / `OPERATOR` / `PERFORMER` + `customer`), 1 end-to-end process, ≤1 external business integration (Google Calendar, 005+).

### Roadmap

| Spec | Status | Contents |
| :--- | :--- | :--- |
| **001-reinit** | ✅ implemented (`c5f3bf1` lineage) | Payload foundation, roles, SpecKit governance, FSM kernel, payment invariants |
| **002-booking-domain** | ✅ implemented (override-gate) | Slots/availability, booking, GiST+advisory double-booking defense, OPERATOR approvals, /book storefront, rate limit |
| 003-no-show-protection | drafted | Deposits (Stripe), email reminders, self-service cancel/reschedule, scheduler |
| 004-telegram-bots | drafted | Dual bots, durable outbox, CAS actions, GDPR redaction |
| 005-google-calendar-sync | drafted | OAuth vault, push decision table, syncToken import, reconcile |
| 006+ | backlog | Multi-service cart, Stars/NOWPayments, waitlist, PII hygiene |

Full legacy port map: [`specs/001-reinit-from-payload-ecommerce-template/legacy-port-map.md`](specs/001-reinit-from-payload-ecommerce-template/legacy-port-map.md)

---

## Quick start

```bash
pnpm ii            # install (workspace settings live in pnpm-workspace.yaml)
docker compose up -d                     # Postgres 16 (undreseller_db :5432)
docker exec undreseller_db psql -U postgres -c \
  "CREATE DATABASE undreseller_test"     # once, for int tests
pnpm dev           # dev server (schema push; first /admin login → create OWNER)
```

> ⚠️ First user of the instance: until the 002-style bootstrap token ships, the OWNER is created via the admin UI **before opening public ingress** (runbook: `specs/main/architecture.md` §4.1).

### Commands

| Command | What it does |
| :--- | :--- |
| `pnpm validate` | tsc --noEmit |
| `pnpm lint` | eslint (flat config) |
| `pnpm build` | production Next build |
| `pnpm test:int` | vitest — integration suites (isolated `undreseller_test` via `test.env`) |
| `pnpm test:e2e` | playwright (needs Stripe test keys + `pnpm stripe-webhooks`) |
| `pnpm generate:types` | regenerate `src/payload-types.ts` (hand edits prohibited) |
| `pnpm audit` | supply-chain gate (0 High/Critical) |

### Roles & access

| Role | Payload /admin | Capabilities |
| :--- | :--- | :--- |
| `OWNER` | ✅ full | everything, incl. roles and settings |
| `OPERATOR` | ❌ | booking dispatch (app API, 002: approvals) |
| `PERFORMER` | ❌ | personal schedule (003+) |
| `customer` | ❌ | purchase/booking, own orders |

---

## Architecture (short)

```text
[Browser/TMA] ──► Next.js 16 (App Router)
                    ├── (app)    storefront: /shop /book /checkout /orders
                    └── (payload) admin panel (OWNER-only)
                          │
                          ▼
                 Payload 3.93 (REST/GraphQL/Local API)
                    ├── Products(+variants) · Carts · Orders · Transactions
                    ├── SlotReservations (fail-closed, FSM statuses)
                    ├── Users (roles OWNER/OPERATOR/PERFORMER/customer)
                    ├── AuditEvents (append-only)
                    └── @payloadcms/db-postgres ──► PostgreSQL 16
                          │  GiST EXCLUDE + advisory locks (double-booking)
                          ▼
                 Stripe PaymentIntent (checkout; Stars/NOWPayments adapters — 006+)
```

- **Booking FSM** — pure kernel `src/lib/kernel/bookingFsm.ts` (6 states, two-track FREE/PREPAID, hold TTL 15m, confirming-freeze 24h); IO layer — `src/lib/booking/bookingService.ts` (the sole status writer, xact advisory lock).
- **Availability** — pure `src/lib/availability/computeSlots.ts` + DB resolver; public `GET /api/availability`.
- **Fail-closed** everywhere: secrets, access, default-deny collections.

---

## Tests

**10 suites / 108+ tests** (vitest, isolated test DB — never touches dev):

bootstrap-token · gist-race (100 concurrent inserts → 1/99×23P01) · availability BVA · booking-service (FSM/idempotency/cancel/approvals) · rate-limit · error-shapes · access-roles · payment-invariants · FSM legacy-parity (42 scenarios) · api smoke.

Legacy regression baseline: 58 suites / 436 tests — the source of test design.

---

## Documentation (Diátaxis hub: [`specs/main/README.md`](specs/main/README.md))

- **Architecture (as-built)**: [`specs/main/architecture.md`](specs/main/architecture.md)
- **Requirements map**: [`specs/main/requirements.md`](specs/main/requirements.md)
- **Active spec**: [`specs/002-booking-domain/`](specs/002-booking-domain/spec.md) (rev 1.2, antigravity PASS)
- **Specs 003–005 (drafts)**: no-show-protection · telegram-bots · google-calendar-sync
- **SpecKit pipeline**: `/speckit.specify → .requirements-audit → .plan → .tasks → .test-design → .analyze → .review (×2) → .implement → .qa-signoff` — constitution [`.specify/memory/constitution.md`](.specify/memory/constitution.md) v1.10.1

## Infrastructure

- Docker: `docker-compose.yml` — Postgres 16 (Memory Fencing 4096/2048M); app service ≤500 MB — spec 002+ (deploy)
- Migrations: `payload migrate` (prod); dev — push. Defense DDL (GiST/EXCLUDE) — `src/migrations/`
- Variables: see `.env.example` (`PAYLOAD_SECRET` is required — fail-throw at boot)
