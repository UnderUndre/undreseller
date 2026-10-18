# Tasks: Modular E-Commerce Starter (Track 1, v1)

**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Revised**: 2026-10-13 — slug is `specs/001-modular-commerce-template` in `UnderUndre/undreseller`.  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

Paths are the root of this repository (`app/`, `lib/`, `prisma/`). Do not create `apps/commerce-starter/`. Do not copy the legacy BoxyHQ tree.

Out of scope, do not file tasks: Stripe, Paddle, YooKassa, TON Connect, raw wallet watcher, Chatwoot, Cal.diy, Payload, Medusa, Vendure, Saleor, vector DB, n8n, second replica, image upload, i18n, PITR daemon.

---

## Phase 1: Schema, DSN, config

- [ ] `T-001` `[SETUP]` Create the app in this repo root with `create-next-app` (App Router, TypeScript, Tailwind, no `src/`). Do not start from the legacy fork. Build script is `prisma generate && prisma migrate deploy && next build`, not `prisma db push`. Add exact versions (no `latest`, no floating `^`/`~`) and commit the lockfile: `grammy@1.35.0`, `@twa-dev/sdk@8.0.2`, `lru-cache@11.1.0`, `inngest@3.40.1`, `pdf-parse@1.1.1`, `js-tiktoken@1.0.20`. Dev: Playwright and Jest. If a version is not on npm at install time, pin the newest 1.x/3.x that is, and write that version into this line before merging. Keep the existing MIT `LICENSE`.
- [ ] `T-002` `[DB]` `[US1]` Prisma models from spec §6 (`ShopSettings`, `Item`, `WeeklyHours`, `SlotReservation`, `Order`, `OrderItem`, `PaymentEvent`, `MessengerContact`, `EscalationTicket`, `KnowledgeChunk`, `InboxEvent`). Include `requiresOperatorAction` and `operatorActionReason` on both `Order` and `SlotReservation`, and `InboxEvent.attemptCount`, `lastErrorAt`, `lockedAt` / `lockedBy` with `InboxStatus.PROCESSING`. Enums exactly as specified. No `BookingSlot`, no `CONFIRMED`, no `PERMANENT_BOOKED`.
- [ ] `T-003` `[DB]` `[US1]` Init migration SQL: `btree_gist`, `slot_no_overlap` exclusion, GIN on `KnowledgeChunk.tsv`, stock and service CHECKs. `down.sql` drops only these objects and its header forbids use on a database that already has client orders.
- [ ] `T-004` `[DB]` `[US1]` `lib/db/prisma.ts` constructs the client from `DATABASE_URL` only. `schema.prisma` keeps `directUrl = env("DIRECT_URL")`. The only reader of `DIRECT_URL` is `scripts/migrate.ts` (prisma migrate). A CI grep fails if `app/` or `lib/` contains `DIRECT_URL`. No dump helper under `lib/`.
- [ ] `T-005` `[SETUP]` `[US1]` `config/shop.config.ts`: brand, colors, logo URL, `shopTimezone`, `ftsConfig` (default `simple`), `minNoticeMin`. Validation rules: `ShopSettings.greeting` constrained to max 500 chars (plain text + Telegram markdown v2 subset, no HTML/script tags). No prices, no greeting in git config — those are `ShopSettings` in DB.
- [ ] `T-006` `[DB]` `[US1]` `scripts/seed.ts`: one `ShopSettings` row, one service, one product with `stock`, weekly hours in `shopTimezone`.

## Phase 2: Admin write path (FR-01)

