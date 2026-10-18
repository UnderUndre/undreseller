# Implementation Plan: Modular E-Commerce Starter (Track 1, v1)

**Branch / Spec**: `specs/001-modular-commerce-template` | **Revised**: 2026-10-18  
**Spec**: [`spec.md`](spec.md)  
**Repo**: `UnderUndre/undreseller`, greenfield, MIT. Not the legacy BoxyHQ fork.  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

This plan implements the revised spec. It does not re-open Track 2, fiat rails, TON Connect, Chatwoot, Cal.diy, or a second retrieval strategy.

---

## 1. Where the code lives

One Next.js App Router app at the **root of this repository** (`app/`, `lib/`, `prisma/`, `config/`, `content/`). Create it with `create-next-app` (TypeScript, Tailwind, no `src/`). There is no `apps/commerce-starter/`. Do not copy `pages/`, next-auth middleware, Jackson, or `prisma db push` from the legacy fork. Tasks use those root paths.

- **Service Topology**: The public marketing landing page (Hero, Loom teardowns, 2-SKU pricing cards $3.5k/$4.9k, Upwork badges) is hosted in sibling repository `repos/undrllanding` (`projects/undreseller/`, per `undrllanding/specs/001-init-separate-landings`). This repository (`undreseller`) hosts the functional transactional engine (catalog, slot scheduling `/book`, checkout modal `/checkout`, Telegram Mini App, and backend API routes). CTAs from `undrllanding` link directly to this application.

```text
app/
  layout.tsx
  page.tsx
  catalog/[slug]/page.tsx
  book/page.tsx
  checkout/page.tsx
  api/
    health/route.ts
    catalog/route.ts
    booking/slots/route.ts
    booking/lock/route.ts
    checkout/route.ts
    bot/telegram/webhook/route.ts
    bot/whatsapp/webhook/route.ts
    payments/crypto/webhook/route.ts
    inngest/route.ts
    admin/
      items/route.ts
      hours/route.ts
      reindex/route.ts
      escalations/route.ts
      orders/[id]/purge/route.ts
      users/purge/route.ts
components/
  catalog/ItemCard.tsx
  booking/SlotGrid.tsx
  tma/TelegramProvider.tsx          # theme, MainButton, haptic — no HMAC
  checkout/CheckoutModal.tsx        # Stars + NOWPayments only
config/shop.config.ts               # brand, colors, shopTimezone, ftsConfig, minNoticeMin
content/knowledge.md
content/knowledge.pdf               # optional, capped
lib/
  db/prisma.ts                      # runtime client uses DATABASE_URL only
  booking/windows.ts
  booking/advisoryLock.ts           # acquireItemSlotLock(tx, itemId) -> pg_advisory_xact_lock
  booking/lock.ts                   # expiry UPDATE + INSERT, maps 23P01 → 409
  security/initData.ts              # HMAC-SHA256 + auth_date ≤ 3600s (±60s skew)
  security/adminAuth.ts             # Bearer vs ADMIN_TOKEN (dual rotation), timingSafeEqual, audit logging
  security/rateLimiter.ts           # lru-cache; valid because replica count = 1
  security/whatsappSignature.ts     # HMAC over raw body
  bot/telegramBot.ts
  bot/whatsappClient.ts             # template send only, backoff retry
  bot/cooldown.ts
  ai/documentParser.ts              # 10 MB / 50 pages, 500/50 chunks, 200 chunks cap
  ai/knowledgeEngine.ts             # FTS top 5, model ids from env, dual-failure immediate escalation
  payments/stars.ts                 # integer XTR
  payments/nowpayments.ts           # sig + 99% rule
  payments/fulfillment.ts           # the one PAID transaction
  telemetry/logger.ts               # denylist + admin audit logging
  jobs/inngest.ts                   # functions listed in spec §2.8
prisma/
  schema.prisma
  migrations/<ts>_init/migration.sql
  migrations/<ts>_init/down.sql     # drops objects of this migration only
scripts/seed.ts
scripts/drain-inbox.ts              # emergency offline drain utility
docker/bench-memory.sh
docs/whitelabel-quickstart.md
tests/e2e/commerce-flow.spec.ts
tests/unit/initData.test.ts
tests/unit/lock-conflict.test.ts
tests/unit/fulfillment-idempotency.test.ts
tests/unit/logger-redaction.test.ts
tests/fixtures/ai-prompts.ts
```

