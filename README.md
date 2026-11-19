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

### What the app can do (in plain language)

1. **Online booking & storefront in one app (`RU / EN`)** — customers pick a service, see only genuinely free slots (respecting staff weekly hours, exceptions, and before/after buffers), enter contact details, and optionally attach booking notes (`customerNotes`). PostgreSQL locks and exclusion constraints make double-booking impossible.
2. **Bot & spam protection (Trust Gate)** — new bookings verify email ownership with a one-time 6-digit OTP code (returning customers with a signed trust cookie skip OTP), backed by a hidden honeypot field, rate limiting, and phone/Telegram blacklisting.
3. **No-Show protection & partial deposits** — any service can require full prepayment or a partial deposit via Stripe: unpaid slots hold for 15 minutes and release automatically. Cancellation cutoff rules determine auto-refunds vs staff review, and customers get one-time self-service cancel/reschedule links by email.
4. **Automatic waitlist autofill** — when a day is full, customers can join a double-opt-in waitlist. Whenever a booking is cancelled or an unpaid hold expires, the system automatically notifies the queue to claim the freed slot.
5. **Dual Telegram bots (staff & clients)** — staff receive actionable booking cards (`Approve / Reject / Reschedule / Complete / Blacklist`), while clients can confirm or cancel via Telegram. All outbound messages go through a durable database outbox that survives network blips and Telegram rate limits.
6. **One-click calendar subscription (ICS Feed)** — each staff resource gets a private signed `webcal://` feed for Google, Apple, or Outlook calendars without OAuth verification headaches; leaked tokens rotate with one click.
7. **Optional Local AI Triage Copilot (host LM Studio)** — when a customer leaves free-text notes (repair details, call-out context, rough budget), a background worker masks phones, emails, IBANs, cards, and IDs locally, calls your local GPU model (zero cloud data leaks), extracts category/amount/urgency, and routes follow-ups deterministically: routine jobs within threshold (e.g. `≤ 1500 AED`) go to `🟢 OPERATOR`, while expensive/urgent/unclear ones escalate to `🔴 OWNER`. If LM Studio is offline or unconfigured, bookings continue untouched in manual-review mode.
8. **Role-isolated operations & GDPR hygiene** — `OWNER` controls `/admin`, `OPERATOR` handles approvals and refunds via dedicated APIs without admin access, and nightly jobs automatically anonymize expired terminal bookings after 90 days.

### Roadmap (as-built 2026-11-18)

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
| **013-local-ai-triage** | ✅ implemented (`a2fd283`) | Async Local AI Triage (LM Studio on host GPU), PII sanitizer, deterministic delegation, 26-case eval suite |

---

## Quick start

```bash
cp .env.example .env                     # set DATABASE_URL, POSTGRES_PASSWORD, PAYLOAD_SECRET (fail-closed)
pnpm ii                                  # install (workspace settings live in pnpm-workspace.yaml)
docker compose up -d                     # Postgres 16 (undreseller_db :5432)
docker exec undreseller_db psql -U postgres -c \
  "CREATE DATABASE undreseller_test"     # once, for int tests
pnpm dev                                 # dev server (schema push)
```

> ⚠️ First user of the instance: on an empty DB, `Users.create` requires the `X-Bootstrap-Token` header (timing-safe vs `OWNER_BOOTSTRAP_TOKEN`, fail-closed). Register the OWNER **before opening public ingress** — takeover window is zero (runbook: `specs/main/architecture.md` §4.1).

### Optional Local AI Triage (LM Studio on host GPU)

```bash
# 1. Start LM Studio Local Server on your GPU host (e.g. port 1235) with an instruction model loaded
# 2. Add to .env (or export in shell; leave unset to skip AI triage with zero impact):
LOCAL_LLM_BASE_URL=http://127.0.0.1:1235/v1
LOCAL_LLM_MODEL=gemma-4-e2b-uncensored-hauhaucs-aggressive
# 3. Run the 26-case live evaluation suite:
pnpm eval:ai
```

### Commands