- [ ] `T-007` `[SEC]` `[US1]` `lib/security/adminAuth.ts`. Bearer compared with `timingSafeEqual` (supports `NEW_TOKEN,OLD_TOKEN` dual rotation bounded by `ADMIN_OLD_TOKEN_EXPIRES_AT` timestamp env var, max 24h grace period). Emits warning audit log `[OLD_ADMIN_TOKEN_USED]` if old token is used; rejects with 401 if expired. Missing `ADMIN_TOKEN` → 401 on every admin route. All admin calls emit `[ADMIN_ACTION]` audit logs via `logger.ts` without PII.
- [ ] `T-008` `[BE]` `[US1]` `POST/PATCH /api/admin/items`, `PUT /api/admin/hours`, and `PUT /api/admin/settings`. Zod-validated. Sanitize and validate `ShopSettings.greeting` (max 500 chars, no HTML/scripts). Reject `WeeklyHours` with `endMin <= startMin`, a break outside the shift, `weekday` outside 1–7, or two overlapping intervals for the same `(itemId, weekday)`. Public `GET /api/catalog` and `GET /api/catalog/[slug]` return active items only. Price change is visible without rebuild.
- [ ] `T-009` `[BE]` `[US4]` `GET /api/admin/escalations` (supports `?type=slot_conflict` query for orders with `requiresOperatorAction = true`). `POST /api/admin/orders/[id]/purge` nulls order PII immediately. `POST /api/admin/users/purge` nulls user PII across `MessengerContact` and `Order` records upon erasure request.

## Phase 3: Booking, Storefront UI & SEO

- [ ] `T-010` `[BE]` `[US1]` `lib/booking/windows.ts` + `GET /api/booking/slots`. Windows from `WeeklyHours` in `shopTimezone`, minus `HELD`/`BOOKED` ranges, minus holds that are not yet expired, minus any start earlier than `now + minNoticeMin` from `shop.config.ts`.
- [ ] `T-011` `[BE]` `[US1]` `lib/booking/advisoryLock.ts` (`acquireItemSlotLock`) + `lib/booking/lock.ts` + `POST /api/booking/lock`. If `initData` is present, verify it (T-014); if `customerTgId` is present without `initData`, return 401; browser body is name + phone and no Telegram id. Transaction: acquire transaction-level advisory lock on `itemId` via `acquireItemSlotLock(tx, itemId)`, release expired `HELD` for this item, insert `PENDING` order + `HELD` reservation. Map SQLSTATE `23P01` to 409. Do not use `FOR UPDATE` on the new row as the lock.
- [ ] `T-012` `[FE]` `[US1]` Transactional catalog page, `ItemCard`, book page, `SlotGrid`. Conflict from 409 shown as "slot just taken". Note: marketing lander (Hero, 2-SKU pricing, Loom showcase) is served by `repos/undrllanding` (`projects/undreseller`).
- [ ] `T-013` `[FE]` `[US2]` `TelegramProvider.tsx` + layout: theme, MainButton, haptic, `disableVerticalSwipes()` (Bot API 7.7+), viewport stable height (`--tg-viewport-stable-height`), and safe area insets. File must not import or implement initData HMAC.
- [ ] `T-036` `[FE]` `[SEO]` Next.js 15 async metadata (`generateMetadata` with `await params`), Schema.org JSON-LD (Product, Service, FAQPage) with XSS sanitization (`replace(/</g, '\\u003c')`), dynamic `app/sitemap.ts`, and crawler perimeter isolation `app/robots.ts`.

## Phase 4: Auth, inbox, jobs, logs