Postgres runs as its **own** container. App RSS is recorded; 500 MB is not a ship gate (spec §2.15).

---

## 2. Decisions the tasks are not allowed to reopen

1. **Retrieval.** `plainto_tsquery(ftsConfig)` (SLA < 50ms) → top 5 `KnowledgeChunk` rows → one LLM call. Hard cap: ≤ 200 chunks (~100k tokens). Atomic transaction with `DELETE` before `INSERT`. Advisory lock `pg_try_advisory_xact_lock(hashtext('knowledge_reindex'))` returns 409 if locked. No full-document prompt path.
2. **Jobs & Concurrency Fencing.** Inngest Cloud orchestrates. Functions run in this app through `app/api/inngest`. There is no second worker. Delivery semantics are at-least-once with single active lease and duplicate suppression where supported by provider (`PaymentEvent` idempotency). Rare duplicate delivery on process crash before status update is accepted for messengers. Inbound webhook handlers enforce a **64 KB** raw body limit (HTTP 413 on breach). Async handlers commit `InboxEvent` with its corresponding `kind` (`TELEGRAM_UPDATE`, `WHATSAPP_MESSAGE`, `NOWPAYMENTS_WEBHOOK`, `SYSTEM_ALERT`), validated against discriminator-specific versioned Zod schemas (`version: 1`) and capped at **16 KB** canonical `payloadJson` (message `text` truncated/capped at 2,000 chars), then `inngest.send` with the row id, and return 200 only after send accepts. Inngest functions declare explicit concurrency limits to protect host resources: `documentReindex` (`concurrency: { limit: 1 }`), `holdSweep` (`concurrency: { limit: 1 }`), `inboxSweep` (`concurrency: { limit: 1 }`), `purgePii` (`concurrency: { limit: 1 }`), `aiAnswer` (`concurrency: { limit: 5 }`), and `invoiceCreate` (`concurrency: { limit: 5 }`). In `lib/db/prisma.ts`, Prisma client initializes with `connection_limit = 10` on pooled `DATABASE_URL` (PgBouncer transaction mode), guaranteeing reserved connection headroom for time-critical synchronous webhooks. The inbox cron is every 1 minute: scans `(status = 'PENDING' AND createdAt <= now() - interval '15 seconds') OR (status = 'PROCESSING' AND lockedAt <= now() - interval '5 minutes')`. Atomic failure state machine evaluates `newAttemptCount = attemptCount + 1`: if `newAttemptCount >= 10`, status becomes `FAILED` and an alert is sent to `ADMIN_CHAT_ID` (unless `kind == SYSTEM_ALERT`, which logs `[SYSTEM_ALERT_TERMINAL_FAILURE]` and terminates without re-enqueuing); else status is immediately reset to `PENDING` with `lockedAt = null`, `lockedBy = null`, `attemptCount = newAttemptCount`, and `lastErrorAt = now()`. Emergency offline drain `scripts/drain-inbox.ts` (`npm run inbox:drain`) and Inngest handlers share the atomic claim/lease state machine (`PENDING → PROCESSING → SENT`) and execute handlers purely from `InboxEvent.payloadJson`. Nightly Inngest cron purges `payloadJson` to `{}` on terminal `SENT`/`FAILED` events older than 7 days, strictly preserving `PENDING` and `PROCESSING` events. Outbound messenger dispatches feature exponential backoff with jitter and 429 Retry-After handling. AI calls enforce an outer wall-time of 8s: primary `AI_MODEL` timeout is strictly 4s; fallback `AI_FALLBACK_MODEL` budget is the remaining time (max 3s); dual errors immediately escalate without hanging. LLM, template send, invoice create, reindex, hold sweep, PII purge, and resend are functions. Stars `pre_checkout_query` and `successful_payment` are **not** functions: the Telegram webhook calls `lib/payments/stars.ts` synchronously. `pre_checkout_query` only checks hold and stock (< 10s Bot API budget) and answers `ok: true/false`; it does not capture money or create a `PaymentEvent`. Actual money transfer arrives as `successful_payment` carrying `telegram_payment_charge_id`, processed via atomic fulfillment transaction inserting `PaymentEvent(provider = 'TELEGRAM_STARS', providerRef = telegram_payment_charge_id)`; webhook retries on server crash are idempotent via `@@unique([provider, providerRef])`.
3. **Replicas & Startup Assertion.** Compose file sets `deploy.replicas: 1` for the app. Startup assertion checks `process.env.REPLICA_COUNT === '1'` and throws hard failure `ERR_INVALID_REPLICA_TOPOLOGY` if misconfigured or unset. Comment in `rateLimiter.ts` points at spec §2.9.
4. **DSN.** `lib/db/prisma.ts` reads `DATABASE_URL` with `connection_limit = 10`. `DIRECT_URL` is read only by `scripts/migrate.ts`. A grep test fails the build if `app/` or `lib/` reads `DIRECT_URL`. No dump helper under `lib/`.
5. **Lock & Inventory Compensation.** `btree_gist` + `EXCLUDE USING gist` as in spec §2.6. Both booking lock acquisition, payment fulfillment, and the hold sweeper serialize at transaction start via `acquireItemSlotLock(tx, itemId)` in `lib/booking/advisoryLock.ts` (`SELECT pg_advisory_xact_lock(hashtext('slot_lock_' || $itemId));`). Multi-item transactions and sweeper sort `itemIds` ascending before locking to prevent deadlocks. Late payment for an expired/rebooked slot checks if an overlapping reservation with `status IN ('HELD', 'BOOKED')` exists: if so, the original reservation remains `RELEASED`, sets `SlotReservation.requiresOperatorAction = true` and `operatorActionReason = 'OVERBOOKED_MANUAL_RESOLUTION'`, avoiding `23P01` rollback, while recording `PaymentEvent`, order `PAID`. For product orders, conditional stock decrement records `OrderItem.stockDecremented = quantity` on success, or `OrderItem.stockDecremented = 0` on stock exhaustion (order transitions to `PAID` with `Order.requiresOperatorAction = true` and `Order.operatorActionReason = 'PAID_OUT_OF_STOCK'`). Cancellation of `PAID` order restores strictly `OrderItem.stockDecremented`, preventing phantom stock inflation. Transactional alert outbox commits `InboxEvent` with unique composite key `alert_<orderId>_<reason>_<timestamp>`, `kind = 'SYSTEM_ALERT'`, and structured payload `{ orderId, reason, timestamp }`, and external Telegram alerts are dispatched post-commit via durable jobs.
6. **States.** `PENDING | PAID | CANCELLED | FULFILLED`. Reservation `HELD | BOOKED | RELEASED`. No `CONFIRMED`, no `PERMANENT_BOOKED`.
7. **Stock.** Decremented only inside the PAID transaction. Released only when a `PAID` order is cancelled by admin. `UPDATE … WHERE stock >= qty` is the guard.
8. **Rails.** Stars (`starsPrice` integer) and NOWPayments. Checkout UI has two buttons. No Stripe/Paddle/YooKassa/TON/raw address. NOWPayments IPN verification validates `x-nowpayments-sig` over incoming webhook: sort top-level keys in ascending ASCII order, serialize via `JSON.stringify(sortedPayload)`, compute HMAC-SHA512 using `NOWPAYMENTS_IPN_SECRET` (distinct from `NOWPAYMENTS_API_KEY`), and evaluate via `crypto.timingSafeEqual`. Bad signature or missing secret rejects with 401 and no `InboxEvent`.
9. **WhatsApp.** Graph API template send using `ShopSettings.whatsappTemplateName`. No session text.
10. **initData.** `lib/security/initData.ts` is the only implementation. Validates `auth_date <= now + 60s` (±60s clock skew) and `now - auth_date <= 3600s`. `TelegramProvider.tsx` does not verify initData.
11. **Admin.** Bearer `ADMIN_TOKEN` (supports `NEW_TOKEN,OLD_TOKEN` comma-split for zero-downtime rotation bounded by `ADMIN_OLD_TOKEN_EXPIRES_AT` timestamp env var, emitting `[OLD_ADMIN_TOKEN_USED]` audit logs upon use). Items, hours, reindex, escalation list (`GET /api/admin/escalations?type=all|slot_conflict|paid_out_of_stock|ai_ticket` as durable source of truth), orders purge, user purge (`POST /api/admin/users/purge` immediately nulling user PII across `MessengerContact`, `Order`, and matching canonical fields in `InboxEvent.payloadJson` by `customerTgId` or normalized phone), and greeting sanitization (max 500 chars, plain text + telegram markdown v2). All admin requests write `[ADMIN_ACTION]` audit logs via `logger.ts` without PII. Images are URLs.
12. **Logs.** `logger.ts` drops keys in the denylist (spec §2.11) recursively before write.
13. **Schema lifecycle.** First migration is create-only. Header of `down.sql` forbids running it on a database with client orders. Later migrations follow expand/contract; this plan does not include one.
14. **Backup & DR.** No backup daemon in this repo. Quickstart says RPO = host Restic/`pg_dump` interval (confirm on Day 14), RTO = restore dump, not PITR. Numerical SLO: 99.0% uptime, target RTO ≤ 30 minutes. `PaymentEvent` records are statutory financial ledgers retained per `PAYMENT_LEDGER_RETENTION_YEARS` (default 5 years; post-statutory pruning/archiving is an external accounting procedure). Mandatory verified restore drill into isolated PostgreSQL container required before Day-14 client handover.
15. **Commercial.** Quickstart states Sprint B is 14 days / $4,900, Demand Gate, Day-14 $1 charge, and that the legacy fork's v16.0 business plan is not the source. This repo's `LICENSE` stays MIT.
16. **Application Foundation.** This repository remains a purpose-built Next.js application. Do not fork, copy, scaffold from, or introduce Medusa, Saleor, Payload Ecommerce, Vercel Commerce, a SaaS starter, or the legacy BoxyHQ repository. Reference implementations may be inspected, but production code must follow this plan's own domain model and file structure. Selective reuse of a dependency or small MIT-compatible UI component requires license preservation and the constitutional dependency/license audit.
17. **Authentication Scope.** v1 has no customer accounts and no session-based admin login. Public visitors remain unauthenticated. Admin routes use only the rotating ADMIN_TOKEN contract from spec §2.7. Do not add User, Account, Session, Team, Organization, Membership, Role, password-reset, OAuth, passkey, or MFA models in v1. If more than one human administrator or individually attributable admin sessions become required, stop implementation and open a scope-changing planning update under Constitution Principle IX. The preferred Phase 2 direction is integration of a maintained auth library into this application, not replacement of the commerce domain.
18. **Constitutional Quality Gates Before Done.** Task `T-037` strictly blocks completion and client handover: `npm run validate`, `npm test`, `npm run build`, `npx clai-helpers status --strict`, `npm audit` (zero unmitigated High/Critical CVEs), dependency license scan (zero AGPL-3.0/GPL contamination), and structured telemetry log redaction verification (asserting no PII, credentials, `initData`, payment signatures, or tokens).
19. **Pre-Implementation Review Gate.** Before any implementation task starts, `/speckit.implement` must verify Constitution Principle VI: `analyze.md` is PASS or OVERRIDDEN, at least two distinct external providers have PASS or OVERRIDDEN reviews, and the review-stage snapshot tag exists or is reused. Task `T-037` is a separate post-implementation quality gate and does not replace Principle VI.
20. **MCP Boundary.** Sprint B v1 contains no production MCP server. A Phase 2 disposable spike may use local stdio and expose only read-only, redacted capabilities through existing application services. It never accesses Prisma directly. Remote MCP, Streamable HTTP, authorization scopes, actor identity, and all mutation tools require a new planning update.

