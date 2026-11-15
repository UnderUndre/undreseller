# 🛍️ undreseller — Booking & Commerce Engine on Payload

> "Всегда пиши код так, будто сопровождать его будет психопат, который знает, где ты живёшь." — Code Review Roasts
> "Деплой в пятницу — как русская рулетка, только барабан полный." — DevOps & Deploy

**Repository**: `UnderUndre/undreseller`
**Foundation**: the official [Payload Ecommerce Template](https://github.com/payloadcms/payload/blob/3.x/templates/ecommerce) (payload 3.93.0 / Next 16.4.1 / React 19.2.9 / next-intl 4.15 / grammY 1.46 / PostgreSQL 16) — pinned
**Lineage**: rebased 2026-11-06; the legacy 001–007 line (Next 15 + Prisma) is preserved read-only in `../undreseller-legacy`
**Business plan**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v20.3 (ICP: service businesses, solo → multi-staff)
**Compliance**: ISO/IEC/IEEE 29148:2018 · ISO/IEC/IEEE 12207:2017 · NIST SP 800-218 SSDF
**README на русском**: [`README.ru.md`](README.ru.md)

---

## What it is

A transferable white-label engine for service businesses: service catalog → slots → booking (OTP trust gate) → deposit/prepayment → notifications (email + Telegram). It attacks the No-Show problem (10–25% without protection; deposits/no-show fees cut it by ~54–69% — peer-reviewed clinical proxy + vendor studies). Scope Knife: exactly 3 staff roles (`OWNER` / `OPERATOR` / `PERFORMER` + `customer`), 1 end-to-end process, ≤1 external business integration (Calendar Feed ICS push, shipped; Google two-way sync — frozen).

### Roadmap (as-built 2026-11-15)

| Spec | Status | Contents |
| :--- | :--- | :--- |
| **001-reinit** | ✅ implemented (rev 1.3) | Payload foundation, roles, SpecKit governance, FSM kernel, payment invariants |
| **002-booking-domain** | ✅ accepted (rev 1.2) | Slots/availability, booking, GiST+advisory double-booking defense, OPERATOR approvals, /book storefront, rate limit |
| **003-no-show-protection** | ✅ implemented (`3697b3d`) | Deposits/prepayment (Stripe webhooks CAS), refunds, reminders (Resend), self-service cancel/reschedule tokens |
| **004-telegram-bots** | ✅ implemented (`9efe76a`) | Dual bots (staff pager + client), durable outbox (CTE SKIP LOCKED), CAS actions, blacklist, GDPR redaction |
| **005-calendar-feed** | ✅ implemented (rev 2.1, `3a576e4`) | One-way ICS push per-resource (RFC 5545, HMAC token + rotation, ETag/304); GC two-way frozen |
| **006-waitlist-autofill** | ✅ implemented (`a66eed5`) | Double-opt-in waitlist, slot-freed matching, claim FSM (HMAC bind), campaign cap |
| **007-booking-trust-gate** | ✅ implemented (`b1d095b`) | Two-phase OTP booking (BookingIntents), trust-cookie fast path, honeypot, server-side idempotency |
| **008-audit-hardening** | ✅ implemented (`db0d91c`) | Domain schema migration (12 tables), CSP, GDPR purge, staff authz rewrite, fail-closed hardening |
| **009-ux-hygiene** | ✅ implemented (`03ce933`) | 13+ UX fixes from FR-BK backlog, reschedule grid validation |
| **010-i18n** | ✅ implemented (`4f8f5e0`) | next-intl ru/en, `[locale]` routing, locale detect middleware |
| **011-multitenant** | ❄️ frozen | design.md only (tenant-per-database vs shared DB) — awaiting demand |
| **012-deposit-telegram** | ✅ implemented (`30b0072`) | `paymentMode DEPOSIT` (charge deposit only), DepositPayment (Stripe Elements), bot token env wiring |

---

## Quick start

```bash
pnpm ii            # install (workspace settings live in pnpm-workspace.yaml)
docker compose up -d                     # Postgres 16 (undreseller_db :5432)
docker exec undreseller_db psql -U postgres -c \
  "CREATE DATABASE undreseller_test"     # once, for int tests
pnpm dev           # dev server (schema push)
```

> ⚠️ First user of the instance: on an empty DB, `Users.create` requires the `X-Bootstrap-Token` header (timing-safe vs `OWNER_BOOTSTRAP_TOKEN`, fail-closed). Register the OWNER **before opening public ingress** — takeover window is zero (runbook: `specs/main/architecture.md` §4.1).

### Commands

| Command | What it does |
| :--- | :--- |
| `pnpm validate` | tsc --noEmit |
| `pnpm lint` | eslint (flat config) |
| `pnpm build` | production Next build |
| `pnpm test:int` | vitest — 20 integration suites (isolated `undreseller_test` via `test.env`) |
| `pnpm test:e2e` | playwright (needs Stripe test keys + `pnpm stripe-webhooks`) |
| `pnpm stripe-webhooks` | stripe CLI forward → `/api/payments/stripe/webhooks` (dev) |
| `pnpm generate:types` | regenerate `src/payload-types.ts` (hand edits prohibited) |
| `pnpm audit` | supply-chain gate (0 High/Critical) |

### Roles & access

| Role | Payload /admin | Capabilities |
| :--- | :--- | :--- |
| `OWNER` | ✅ full | everything, incl. roles, settings, calendar-feed rotation |
| `OPERATOR` | ❌ | booking dispatch + refund resolution (app API: approvals, staff/refunds) |
| `PERFORMER` | ❌ | personal schedule (app API) |
| `customer` | ❌ | purchase/booking, own orders |

---

## Architecture (short)

```text
[Browser/TMA] ──► Next.js 16 (App Router, [locale] ru/en)
                    ├── storefront: /shop /book /book/[slug] /checkout /orders
                    │   waitlist + cancel/reschedule/acknowledge token pages
                    ├── /api: booking (two-phase OTP) · approvals · waitlist ·
                    │   calendar feed (ICS) · telegram webhooks · stripe
                    └── (payload) admin panel (OWNER-only)
                          │
                          ▼
                 Payload 3.93 (Local API + REST; GraphQL disabled in prod)
                    ├── BookingIntents · SlotReservations (FSM) · WaitlistEntries
                    ├── TelegramOutbox · TgLink · Blacklist · InboxEvent
                    ├── AuditEvents (append-only) · EmailDeliveryLog · PaymentEvents
                    └── @payloadcms/db-postgres ──► PostgreSQL 16
                          │  GiST EXCLUDE + advisory locks (double-booking)
                          ▼
                 Stripe PaymentIntent (checkout + deposits; Payload Jobs ×8 sweeps)
```

- **Booking FSM** — pure kernel `src/lib/kernel/bookingFsm.ts` (two-track FREE/PREPAID, hold TTL 15m, UNDERPAID staff resolution); IO layer — `src/lib/booking/bookingService.ts` (the sole status writer, xact advisory lock).
- **Trust gate** — `POST /api/booking` phase 1 creates an intent + OTP email (202); phase 2 verifies OTP → books (201); valid trust-cookie (HMAC, 90d) skips OTP.
- **Availability** — pure `src/lib/availability/computeSlots.ts` + DB resolver + 20s slot cache; public `GET /api/availability`.
- **Fail-closed** everywhere: secrets, access, default-deny collections, `REPLICA_COUNT=1` boot assertion.

---

## Tests

**20 suites / 202 tests** (vitest, isolated test DB — never touches dev):

booking-fsm (43 scenarios) · trust-gate (23) · payments-invariants (13) · calendar-feed (12) · booking-service (12) · availability BVA (11) · waitlist (11) · prepaid-booking (10) · booking-route (10) · telegram-client/outbox (13) · tokens-sweep (6) · gist-race (100 concurrent inserts → 1/99×23P01) · refund-policy · deposit-flow · rate-limit · error-shapes · access-roles · bootstrap-token.

Legacy regression baseline: 58 suites / 436 tests — the source of test design.

---

## Documentation (Diátaxis hub: [`specs/main/README.md`](specs/main/README.md))

- **Architecture (as-built v3.0.0)**: [`specs/main/architecture.md`](specs/main/architecture.md)
- **Requirements map**: [`specs/main/requirements.md`](specs/main/requirements.md)
- **Specs 001–010, 012 (implemented)**: see hub table · **011-multitenant**: [`specs/011-multitenant/design.md`](specs/011-multitenant/design.md) (frozen)
- **SpecKit pipeline**: `/speckit.specify → .requirements-audit → .plan → .tasks → .test-design → .analyze → .review (×2) → .implement → .qa-signoff` — constitution [`.specify/memory/constitution.md`](.specify/memory/constitution.md) v1.10.1

## Infrastructure

- Docker: `docker-compose.yml` — Postgres 16 (Memory Fencing 4096/2048M); app service ≤500 MB (deploy runbook)
- Migrations: `payload migrate` (prod) — 4 migrations incl. domain schema (12 tables) + deposit enum; dev — push
- Variables: see `.env.example` (`PAYLOAD_SECRET` fail-throw at boot; all HMAC/OTP tokens are keyed on it — rotation invalidates one-time links)