- [ ] `T-014` `[SEC]` `[US2]` `lib/security/initData.ts` + unit tests: valid HMAC, bad HMAC, `auth_date <= now + 60s` (±60s clock skew tolerance), and `now - auth_date <= 3600s`. Lock and checkout call it when a Telegram user is claimed.
- [ ] `T-015` `[BE]` `[US2]` `InboxEvent` insert (`@@unique([provider, eventId])`), `lib/jobs/inngest.ts`, `app/api/inngest/route.ts`, and emergency offline drain `scripts/drain-inbox.ts` (`npm run inbox:drain`). Shared atomic claim/lease state machine (`PENDING → PROCESSING → SENT` via atomic conditional `UPDATE ... WHERE id = $id AND (status = 'PENDING' OR (status = 'PROCESSING' AND lockedAt < now() - interval '5 minutes'))` with worker id and lease recovery). Inbound sweep scans `(status = 'PENDING' AND createdAt <= now() - interval '15 seconds') OR (status = 'PROCESSING' AND lockedAt <= now() - interval '5 minutes')`. On dispatch failure when `attemptCount < 10`: status is immediately reset to `PENDING` with `lockedAt = null`, `lockedBy = null`, `attemptCount` is incremented, and `lastErrorAt = now()`. On 10th failure (`attemptCount >= 10`), status becomes `FAILED` and alert sent to `ADMIN_CHAT_ID`. Functions run in this app. Async handlers commit the row, then `inngest.send` with that row id, and return 200 only after send accepts; unique conflict returns 200 without a second send. Later tasks that need a function (T-027, T-031) only append one; they do not replace this file's client.
- [ ] `T-016` `[OPS]` `[NFR]` `lib/telemetry/logger.ts` denylist (spec §2.11) + `[ADMIN_ACTION]` format + unit test that a phone, an email, `initData`, and a bot token are absent from the written line. Same logger writes counters `inbox_send_fail`, `hold_expired`, `webhook_rejected` (one line each, no OpenTelemetry).
- [ ] `T-017` `[SEC]` `[NFR]` `lib/security/rateLimiter.ts` (10 / 60 s, 10k keys). Startup assertion checking `process.env.REPLICA_COUNT === '1'` throwing hard failure `ERR_INVALID_REPLICA_TOPOLOGY` if unset or misconfigured. Applied on both messenger webhooks and on lock.

## Phase 5: Telegram and WhatsApp

- [ ] `T-018` `[BE]` `[US2]` grammY handlers in `lib/bot/telegramBot.ts`: `/start`, `/help`, WebApp button, free text, manager button, `my_chat_member` → `isBlocked`. Outbound dispatches feature exponential backoff retry.
- [ ] `T-019` `[BE]` `[US2]` `POST /api/bot/telegram/webhook`. Wrong secret → 403 and no `InboxEvent`. `pre_checkout_query` and `successful_payment` call `lib/payments/stars.ts` in this process and return that answer; they do not insert `InboxEvent` and do not call `inngest.send`. Every other update is inbox + enqueue. No LLM call in the handler. The Stars branch is implemented in T-028; this task leaves a typed dispatch that T-028 fills, so the file is not written by two people at once.
- [ ] `T-020` `[BE]` `[US3]` `lib/bot/whatsappClient.ts`: send the named template only with exponential backoff (initial 500ms, max 3 retries, 429 `Retry-After` handling). `lib/security/whatsappSignature.ts` over the **raw** body.
- [ ] `T-021` `[BE]` `[US3]` `GET/POST /api/bot/whatsapp/webhook`. GET `hub.challenge`. POST bad signature → 401 and no row. Job uses `lib/bot/cooldown.ts` (24 h). Graph error logs the code, not the phone.

## Phase 6: Knowledge

- [ ] `T-022` `[BE]` `[US4]` `lib/ai/documentParser.ts`. Reject > 10 MB, > 50 pages, or > 200 chunks ceiling. Architectural constraint note: 200 chunks ceiling protects single-container Postgres from WAL/VACUUM pressure. Split with `js-tiktoken` `cl100k_base`, 500 tokens, overlap 50. `INSERT` sets `tsv` to `to_tsvector(ftsConfig, content)` inside an atomic transaction (`DELETE` before batch `INSERT`) protected by advisory lock `pg_try_advisory_xact_lock(hashtext('knowledge_reindex'))`. Runs only inside reindex function.
- [ ] `T-023` `[BE]` `[US4]` `POST /api/admin/reindex` enqueues that function. App boot does not parse the PDF.
- [ ] `T-024` `[BE]` `[US4]` `lib/ai/knowledgeEngine.ts`. FTS top 5, ≤ 8,000 tokens (query SLA < 50ms). Strict timeout budget: primary `AI_MODEL` timeout capped at 4s; fallback `AI_FALLBACK_MODEL` budget is remaining wall-time (capped at max 3s); total outer wall-time budget is 8s. Fallback on 404, 429, 529, 5xx, and timeout. Immediate escalation dispatch on dual-model error without waiting for 8s. Miss → escalation sentence + `EscalationTicket` + alert to `ADMIN_CHAT_ID` (ticket id + 200 chars).
- [ ] `T-025` `[BE]` `[US4]` Five fixtures (spec US4 AC2) as a unit test against a fixture markdown file and a stubbed model.