---

## 3. Request paths

**Hold.** `POST /api/booking/lock` → if the body contains `initData`, verify it (401 on failure); if it contains `customerTgId` and no `initData`, 401; browser callers send name + phone and no Telegram id → rate limit → `lock.ts` transaction → 201 or 409. No Inngest hop. The hold sweeper still expires `HELD` rows.

**Checkout.** `POST /api/checkout` creates a `PENDING` order for a product (no reservation) or attaches the chosen rail to an existing `PENDING` order. Same `initData` rule as the hold. Stars: enqueue `sendInvoice`. NOWPayments: enqueue hosted-invoice create. The route does not capture money.

**Telegram webhook.** Verify secret → rate limit. If the update is `pre_checkout_query`, validate hold/stock in-process and call `answerPreCheckoutQuery(ok: true/false)` (no money debited, no `PaymentEvent`). If `successful_payment`, call `fulfillment.ts` in-process inside atomic transaction recording `PaymentEvent(provider = 'TELEGRAM_STARS', providerRef = telegram_payment_charge_id)`; retry is idempotent. Any other update: insert `InboxEvent` → `inngest.send` → 200. The job sends the greeting, runs FTS+LLM, or opens an escalation.

**WhatsApp webhook.** Verify raw-body HMAC → same inbox pattern → job checks 24 h cooldown → template send. Graph errors log the code only.

