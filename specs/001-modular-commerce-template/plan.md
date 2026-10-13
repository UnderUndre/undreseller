# Implementation Plan: Modular E-Commerce Starter (Track 1, v1)

**Branch / Spec**: `specs/001-modular-commerce-template` | **Revised**: 2026-10-13  
**Spec**: [`spec.md`](spec.md)  
**Repo**: `UnderUndre/undreseller`, greenfield, MIT. Not the legacy BoxyHQ fork.  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017

This plan implements the revised spec. It does not re-open Track 2, fiat rails, TON Connect, Chatwoot, Cal.diy, or a second retrieval strategy.

---

## 1. Where the code lives

One Next.js App Router app at the **root of this repository** (`app/`, `lib/`, `prisma/`, `config/`, `content/`). Create it with `create-next-app` (TypeScript, Tailwind, no `src/`). There is no `apps/commerce-starter/`. Do not copy `pages/`, next-auth middleware, Jackson, or `prisma db push` from the legacy fork. Tasks use those root paths.

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
  booking/lock.ts                   # expiry UPDATE + INSERT, maps 23P01 → 409
  security/initData.ts              # HMAC-SHA256 + auth_date ≤ 3600s
  security/adminAuth.ts             # Bearer vs ADMIN_TOKEN, timingSafeEqual
  security/rateLimiter.ts           # lru-cache; valid because replica count = 1
  security/whatsappSignature.ts     # HMAC over raw body
  bot/telegramBot.ts
  bot/whatsappClient.ts             # template send only
  bot/cooldown.ts
  ai/documentParser.ts              # 10 MB / 50 pages, 500/50 chunks
  ai/knowledgeEngine.ts             # FTS top 5, model ids from env
  payments/stars.ts                 # integer XTR
  payments/nowpayments.ts           # sig + 99% rule
  payments/fulfillment.ts           # the one PAID transaction
  telemetry/logger.ts               # denylist
  jobs/inngest.ts                   # functions listed in spec §2.8
prisma/
  schema.prisma
  migrations/<ts>_init/migration.sql
  migrations/<ts>_init/down.sql     # drops objects of this migration only
scripts/seed.ts
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

1. **Retrieval.** `plainto_tsquery(ftsConfig)` → top 5 `KnowledgeChunk` rows → one LLM call. No full-document prompt path.
2. **Jobs.** Inngest Cloud orchestrates. Functions run in this app through `app/api/inngest`. There is no second worker. Async handlers commit `InboxEvent`, then `inngest.send` with the row id, and return 200 only after send accepts. The inbox cron is every 1 minute, not 30 s. It resends `PENDING` rows older than 15 s and marks `FAILED` after 10 misses. LLM, template send, invoice create, reindex, hold sweep, PII purge, and that resend are functions. Stars `pre_checkout_query` and `successful_payment` are **not** functions: the Telegram webhook calls `lib/payments/stars.ts` and answers before it returns.
3. **Replicas.** Compose file sets `deploy.replicas: 1` for the app. Comment in `rateLimiter.ts` points at spec §2.9.
4. **DSN.** `lib/db/prisma.ts` reads `DATABASE_URL`. `DIRECT_URL` is read only by `scripts/migrate.ts`. A grep test fails the build if `app/` or `lib/` reads `DIRECT_URL`. No dump helper under `lib/`.
5. **Lock.** `btree_gist` + `EXCLUDE USING gist` as in spec §2.6. Application lock function does not use `SELECT … FOR UPDATE` on a newly inserted reservation as the concurrency control.
6. **States.** `PENDING | PAID | CANCELLED | FULFILLED`. Reservation `HELD | BOOKED | RELEASED`. No `CONFIRMED`, no `PERMANENT_BOOKED`.
7. **Stock.** Decremented only inside the PAID transaction. Released only when a `PAID` order is cancelled by admin. `UPDATE … WHERE stock >= qty` is the guard.
8. **Rails.** Stars (`starsPrice` integer) and NOWPayments. Checkout UI has two buttons. No Stripe/Paddle/YooKassa/TON/raw address.
9. **WhatsApp.** Graph API template send using `ShopSettings.whatsappTemplateName`. No session text.
10. **initData.** `lib/security/initData.ts` is the only implementation. `TelegramProvider.tsx` does not verify initData.
11. **Admin.** Bearer `ADMIN_TOKEN`. Items, hours, reindex, escalation list, purge. Images are URLs.
12. **Logs.** `logger.ts` drops keys in the denylist (spec §2.11) recursively before write.
13. **Schema lifecycle.** First migration is create-only. Header of `down.sql` forbids running it on a database with client orders. Later migrations follow expand/contract; this plan does not include one.
14. **Backup.** No backup daemon in this repo. Quickstart says RPO = host Restic/`pg_dump` interval (confirm on Day 14), RTO = restore dump, not PITR.
15. **Commercial.** Quickstart states Sprint B is 14 days / $4,900, Demand Gate, Day-14 $1 charge, and that the legacy fork's v16.0 business plan is not the source. This repo's `LICENSE` stays MIT.
16. **Base.** No fork of Cal.diy, Payload, Medusa, Vendure, Saleor, Vercel Commerce, or Your Next Store. Slots stay the gist exclusion in this database.

---

## 3. Request paths

**Hold.** `POST /api/booking/lock` → if the body contains `initData`, verify it (401 on failure); if it contains `customerTgId` and no `initData`, 401; browser callers send name + phone and no Telegram id → rate limit → `lock.ts` transaction → 201 or 409. No Inngest hop. The hold sweeper still expires `HELD` rows.

**Checkout.** `POST /api/checkout` creates a `PENDING` order for a product (no reservation) or attaches the chosen rail to an existing `PENDING` order. Same `initData` rule as the hold. Stars: enqueue `sendInvoice`. NOWPayments: enqueue hosted-invoice create. The route does not capture money.

**Telegram webhook.** Verify secret → rate limit. If the update is `pre_checkout_query` or `successful_payment`, call `stars.ts` **now** and return that answer (no `InboxEvent`). Any other update: insert `InboxEvent` → `inngest.send` → 200. The job sends the greeting, runs FTS+LLM, or opens an escalation.

**WhatsApp webhook.** Verify raw-body HMAC → same inbox pattern → job checks 24 h cooldown → template send. Graph errors log the code only.

**Stars money path.** Invoice create is the async job above. `pre_checkout_query` re-reads hold and stock in the webhook process; expired or undersold → `ok: false`. `successful_payment` calls `fulfillment.ts` in that same process.

**NOWPayments.** Verify `x-nowpayments-sig` → inbox row → job runs 99% check → `fulfillment.ts`.

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

The order is the task list. Foundation (schema, DSN, config, seed) before lock. Lock and the checkout route before the checkout UI. Inbox+Inngest, including the resend sweep, before any messenger send. Fulfillment before either rail. Stars answers stay on the webhook route. Logger denylist before webhook bodies are parsed. Bench and e2e last.

Phases in `tasks.md` match this order. Parallel lanes in that file are the graph, not a second schedule.