## Phase 7: Payment state machine

- [ ] `T-026` `[BE]` `[US5]` `lib/payments/fulfillment.ts`. One transaction: acquire transaction-level advisory lock on `itemId` via `acquireItemSlotLock(tx, itemId)`, release expired holds, insert `PaymentEvent`, set `PAID`. Service lines: check overlapping reservation with `status IN ('HELD', 'BOOKED')`; if none, set reservation `BOOKED`; if conflict exists, do NOT transition reservation to `BOOKED` (preventing `23P01` rollback), keep reservation `RELEASED`, set `requiresOperatorAction = true` and `operatorActionReason = 'OVERBOOKED_MANUAL_RESOLUTION'` on both `SlotReservation` and `Order`, and log `[SLOT_OVERBOOK_COLLISION]`. Product lines: update stock conditionally; if update affects 0 rows (exhausted inventory), do NOT rollback, set `Order.requiresOperatorAction = true` and `Order.operatorActionReason = 'PAID_OUT_OF_STOCK'`, logging `[PRODUCT_OUT_OF_STOCK_COLLISION]`. Post-commit: enqueue admin Telegram alert via durable job. Unique `(provider, providerRef)` makes replay a no-op that returns 200. Admin cancel of a `PAID` order restores stock and sets `RELEASED`.
- [ ] `T-027` `[BE]` `[US5]` Append one function to `lib/jobs/inngest.ts` (do not rewrite the client from T-015). Every 60 s: groups expired holds by `itemId`, sorts `itemIds` in ascending order (`ORDER BY itemId ASC` to prevent deadlocks), acquires `acquireItemSlotLock(tx, itemId)` for each item, and within that transaction updates `HELD` with `holdExpiresAt <= now()` → `RELEASED`, and parent `PENDING` → `CANCELLED`. No stock change. Log `hold_expired`.
- [ ] `T-028` `[BE]` `[US5]` `lib/payments/stars.ts`, called from the dispatch T-019 left in `app/api/bot/telegram/webhook/route.ts`. Integer `starsPrice`, currency `XTR`. `pre_checkout_query` re-reads hold and stock in this process; expired hold → `ok: false`. `successful_payment` calls fulfillment in this process. Neither update calls `inngest.send`. Invoice **creation** (`sendInvoice`) stays on the checkout job from T-030.
- [ ] `T-029` `[BE]` `[US5]` `lib/payments/nowpayments.ts` + `POST /api/payments/crypto/webhook`. Bad `x-nowpayments-sig` → 401 and no row. Accepted job: paid/quoted < 0.99 → stay `PENDING` and alert admin; else fulfillment. No other crypto provider.
- [ ] `T-030` `[BE]` `[US5]` `POST /api/checkout` + `CheckoutModal` + `app/checkout/page.tsx`. Route: same initData rule as T-011; creates a product `PENDING` order (no reservation) or attaches a rail to an existing `PENDING` order; enqueues `sendInvoice` or NOWPayments invoice create; does not capture money. UI: two actions, Stars and NOWPayments. No fiat button. The modal does not verify HMAC.
- [ ] `T-031` `[BE]` `[NFR]` Append one function to `lib/jobs/inngest.ts` (do not rewrite the client from T-015). Nightly: `CANCELLED`/`FULFILLED` older than 30 days, null name/phone/email and `EscalationTicket.queryText`; null `customerTgId` older than 90 days. `PaymentEvent` records are classified as immutable statutory financial accounting ledgers retained per `PAYMENT_LEDGER_RETENTION_YEARS` (default 5 years, exempt from user PII purge; automatic post-statutory purging is an external accounting procedure).