**Stars money path.** Invoice create is the async job above. `pre_checkout_query` re-reads hold and stock in the webhook process (< 10s budget); expired or undersold → `ok: false`. `successful_payment` arrives only after Telegram charges Stars, and calls `fulfillment.ts` in that same process committing `PaymentEvent` and order `PAID`.

**NOWPayments.** Verify `x-nowpayments-sig` via key-sorting + JSON.stringify + HMAC-SHA512 using `NOWPAYMENTS_IPN_SECRET` (`timingSafeEqual`) → inbox row → job runs 99% check → `fulfillment.ts`.

**Health.** `SELECT 1` via `DATABASE_URL`. No secrets in the body.

---

## 4. Memory bench

`docker/bench-memory.sh` runs against one app container with a real Postgres beside it:

- 20 concurrent `GET /api/catalog`
- one signed Telegram webhook that enqueues an AI question (fixture LLM or a recorded stub that still allocates the prompt)
- one admin reindex of a 50-page fixture PDF

The script prints app RSS and Postgres RSS. It does not exit non-zero solely because app RSS is over 500 MB. Postgres is not compared to 500.

---

## 5. Day-14 onboarding (docs, not a feature)

`docs/whitelabel-quickstart.md` includes a checklist the founder reads on the call:

1. Client sets `TELEGRAM_BOT_TOKEN`, webhook secret, `WHATSAPP_APP_SECRET`, `NOWPAYMENTS_API_KEY`, `ADMIN_TOKEN`, `ADMIN_CHAT_ID`, `AI_API_KEY` in the host env. Founder does not keep a copy in the repo.
2. Smallest-unit Stars or NOWPayments charge against a test item.
3. Webhook row in `PaymentEvent` and order `PAID` shown on screen.
4. State the restore interval the host actually runs.
5. Remind: further rails are Phase 2 at $100/h.

---

## 6. Build order

The order is the task list. Foundation (schema, DSN, config, seed) before lock. Lock and the checkout route before the checkout UI. Inbox+Inngest, including the resend sweep, before any messenger send. Fulfillment before either rail. Stars answers stay on the webhook route. Logger denylist before webhook bodies are parsed. Bench, e2e, and the final constitutional quality gate (`T-037`) gate client handover documentation (`T-035`).

No authentication platform evaluation or migration belongs to the v1 build order. T-007 implements the complete v1 admin boundary. Any task that introduces session authentication, customer identity, or a full commerce foundation is out of scope and must be rejected rather than silently appended.

Phases in `tasks.md` match this order. Parallel lanes in that file are the graph, not a second schedule.