| Command | What it does |
| :--- | :--- |
| `pnpm validate` | tsc --noEmit |
| `pnpm lint` | eslint (flat config) |
| `pnpm build` | production Next build |
| `pnpm test:int` | vitest — 22 integration suites, 232 tests (isolated `undreseller_test` via `test.env`) |
| `pnpm eval:ai` | live 26-case AI triage benchmark against local LM Studio |
| `pnpm test:e2e` | playwright (spec 015 regression suite; uses `E2E_GATEWAY=fake` — no Stripe/Resend keys needed) |
| `pnpm stripe-webhooks` | stripe CLI forward → `/api/payments/stripe/webhooks` (dev) |
| `pnpm generate:types` | regenerate `src/payload-types.ts` (hand edits prohibited) |
| `pnpm audit` | supply-chain gate (0 High/Critical) |

### E2E Testing (Playwright, spec 015)

`playwright.config.ts` spawns `pnpm dev` on `:3000` with `E2E_GATEWAY=fake` (`reuseExistingServer: true`, `workers: 1`, `trace: 'on-first-retry'`, HTML report in `playwright-report/`).

```bash
# Run the 015 booking regression suites + core booking e2e:
npx playwright test --config=playwright.config.ts tests/e2e/booking.e2e.spec.ts tests/e2e/composite-booking.e2e.spec.ts tests/e2e/money-surfaces.e2e.spec.ts tests/e2e/token-pages.e2e.spec.ts tests/e2e/trust-fast-path.e2e.spec.ts tests/e2e/waitlist-admin-i18n.e2e.spec.ts
```

- **Reusing a running dev server:** make sure it was started with `E2E_GATEWAY=fake` (otherwise `DEPOSIT` bookings return `502 PAYMENT_INIT_FAILED`).
- **Port `:3000` zombie on Windows:** if a prior aborted run left `next dev` holding `:3000` or `.next/dev/lock`, run `netstat -ano | grep :3000` and `taskkill /PID <pid> /T /F` before retrying.
- **Inspecting failures:** `npx playwright show-report` or `npx playwright show-trace test-results/<dir>/trace.zip`.

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
                 Stripe PaymentIntent (checkout + deposits; Payload Jobs ×9 sweeps/tasks)
```

- **Booking FSM** — pure kernel `src/lib/kernel/bookingFsm.ts` (two-track FREE/PREPAID, hold TTL 15m, UNDERPAID staff resolution); IO layer — `src/lib/booking/bookingService.ts` (the sole status writer, xact advisory lock).
- **Trust gate** — `POST /api/booking` phase 1 creates an intent + OTP email (202); phase 2 verifies OTP → books (201); valid trust-cookie (HMAC, 90d) skips OTP.
- **Availability** — pure `src/lib/availability/computeSlots.ts` + DB resolver + 20s slot cache; public `GET /api/availability`.
- **Fail-closed** everywhere: secrets, access, default-deny collections, `REPLICA_COUNT=1` boot assertion.

---

## Tests

**21 suites / 212 tests** (vitest, isolated test DB — never touches dev):

booking-fsm (43 scenarios) · trust-gate (22) · payments-invariants (13) · calendar-feed (11) · booking-service (12) · availability BVA (11) · waitlist (11) · prepaid-booking (10) · booking-route (10) · local-ai-triage (10) · telegram-client/outbox (13) · tokens-sweep (6) · gist-race (100 concurrent inserts → 1/99×23P01) · refund-policy · deposit-flow · rate-limit · error-shapes · access-roles · bootstrap-token.

Legacy regression baseline: 58 suites / 436 tests — the source of test design.

---

## Documentation (Diátaxis hub: [`specs/main/README.md`](specs/main/README.md))

- **Architecture (as-built v3.1.0)**: [`specs/main/architecture.md`](specs/main/architecture.md)
- **Requirements map**: [`specs/main/requirements.md`](specs/main/requirements.md)
- **Specs 001–010, 012–013 (implemented)**: see hub table · **011-multitenant**: [`specs/011-multitenant/design.md`](specs/011-multitenant/design.md) (frozen)
- **SpecKit pipeline**: `/speckit.specify → .requirements-audit → .plan → .tasks → .test-design → .analyze → .review (×2) → .implement → .qa-signoff` — constitution [`.specify/memory/constitution.md`](.specify/memory/constitution.md) v1.10.1

## Infrastructure

- Docker: `docker-compose.yml` — Postgres 16 (Memory Fencing 4096/2048M); app service ≤500 MB (deploy runbook)
- Migrations: `payload migrate` (prod) — 5 migrations incl. domain schema (12 tables), deposit enum, and local AI triage; dev — push
- Variables: see `.env.example` (`PAYLOAD_SECRET` fail-throw at boot; all HMAC/OTP tokens are keyed on it — rotation invalidates one-time links)