## Phase 8: Ops, bench, docs

- [ ] `T-032` `[BE]` `[NFR]` `GET /api/health`. 200 on `SELECT 1`, 503 otherwise. Body has no env and no PII.
- [ ] `T-033` `[OPS]` `[NFR]` `docker/bench-memory.sh` per plan §4. Print app RSS and Postgres RSS. Run verified DR restore drill of `pg_dump` into test PostgreSQL container before Day-14 sign-off. Numerical SLO target: 99.0% availability, target RTO ≤ 30 minutes. Do not fail the script only because app RSS is over 500 MB.
- [ ] `T-034` `[E2E]` `[US1]` Playwright: catalog → lock → second lock 409 → checkout Stars stub → order `PAID` once. Plus unit tests: T-014 (initData HMAC + clock skew), T-016 (logger denylist), T-025 (AI fixtures), T-026 (idempotency + late payment conflict branching against both HELD and BOOKED slots without 23P01 rollback + paid-out-of-stock branch with Order.requiresOperatorAction = true), T-027 (concurrency test of sweeper and fulfillment for expired HELD -> never CANCELLED after payment), T-007 (ADMIN_OLD_TOKEN_EXPIRES_AT grace period check), T-017 (startup assertion REPLICA_COUNT === '1'), T-008 (greeting sanitization), and T-015 (claim/lease concurrency + immediate PENDING reset on failure).
- [ ] `T-035` `[DOC]` `docs/whitelabel-quickstart.md`: clone steps, env list (`AI_MODEL`, `AI_FALLBACK_MODEL`, `ADMIN_OLD_TOKEN_EXPIRES_AT`, `REPLICA_COUNT`), Day-14 checklist (plan §5), verified DR restore drill, zero-downtime `ADMIN_TOKEN` rotation procedure (24h grace period), emergency `inbox:drain` runbook (claim/lease model), service topology (marketing lander in `repos/undrllanding` vs transactional storefront in `undreseller`), RPO = host dump interval (not PITR), numerical SLO (99.0% uptime, RTO ≤ 30m), Demand Gate (10 tripwires), Sprint B 14 days / $4,900, and the warning that the legacy fork's v16.0 business plan is not the commercial source.

---

## Dependency graph

```text
T-001 → T-002
T-002 → T-003
T-003 → T-004
T-004 → T-006
T-001 → T-005
T-005 → T-006
T-004 → T-007
T-007 → T-008
T-007 → T-009
T-004 + T-005 → T-010
T-001 → T-014
T-010 + T-014 → T-011
T-011 → T-012
T-001 → T-013
T-004 + T-005 → T-036
T-001 + T-004 → T-015
T-001 → T-016
T-001 → T-017
T-015 + T-016 + T-017 → T-018
T-018 → T-019
T-015 + T-016 + T-017 → T-020
T-020 → T-021
T-005 → T-021
T-003 → T-022
T-022 → T-023
T-022 + T-015 → T-024
T-024 → T-025
T-016 → T-019
T-011 + T-004 → T-026
T-026 → T-027
T-026 + T-018 → T-028
T-026 + T-015 → T-029
T-012 + T-014 + T-015 + T-026 + T-029 → T-030
T-015 + T-004 → T-031
T-004 → T-032
T-019 + T-023 + T-024 → T-033
T-012 + T-011 + T-030 + T-026 + T-036 → T-034
T-033 + T-034 + T-032 → T-035
```

A task does not start until every predecessor in that graph is done. A lane is a view of that graph, not permission to skip a predecessor that sits in another lane.

## Parallel lanes

