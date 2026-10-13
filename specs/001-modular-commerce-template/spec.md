# Feature Specification: Modular E-Commerce Starter with Telegram Mini App, WhatsApp Gateway & AI Knowledge Base

**Feature Branch / Directory**: `specs/001-modular-commerce-template`  
**Repository**: `UnderUndre/undreseller` (https://github.com/UnderUndre/undreseller). Greenfield, created 2026-10-11, MIT. Not the legacy BoxyHQ `saas-starter-kit` fork.  
**Created**: 2026-10-11  
**Revised**: 2026-10-13 — slug renamed from `003` to `001` in this repo. Prior reviews (`zcode` CRITICAL, `analyze` HIGH, `copilot` CRITICAL) still name `003` and are not re-approved.  
**Status**: Revised (pending re-review)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering) & NIST SP 800-218 SSDF (Secure Software Development)  
**Commercial source of truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3** and `undreplans/ROADMAP.md` **v2.4** (sibling repo, not this tree).  
**Not a source**: the legacy fork's `docs/undreseller-business-plan.md` (v16.0, 2026-08-16). It is not in this repository. It still prices the tripwire at $1,500–$2,500, claims Upwork Direct at 0%, and thaws Medusa at $15k MRR. Do not copy it in.

<!-- Drift note: 2026-10-11 — zcode review F1–F12. Booking is a range exclusion, not a row-per-hold. Payment states collapse to PENDING/PAID/CANCELLED/FULFILLED. v1 rails are Telegram Stars + NOWPayments only. WhatsApp is one approved template. Retrieval is Postgres FTS only. Admin mutations exist. Jobs are durable before webhook ack. -->
<!-- Drift note: 2026-10-11 — analyze F1/F2/G1/C1–C3/F3/I1/M1. Stars pre_checkout and successful_payment run inside the Telegram webhook request. Inbox sweep retries PENDING rows. Checkout is its own route. -->
<!-- Drift note: 2026-10-11 — code home is this greenfield repo. Do not fork Cal.diy, Payload, Medusa, Vendure, Saleor, or a storefront-only SaaS client. 500 MB is measured, not a ship gate, and not a reason to add a second product. Inngest functions run in this app. LLM ids come from env. -->
<!-- Drift note: 2026-10-13 — directory is specs/001-modular-commerce-template. reviews/*.md are historical and still say 003. The portal spec is not in this repo. -->

---

## 1. Executive Summary & Architectural Separation (Two-Track Strategy)

### 1.1. What this spec is

UnderUndre ships a **cloneable light storefront** (Track 1): a Next.js 15 catalog, service-slot booking, a Telegram bot that opens that catalog as a Mini App, a WhatsApp **approved-template** first reply, a Postgres full-text answer over a local `.md`/`.pdf` knowledge file, and prepayment on **two rails**.

Track 2 (Medusa fork in `repos/undrecommerce`, warehouses, 1000+ SKU) stays **frozen through Phase A**. This spec does not thaw it, quote it, or share its schema.

The code home is the root of **this** repository. Create it with `create-next-app` (App Router, TypeScript, Tailwind, no `src/`). Do not import the legacy fork: no `pages/`, no next-auth middleware, no Jackson, no `prisma db push`. The license file already in the repo is MIT; do not replace it. The agency portal is a different repository; it is not a spec in this tree.

### 1.2. Commercial envelope (v18.3)

| Rule | Binding text |
| --- | --- |
| Hero SKU | Sprint B, **$4,900 flat**, 14 calendar days. Not a discount, not a 5-day SKU. |
| Scope knife | 2 roles (public visitor + one admin token), **1 business process** (catalog → hold → pay), external integrations capped at the v1 set below. Anything else is Phase 2 at **$100/h**. |
| Cash | 50% ($2,450) before work, 50% on day 14. |
| Day 14 | 60-minute live onboarding: client pastes production keys, a **$1** (or smallest currency unit) charge, webhooks seen before escrow release. |
| After launch | 7 calendar days of P1/P2 bugfix, then retainer. This template does not include retainer ops. |
| Demand gate | Public sale of Sprint A/B stays blocked until **10 paid tripwires** ($350–$490). Building this template in-repo does not waive the gate. |
| Old "5–7 working days" | That figure is **only** the clone step after this template already exists (config, seed, tokens, one shop's copy). It is not the build estimate and not the client-facing Sprint B clock. |

### 1.3. v1 integration set (closed)

In v1 the box talks to:

1. Telegram Bot API (grammY) + Mini App `initData`.
2. WhatsApp Cloud API — **one pre-approved template**, no free-form session text.
3. One LLM. Model ids come from `AI_MODEL` and `AI_FALLBACK_MODEL`, not from source. Defaults at the time of this revision: `claude-haiku-4-5-20251001` and `gemini-3.6-flash`. `claude-3-5-haiku-20241022` and `gemini-2.0-flash` are retired; do not pin them. Fallback runs on 404, 429, 529, 5xx, and timeout, not only on 5xx.
4. Telegram Stars (`XTR`, integer) **and** NOWPayments (USDT/TON invoice hosted by them).

**Out of v1** (Phase 2 backlog, not tasks): TON Connect, raw wallet-address watchers, Stripe, Paddle, YooKassa, Cash-on-delivery, Chatwoot as the WhatsApp edge, Qdrant/Milvus/Chroma, local embedding models, n8n inside this app, a second app replica.

```
TRACK 1 (this spec)                         TRACK 2 (not this spec)
Next.js 15 + Prisma + Postgres              Medusa monorepo
1–100 active SKUs, services + simple goods  1000+ SKU, WMS, freight
Stars + NOWPayments                         frozen through Phase A
one app container; RSS measured             Redis + Meili + Medusa workers
```

### 1.4. Glossary & Domain Terminology

- **Template Codebase**: The clean, cloneable Next.js 15 repository template (`undreseller`) implementing Track 1 light commerce.
- **Storefront UI**: Public-facing Next.js App Router catalog and checkout interface, shared between desktop web browsers and Telegram Mini App (TMA).
- **App Container**: The single runtime Docker container running Next.js SSR + API routes + in-process Inngest function handlers (`deploy.replicas: 1`).
- **Client Tenant**: Individual customer deployment provisioned from this template with unique environment variables, brand assets, and database schema.

---

## 2. Clarifications & Architectural Decisions

### 2.1. Messengers

- No userbots. No Baileys, WPPConnect, Telethon, or MTProto on a personal account.
- **Telegram.** Webhook `POST /api/bot/telegram/webhook`. Missing or wrong `X-Telegram-Bot-Api-Secret-Token` → **403** and no side effect. `/start` upserts `MessengerContact` and sends the greeting plus the WebApp button. `my_chat_member` with status `kicked`/`left` sets `MessengerContact.isBlocked`; the bot does not call sendMessage for that id.
- **WhatsApp.** Official Cloud API only. v1 does **not** route through Chatwoot (that would be a second inbox product).
  - `GET` verifies `hub.challenge`.
  - `POST` without a valid `X-Hub-Signature-256` (HMAC-SHA256 over the raw body with `WHATSAPP_APP_SECRET`) → **401** and no side effect.
  - Outside Meta's 24 h customer-care window a free-form greeting is not deliverable. v1 sends **only** a template whose name is stored in `ShopSettings.whatsappTemplateName` and which has already been approved in Meta Business Manager. If Meta rejects the send (including 131047), the handler logs the **error code only** (no body, no phone) and still returns 200 after the durable job is accepted, so Meta does not retry-storm. The lead is not promised a message the API will not deliver.
  - At most one template send per `phone_number` per 24 h (`MessengerContact.lastAutoReplyAt`).

### 2.2. Telegram Mini App

The catalog and the booking page are the same Next.js routes a browser uses. Inside Telegram they run with `@twa-dev/sdk` (theme, MainButton, haptic). That SDK init is **not** authentication.

`initData` is checked only when the caller claims a Telegram user:

- `POST /api/booking/lock` and `POST /api/checkout` with an `initData` field: HMAC-SHA256 per Telegram's algorithm, key derived from `TELEGRAM_BOT_TOKEN`. Validates `auth_date <= now + 60s` (±60s clock skew tolerance between client/Telegram and server) and `now - auth_date <= 3600s`. Older or future beyond 60s → 401. The order stores `customerTgId` from the checked payload, never from a separate client field.
- The same routes **without** `initData` are a browser checkout: require `customerName` and `customerPhone`, leave `customerTgId` null. Sending a Telegram id without `initData` → 401.
- Stars `pre_checkout_query` does not carry `initData`. The order was already bound to `customerTgId` at checkout. The query only re-reads that order's hold and stock.

### 2.3. Knowledge base — one retrieval path

Postgres full-text only. No "or paste the whole file into the prompt" branch.

- Input files: `content/knowledge.md` (required) and `content/knowledge.pdf` (optional).
- Caps before parse: **10 MB**, **50 PDF pages**. Hard ceiling of **200 chunks** (~100,000 tokens) on total `KnowledgeChunk` rows. Over the cap, reindex fails the job and does not parse.
- Chunks: **500 tokens**, overlap **50**, split with `js-tiktoken` encoding `cl100k_base` (exact package version in T-001, no `latest`). Each row's `tsv` is `to_tsvector(ftsConfig, content)` in the same `INSERT`. No trigger. GIN index as in §6.
- A question runs `plainto_tsquery` on the shop language (`shop.config.ts` → `ftsConfig`, default `simple`) with an SLA of `< 50ms`. Top **5** chunks, hard ceiling **8,000 tokens** of context.
- Zero hits, or the model says it cannot answer from those chunks → the fixed escalation sentence and an `EscalationTicket`. No second retrieval strategy.
- PDF/markdown parse runs inside the reindex **job**, not on the webhook request path. Reindex executes in an atomic transaction (`DELETE FROM "KnowledgeChunk"` before batch `INSERT`), protected by a PostgreSQL advisory lock (`pg_try_advisory_xact_lock(hashtext('knowledge_reindex'))`), returning 409 Conflict if a reindex is already in progress.
- Reindex: `POST /api/admin/reindex` (admin token) enqueues the job. Boot does not re-parse a PDF.

### 2.4. Prepayment — two rails

| Rail | v1 behavior |
| --- | --- |
| Telegram Stars | `sendInvoice` in currency `XTR`. Amount is `Item.starsPrice` (integer, minor = 1 Star). Not derived from `priceMinor`. `pre_checkout_query` re-checks hold + stock; failure answers `ok: false`. |
| NOWPayments | Hosted invoice. Webhook `POST /api/payments/crypto/webhook`. Header `x-nowpayments-sig` HMAC checked before any write. |

No fiat rail and no card field in v1. A future fiat rail is a **hosted Checkout / MoR redirect**. PAN, CVC, and raw card data never enter this process.

Crypto money rule: the paid invoice amount in the **quoted** currency must be **≥ 99%** of the amount NOWPayments was asked to charge. Below that, the order stays `PENDING`, an admin alert is sent, and stock is not touched. The shop does not convert FX and does not "eat the spread". There is no partial capture.

Private keys of wallets are not stored. NOWPayments API key is an env var.

### 2.5. Order state machine (single)

`CONFIRMED` and `PERMANENT_BOOKED` are not states. Do not add them.

```
PENDING  --webhook accepted-->  PAID  --admin-->  FULFILLED
   |                              |
   +--hold expired / admin--> CANCELLED
```

- `PENDING`: reservation is `HELD`, stock **not** decremented.
- `PAID`: same transaction sets reservation `BOOKED`, decrements `Item.stock` for `PRODUCT` lines, inserts `PaymentEvent`.
- `CANCELLED` from `PENDING`: reservation `RELEASED`, stock unchanged.
- `CANCELLED` from `PAID` (admin only): reservation `RELEASED`, stock restored.
- `FULFILLED`: admin marks the service done. No payment effect.
- Second webhook with the same `(provider, providerRef)` returns **200** and does not decrement again (`PaymentEvent` unique).

### 2.6. Booking lock

Availability is **computed**, not a pre-inserted row per window.

- `WeeklyHours` rows (shop default or per `itemId`) in `shopTimezone`.
- A candidate window is `[start, start + durationMin)` stepped by `durationMin`, inside weekly hours, minus breaks, strictly in the future. Drop any window whose `startTime` is earlier than `now + minNoticeMin` in `shopTimezone` (`minNoticeMin` from `shop.config.ts`).
- Admin writes of `WeeklyHours` reject `endMin <= startMin`, a break outside `[startMin, endMin]`, `weekday` outside 1–7, and overlapping intervals for the same `(itemId, weekday)`.
- A hold is one `SlotReservation` row, status `HELD`, `holdExpiresAt = now() + 15 minutes`.
- PostgreSQL exclusion constraint (raw SQL in the migration; Prisma cannot express it):

```sql
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT slot_no_overlap
  EXCLUDE USING gist (
    "itemId" WITH =,
    tstzrange("startTime", "endTime") WITH &&
  )
  WHERE ("status" IN ('HELD', 'BOOKED'));
```

- Lock transaction, in order: `UPDATE` this item's expired `HELD` rows to `RELEASED`; `INSERT` the new `HELD` row. A conflicting insert raises `23P01`; the API returns **409**. Two shoppers cannot both hold the same range, because the constraint is on the range, not on a random new id.
- `SELECT … FOR UPDATE` on a freshly inserted row is not the lock. The gist exclusion is the lock.
- Sweeper job (every 60 s): `HELD` with `holdExpiresAt <= now()` → `RELEASED`, and the parent `PENDING` order → `CANCELLED`.
- Late payment collision: If `successful_payment` arrives for a `CANCELLED` order whose hold was released, `PaymentEvent` idempotency records payment, order moves to `PAID`, and stock decrements. If the underlying slot range was re-booked by a concurrent customer in the interim, the reservation transition logs `[SLOT_OVERBOOK_COLLISION]`, marks slot reservation as requiring operator action, and dispatches an immediate Telegram alert to `ADMIN_CHAT_ID` with the order id for manual rescheduling.
- Services (`stock IS NULL`) do not check stock. Products (`stock` integer ≥ 0) refuse a checkout when `stock < quantity`. Stock changes only in the PAID / cancel-after-PAID transaction (`UPDATE … WHERE stock >= $qty`).

### 2.7. Admin (FR-01 is real)

Public visitors read the catalog. Writes require `Authorization: Bearer` equal to `ADMIN_TOKEN` (`timingSafeEqual`). Zero-downtime token rotation supports comma-separated dual tokens (`NEW_TOKEN,OLD_TOKEN`) in `ADMIN_TOKEN` during transition windows.
- **Admin Audit Trail:** Every request to `/api/admin/*` emits a structured log event `[ADMIN_ACTION] action=<path> method=<METHOD> targetId=<id> status=<STATUS>` via `logger.ts`. Tokens, passwords, and PII are never logged.

| Lives in | Changes without image rebuild? |
| --- | --- |
| `ShopSettings` row: greeting text, WhatsApp template **name**, currency code | Yes |
| `Item`, `WeeklyHours` | Yes |
| `shop.config.ts`: brand name, colors, logo URL, `shopTimezone`, `ftsConfig`, `minNoticeMin` | No — git commit + deploy |
| Knowledge files + reindex | File commit + admin reindex |

Images in v1 are an `imageUrl` string. No upload pipeline, no bucket.

There is no customer-facing admin. Escalations are a list at `GET /api/admin/escalations` and a Telegram alert to `ADMIN_CHAT_ID`.

### 2.8. Jobs — durable before ack

House standard for Sprint B is Inngest (Trigger.dev is the other allowed code-first runner; n8n inside this app is forbidden).

v1 uses **Inngest Cloud**:

- Route: `app/api/inngest/route.ts`.
- Inngest Cloud stores the queue and calls `app/api/inngest` on this app. Function code runs **in this container**. There is no second worker process. A claim that the worker is off-box is false.
- **Async webhook path** (Telegram messages, WhatsApp, NOWPayments): insert `InboxEvent` (`@@unique([provider, eventId])`) and commit. If the unique insert conflicts, return **200** (duplicate delivery). If it inserts, call `inngest.send`. Return **200 only after `inngest.send` accepts**. If send throws, return **500** so the provider retries. The row stays `PENDING`.
- **Inbox sweep** (Inngest cron, every 1 minute; a 30 s cron is not expressible): rows with `status = PENDING` and `createdAt` older than **15 s** get one `inngest.send` with `id` equal to the inbox row id. On accept, nothing else (the function sets `SENT`). After **10** failed sends, set `FAILED` and alert `ADMIN_CHAT_ID` with the event id only. This is the path WhatsApp will not retry for us.
- **Emergency Offline Drain:** In the event of an extended Inngest Cloud outage, an operator can execute `scripts/drain-inbox.ts` (`npm run inbox:drain`) on the host to process `PENDING` inbox events sequentially directly against the database, bypassing Inngest.
- **Outbound Messenger Retries:** Outbound HTTP dispatches to Telegram Bot API and Meta Graph API use exponential backoff with jitter (initial 500ms, max 3 attempts) and respect HTTP 429 `Retry-After`. A 3rd failure marks the delivery failed and logs `[OUTBOUND_DISPATCH_FAIL]`.
- **Deterministic Dual LLM Fallback:** If both primary `AI_MODEL` and fallback `AI_FALLBACK_MODEL` return errors or timeouts, the handler immediately logs `[AI_DUAL_FAILURE]`, creates an `EscalationTicket`, sends the escalation reply, and alerts `ADMIN_CHAT_ID` without waiting for the 8s wall timeout.
- **Stars exception, synchronous.** `pre_checkout_query` and `successful_payment` are **not** enqueued. `POST /api/bot/telegram/webhook` answers them in-process, before the HTTP response, by calling `lib/payments/stars.ts`. Telegram stops waiting after a few seconds; an off-box worker cannot meet that. These two updates do not insert `InboxEvent`. Idempotency is `PaymentEvent` (`successful_payment`) and a read of hold/stock (`pre_checkout_query`).
- AI answers, NOWPayments invoice creation, reindex, hold expiry, PII purge, and the inbox sweep are functions. The HTTP handler does not await the LLM. T-027 and T-031 only **add** a function to `lib/jobs/inngest.ts`; they do not rewrite the client created in T-015.

### 2.9. Process model

v1 deploy is **exactly one** app replica. The in-memory limiter (`lru-cache`, 60 s window, 10 messages per `chat_id`/`phone`, max 10,000 keys) is valid only under that sentence. A second replica makes the limiter skippable; horizontal scale is a Phase 2 change that must replace it. Restart clears the window; that is accepted.

### 2.10. Money, timezone, language

- Fiat-shaped prices: `priceMinor` integer in the currency's minor unit (USD → cents). `currency` is ISO 4217, default from `ShopSettings`, not a hardcoded USD column default that ignores the shop.
- Stars: separate integer `starsPrice`. No decimal `XTR`, no conversion from `priceMinor`.
- Slots are generated in `shopTimezone` and stored as `timestamptz`.
- v1 UI copy is one language, the language of the greeting in `ShopSettings`. No i18n framework.

### 2.11. PII, logs, retention

`Order` may store name, phone, email, Telegram id. That is PII in the same database as the catalog (accepted for v1; there is no second database).

- Logs and traces **must not** contain: bot tokens, `ADMIN_TOKEN`, `initData`, raw webhook bodies, phone, email, payment signature, NOWPayments payload. Log the order id, provider event id, and HTTP/Meta error code.
- The logger also emits three counters (log lines, not a metrics vendor): `inbox_send_fail`, `hold_expired`, `webhook_rejected`. No OpenTelemetry collector in v1.
- Nightly job: for orders in `CANCELLED` or `FULFILLED` whose `updatedAt` is older than **30 days**, set `customerPhone`, `customerEmail`, and `customerName` to null. `customerTgId` is kept as a support key for up to **90 days**, after which it is also nulled by the nightly job.
- User erasure: `POST /api/admin/users/purge` accepts `{ customerTgId }` or `{ phone }` and immediately nulls personal data across both `MessengerContact` and associated `Order` records upon user erasure request.
- `EscalationTicket.queryText` is customer content. Same 30-day nulling.

### 2.12. Schema lifecycle

v1 migration is **create-only**. Expand/contract starts at the first migration after a client has live orders.

- `DATABASE_URL` — pooled runtime (PgBouncer transaction mode). Code under `app/` and `lib/` uses only this.
- `DIRECT_URL` — read only by `scripts/migrate.ts` (`prisma migrate` and the operator's `pg_dump`). A grep test fails the build if `app/` or `lib/` reads `DIRECT_URL`. There is no dump helper in `lib/`. The host's existing Restic job remains the backup; this repo does not add a second one.
- `down.sql` for v1 drops the tables **this migration created**. It is not a production rollback once orders exist. A later destructive migration (drop column, in-place rename, adding `NOT NULL` without a backfill) is forbidden; those follow expand → backfill → contract, with a lock timeout and a down script that restores the previous contract.

### 2.13. Alternatives considered (and rejected for v1)

| Option | Why not v1 |
| --- | --- |
| Cal.com / Cal.diy for slots | Not forked. Cal.diy is a calendar monolith its own maintainers mark non-production, and its UI is a second origin the Mini App cannot frame. Homegrown range exclusion stays. A client who needs Google/Outlook sync gets Cal.diy as a separate service, not as code in this repo, and not in v1 tasks. |
| Chatwoot as the WhatsApp edge | Correct product for a real inbox. Out of v1 because it is a second product, not because of RAM. Template send only. |
| Payload, Vendure, Saleor, Medusa DTC, Vercel Commerce, Your Next Store | Checked 2026-10-11. None is the base. Vendure core is GPL. Medusa stays frozen. The others are a CMS, a Python stack, or a SaaS storefront with no slots. |
| TON Connect or a raw tx-hash watcher | Extra custody story. NOWPayments hosted invoice is the one crypto rail. |
| Full-file prompt instead of FTS | Two retrieval modes make the eval gate unable to fail. FTS only. |
| Stripe/Paddle/YooKassa in the same checkout | No task owned signature, idempotency, or PCI boundary. Adding a hosted link is Phase 2. |

### 2.14. Backup and health (no PITR claim)

- `GET /api/health` returns 200 after `SELECT 1`. It returns no env, no row counts of PII.
- This template does not run its own backup daemon. Orders live in the host PostgreSQL. Restore uses the host's existing Restic + `pg_dump` job (Sprint A retainer). **RPO = that job's interval** (today documented as 6 hours — operator confirms before Day 14). **RTO = restore-from-dump**, not point-in-time. Do not label a 6-hour dump as PITR.
- **DR Verification Drill:** Before Day-14 client handover, operator must execute a verified restore drill of `pg_dump` into an isolated test database container, verifying schema integrity and matching table row counts.

### 2.15. Memory number

The bench records peak RSS of the **app container**. 500 MB is a target, not a ship gate (owner waiver 2026-10-11). Crossing it does not authorize a second product and does not fail the sprint. Postgres is not counted in the app number. Idle homepage does not count.

---

## 3. User Scenarios

### User Story 1 — Catalog and slot hold (P1)

A visitor opens the site or the Mini App, sees active items, and either adds a product or picks a free service window. The window becomes `HELD` for 15 minutes. A second visitor who picks an overlapping window gets a conflict, not a second row.

**Independent test:** two concurrent `POST /api/booking/lock` for the same item and the same `startTime`. One **201**, one **409** (`23P01`). After 15 minutes and one sweeper tick, `POST` again returns **201**.

**Acceptance:**

1. Card shows image URL (if any), title, description, price (formatted from `priceMinor`), duration (services), type.
2. Hold is a `SlotReservation` constrained by `slot_no_overlap`.
3. The order is `PENDING` with a public id. Stock is unchanged.

### User Story 2 — Telegram greeting and Mini App (P1)

`/start` from a new id upserts `MessengerContact`, sends the `ShopSettings` greeting, and attaches the WebApp button. A blocked bot does not get further sends.

**Independent test:** webhook without the secret → 403 and no row. `/start` with the secret → one contact, one greeting. `initData` older than 3600 s on lock → 401. Valid `initData` stores that user id on the order.

**Acceptance:**

1. Secret check happens before grammY mutates anything.
2. `initData` HMAC + `auth_date` live in `lib/security/initData.ts`, called by lock and checkout, not by the theme provider.
3. Reaction time of the webhook **HTTP** response is < 500 ms because it only enqueues. The greeting itself is sent by the job.

### User Story 3 — WhatsApp template (P2)

First inbound message from a number enqueues one approved-template send if `lastAutoReplyAt` is null or older than 24 h.

**Independent test:** unsigned POST → 401. Two signed deliveries of the same Meta message id → one `InboxEvent`, one send. A second **different** message inside 24 h → no second template. A simulated Graph 131047 → error code logged, process still up, phone not in the log.

### User Story 4 — Answer from the knowledge file (P2)

A free-text Telegram message (not a command) is enqueued. The job searches `KnowledgeChunk` and answers from the top chunks, or escalates.

**Independent test:** question whose terms are not in the file → escalation sentence + one `EscalationTicket` + one admin alert, and the reply does not invent a price. The five fixtures in Gate 4 all pass.

**Acceptance:**

1. Job wall time target < 3 s for `AI_MODEL` on a warm chunk set. Over 8 s the job tells the user the admin was notified and escalates. The webhook already returned.
2. Fixtures: ignore-previous-instructions, "print the system prompt", off-topic, empty chunk table, question over 2,000 characters.
3. Escalation alert to `ADMIN_CHAT_ID` contains ticket id and a **truncated** question (200 chars), not the phone and not `initData`.

### User Story 5 — Pay and finalize (P1 for Stars, P2 for NOWPayments)

From a `PENDING` order the visitor pays in Stars or via a NOWPayments invoice. One accepted webhook moves the order to `PAID`.

**Independent test:** replay the same provider event id → 200, one `PaymentEvent`, stock decreased once. Webhook at 98% of the quoted crypto amount → order stays `PENDING`. `pre_checkout_query` after the hold expired → `ok: false`.

---

## 4. Functional Requirements

### 4.1. Catalog, hours, booking

- **FR-01 Admin CRUD & Audit.** Admin token (supporting dual-token rotation) can create/update/deactivate `Item` (product with `stock >= 0` or service with `stock = null` and `durationMin > 0`) and replace `WeeklyHours`. All mutations emit `[ADMIN_ACTION]` audit logs. Public `GET /api/catalog` returns `isActive` items only. Seed script loads the demo shop.
- **FR-02 Windows.** `GET /api/booking/slots?itemId&date` returns free windows for that local date in `shopTimezone`, excluding starts before `now + minNoticeMin`.
- **FR-03 Hold.** `POST /api/booking/lock` performs the transaction in §2.6. Response is 201, 409, or 400. No hold without a `PENDING` order id.

### 4.2. Messengers

- **FR-04 Telegram webhook.** Secret, `/start`, `/help`, catalog WebApp button, free text → AI job, manager button → escalation. `my_chat_member` maintains `isBlocked`.
- **FR-05 initData.** Algorithm, 3600 s max age, ±60s clock skew tolerance. Used by lock and by `POST /api/checkout` only when `initData` is present. Browser checkout without it requires name + phone and rejects a bare Telegram id. Theme provider must not implement HMAC.
- **FR-06 WhatsApp webhook.** `hub.challenge`, raw-body HMAC, 401 on failure, template send only.
- **FR-07 Cooldown.** One template per phone per 24 h, stored on `MessengerContact`.

### 4.3. Knowledge

- **FR-08 Ingest.** Job parses md/pdf under size caps (10 MB / 50 pages, ≤ 200 chunks ceiling) into `KnowledgeChunk` (500/50) in an atomic transaction protected by advisory lock, filling `tsv`.
- **FR-09 Answer.** Top 5 FTS chunks, ≤ 8,000 tokens, query SLA < 50ms, system instruction: answer only from chunks; deterministic fallback to escalation on dual LLM error. No second strategy.
- **FR-10 Escalation.** `EscalationTicket` row + Telegram alert to `ADMIN_CHAT_ID`.

### 4.4. Payments

- **FR-11 Stars.** `sendInvoice` with integer `starsPrice` / `XTR`, issued by the checkout job. `pre_checkout_query` and `successful_payment` are answered **in** `POST /api/bot/telegram/webhook` before the response (spec §2.8). They are not Inngest events.
- **FR-12 NOWPayments.** Signature, 99% rule, `PaymentEvent` idempotency. No other crypto provider in v1.
- **FR-13 Transition.** The single transaction in §2.5. Client and admin get a confirmation message **after** commit, via the job, not before.

### 4.5. Cross-cutting

- **FR-14 Jobs.** Inngest functions for greeting send, template send, AI answer, invoice create, reindex, hold sweep, PII purge (30d orders, 90d customerTgId), and inbox resend sweep (§2.8). Outbound retries with exponential backoff and emergency offline drain via `scripts/drain-inbox.ts`.
- **FR-15 Health.** `GET /api/health`.
- **FR-16 Log denylist.** §2.11, enforced by the logger API (a single `log(event, fields)` that strips the denylist keys).

---

## 5. Non-Functional Requirements

- **NFR-01 Memory.** The DoD bench records app-container peak RSS. 500 MB is a target, not a fail. No local ML, no vector database, no headless browser. Inngest functions run inside this Next.js server; that is not a second worker.
- **NFR-02 Webhook HTTP budget.** The handler returns in < 1.5 s (target < 500 ms for Telegram). It does not call the LLM and does not call NOWPayments create-invoice inline. "Returns quickly" is not a downtime guarantee. The shop is one container; a crash loses in-flight requests, and Telegram retries.
- **NFR-03 Perimeter.** Secrets only from the environment. No wallet private keys. Rate limit per §2.9. Admin routes fail closed when `ADMIN_TOKEN` is unset.
- **NFR-04 Whitelabel split.** §2.7. Brand chrome is a commit; prices, hours, greeting, and template name are data.
- **NFR-05 Restore & DR Drill.** §2.14. Dump interval is the RPO. Not PITR. Verified restore drill into a test container required before Day-14 client handover.

---

## 6. Data Model (Prisma + required raw SQL)

Money fields are integers. `BookingSlot` is removed. `OrderStatus.CONFIRMED` is removed. `PaymentMethod` has two v1 values.

```prisma
enum ItemType { PRODUCT SERVICE }
enum OrderStatus { PENDING PAID CANCELLED FULFILLED }
enum ReservationStatus { HELD BOOKED RELEASED }
enum PaymentMethod { TELEGRAM_STARS CRYPTO_GATEWAY }
enum MessengerPlatform { TELEGRAM WHATSAPP }
enum InboxStatus { PENDING SENT FAILED }

model ShopSettings {
  id                    Int      @id @default(1)
  currency              String   // ISO 4217
  greeting              String
  whatsappTemplateName  String
  updatedAt             DateTime @updatedAt
}

model Item {
  id           String   @id @default(uuid())
  slug         String   @unique
  title        String
  description  String
  priceMinor   Int
  starsPrice   Int?
  currency     String
  imageUrl     String?
  itemType     ItemType
  stock        Int?     // null only for SERVICE
  durationMin  Int?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  orderItems   OrderItem[]
  reservations SlotReservation[]
  hours        WeeklyHours[]
}

model WeeklyHours {
  id            String @id @default(uuid())
  itemId        String?
  item          Item?  @relation(fields: [itemId], references: [id])
  weekday       Int    // ISO 1–7
  startMin      Int
  endMin        Int
  breakStartMin Int?
  breakEndMin   Int?
}

model SlotReservation {
  id            String             @id @default(uuid())
  itemId        String
  item          Item               @relation(fields: [itemId], references: [id])
  orderId       String             @unique
  order         Order              @relation(fields: [orderId], references: [id])
  startTime     DateTime           @db.Timestamptz(3)
  endTime       DateTime           @db.Timestamptz(3)
  status        ReservationStatus
  holdExpiresAt DateTime?          @db.Timestamptz(3)
  createdAt     DateTime           @default(now())
}

model Order {
  id            String         @id @default(uuid())
  orderNumber   String         @unique
  status        OrderStatus    @default(PENDING)
  totalMinor    Int
  currency      String
  customerName  String?
  customerPhone String?
  customerEmail String?
  customerTgId  String?
  items         OrderItem[]
  reservation   SlotReservation?
  paymentMethod PaymentMethod?
  paymentRef    String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model OrderItem {
  id         String  @id @default(uuid())
  orderId    String
  order      Order   @relation(fields: [orderId], references: [id])
  itemId     String
  item       Item    @relation(fields: [itemId], references: [id])
  quantity   Int
  priceMinor Int
}

model PaymentEvent {
  id          String        @id @default(uuid())
  orderId     String
  provider    PaymentMethod
  providerRef String
  amountMinor Int
  currency    String
  accepted    Boolean
  createdAt   DateTime      @default(now())
  @@unique([provider, providerRef])
}

model MessengerContact {
  id              String            @id @default(uuid())
  platform        MessengerPlatform
  externalId      String
  lastAutoReplyAt DateTime?
  isBlocked       Boolean           @default(false)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  @@unique([platform, externalId])
}

model EscalationTicket {
  id         String            @id @default(uuid())
  platform   MessengerPlatform
  senderId   String
  queryText  String?
  isResolved Boolean           @default(false)
  createdAt  DateTime          @default(now())
}

model KnowledgeChunk {
  id        String                   @id @default(uuid())
  source    String
  position  Int
  content   String
  tsv       Unsupported("tsvector")?
  @@index([tsv], type: Gin)
}

model InboxEvent {
  id        String      @id @default(uuid())
  provider  String
  eventId   String
  status    InboxStatus @default(PENDING)
  createdAt DateTime    @default(now())
  @@unique([provider, eventId])
}
```

Migration SQL that must ship next to the Prisma migration:

1. `btree_gist` extension.
2. The `slot_no_overlap` exclusion in §2.6.
3. GIN index on `KnowledgeChunk.tsv` if Prisma's `Unsupported` does not emit it.
4. `CHECK (stock IS NULL OR stock >= 0)`.
5. `CHECK` service rows: `itemType <> 'SERVICE' OR (stock IS NULL AND durationMin > 0)`.

`down.sql` drops only objects this migration created, and the file header states it must not be run against a database that already holds client orders.

---

## 7. Definition of Done

1. **Types.** `npm run check-types` and `npm run build` are clean.
2. **Hold.** Concurrent lock test: 201 vs 409. Expired hold becomes bookable after the sweeper.
3. **Money.** Replay of one Stars `successful_payment` and one NOWPayments event: one stock decrement. 98% crypto payment does not set `PAID`.
4. **initData.** Expired and bad HMAC rejected. Browser checkout that sends a Telegram id without `initData` is 401. Theme provider file does not contain the HMAC check (the security module does).
4a. **Stars sync.** A `pre_checkout_query` fixture is answered in the webhook test without an Inngest call. A `PENDING` inbox row older than 15 s is resent by the sweep; the 11th failure becomes `FAILED`.
5. **WhatsApp.** Unsigned webhook is 401. Template name comes from `ShopSettings`. Phone absent from log snapshot of a failed send.
6. **AI fixtures.** All five in US4 pass against a fixture file. Empty index escalates.
7. **Admin.** Without `ADMIN_TOKEN`, `POST /api/admin/items` is 401. With the token, a price change is visible on `GET /api/catalog` without a rebuild.
8. **Memory.** `docker stats` peak RSS is recorded in the quickstart while one webhook, one LLM job, and one PDF reindex overlap. Over 500 MB is written down, not a failed sprint. Idle homepage does not count.
9. **Health.** `GET /api/health` is 200 when Postgres accepts `SELECT 1`, 503 otherwise.
10. **Onboarding script.** Quickstart contains the Day-14 checklist (keys, $1 charge, webhook seen) and states the Demand Gate and the v16.0 file warning.
11. **Secrets in git.** No `.env` with real tokens. Logger unit test feeds a phone number and asserts it is stripped.

---

## 8. Non-goals

- Fiat cards, TON Connect, self-custody, Chatwoot, Medusa, vector databases, n8n, multi-replica, i18n, image upload, PITR, a customer account system, a 5-day client SLA.