| Lane | Tag | Sequence | Cross-lane joins |
| --- | --- | --- | --- |
| Foundation | `[SETUP]` `[DB]` | T-001 → T-002 → T-003 → T-004 → T-006, and T-001 → T-005 → T-006 | T-005 joins T-010, T-021 and T-036. T-004 joins almost every backend task. |
| Admin | `[SEC]` `[BE]` | T-007 → T-008 → T-009 | T-007 after T-004. |
| Booking & SEO | `[BE]` `[FE]` | T-010 → T-011 → T-012, plus T-013 after T-001, plus T-036 after T-005 | T-011 also waits on T-014. |
| Inbox | `[SEC]` `[BE]` `[OPS]` | T-014, T-015, T-016, T-017 in graph order, then T-018 → T-019 and T-020 → T-021 | T-019 and T-021 wait on T-015 + T-016 + T-017. T-028 fills the Stars dispatch T-019 left behind, after T-026. |
| Knowledge | `[BE]` | T-022 → T-023 → T-024 → T-025 | T-024 also waits on T-015. |
| Money | `[BE]` | T-026 → T-027, T-028, T-029, then T-030 | T-030 also waits on T-012, T-014, T-015. T-031 appends a function after T-015. |
| Prove | `[OPS]` `[E2E]` `[DOC]` `[BE]` | T-032 after T-004; T-033 after T-019 + T-023 + T-024; T-034 after T-011 + T-012 + T-030 + T-026 + T-036; T-035 last | Nothing in this lane starts a feature task. |

## Agent summary

| Tag | Tasks |
| --- | --- |
| `[SETUP]` | T-001, T-005 |
| `[DB]` | T-002, T-003, T-004, T-006 |
| `[SEC]` | T-007, T-014, T-017 |
| `[BE]` | T-008, T-009, T-010, T-011, T-015, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-025, T-026, T-027, T-028, T-029, T-030, T-031, T-032 |
| `[FE]` | T-012, T-013, T-036 |
| `[OPS]` | T-016, T-033 |
| `[E2E]` | T-034 |
| `[DOC]` | T-035 |

---

## Requirement map

| Requirement | Tasks |
| --- | --- |
| FR-01 Admin CRUD | T-006, T-007, T-008 |
| FR-02 Windows | T-010 |
| FR-03 Hold + exclusion | T-003, T-011 |
| FR-04 Telegram | T-018, T-019, T-028 |
| FR-05 initData | T-014, T-011, T-030 (not T-013) |
| FR-06 WhatsApp | T-020, T-021 |
| FR-07 Cooldown | T-021 |
| FR-08 Ingest | T-003, T-022, T-023 |
| FR-09 FTS answer | T-024 |
| FR-10 Escalation | T-009, T-024 |
| FR-11 Stars | T-019, T-028, T-030 |
| FR-12 NOWPayments | T-029 |
| FR-13 PAID + stock | T-026 |
| FR-14 Durable jobs | T-015, T-027, T-031 |
| FR-15 Health | T-032 |
| FR-16 Log denylist | T-016 |
| NFR-01 500 MB | T-033 |
| NFR-02 Ack after enqueue | T-015, T-019, T-021 |
| NFR-03 Perimeter | T-007, T-017 |
| NFR-04 Whitelabel split | T-005, T-008, T-035 |
| NFR-05 RPO stated | T-035 |
| US1 | T-006, T-008, T-010, T-011, T-012, T-036 |
| US2 | T-013, T-014, T-018, T-019 |
| US3 | T-020, T-021 |
| US4 | T-022, T-023, T-024, T-025 |
| US5 | T-026, T-027, T-028, T-029, T-030 |
| Day-14 / Demand Gate | T-035 |
| PII 30-day nulling | T-031 |
| DSN split | T-004 |
| Inbox resend sweep | T-015 |
| Checkout route | T-030 |
| Hours overlap | T-008, T-010 |
| Lockfile pins | T-001 |
| Create-only down.sql | T-003 |
