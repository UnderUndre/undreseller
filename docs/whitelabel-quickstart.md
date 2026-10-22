# 🚀 UnderUndre Modular Commerce Starter — Whitelabel Quickstart & Operator Runbook

**Slug**: `specs/001-modular-commerce-template`  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**  
**Product**: Sprint B (HERO) — 14-Day SaaS MVP & Sovereign Commerce Factory ($4,900 flat fee)  
**Warning**: The legacy fork's business plan (`v16.0`) is stale and superseded. It is **NOT** a commercial source of truth.

---

## 1. Service Topology & Architecture

- **Public Marketing Lander**: Hosted in sibling repository `repos/undrllanding` (`projects/undreseller/`). Serves the public face, 2-SKU pricing cards ($3,500 FOSS Stack / $4,900 MVP Factory), Loom teardowns, and directs qualified buyers to this transactional storefront.
- **Transactional Engine (`undreseller`)**: This repository. Purpose-built Next.js 15 App Router application with PostgreSQL, Prisma ORM, Telegram Mini App, WhatsApp Cloud API gateway, and local AI RAG consultant.
- **Process Model & Memory Fencing**: Exactly **1 app container** (`deploy.replicas: 1`). Target memory consumption is $\le 500\text{ MB RAM}$. In-memory rate limiting (`lru-cache`) is bounded to single-instance topology.
- **Database Architecture**:
  - `DATABASE_URL`: pooled connection via PgBouncer (transaction mode) with `connection_limit = 10`.
  - `DIRECT_URL`: direct unpooled PostgreSQL connection used exclusively by migration scripts (`scripts/migrate.ts`).

---

## 2. Environment Variables Reference

| Variable | Description | Example / Default | Required |
|---|---|---|---|
| `DATABASE_URL` | Pooled PostgreSQL connection string (PgBouncer) | `postgresql://user:pass@host:5432/db?pgbouncer=true` | Yes |
| `DIRECT_URL` | Direct unpooled PostgreSQL connection for migrations | `postgresql://user:pass@host:5432/db` | Yes |
| `ADMIN_TOKEN` | Bearer token for admin API (`/api/admin/*`). Supports `NEW,OLD` | `token_primary_2026_xyz` | Yes |
| `ADMIN_OLD_TOKEN_EXPIRES_AT` | Expiry timestamp for graceful token rotation (max 24h) | `2026-10-20T12:00:00Z` | Conditional |
| `ADMIN_CHAT_ID` | Telegram chat ID for operator alerts | `123456789` | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token from @BotFather | `123456:ABC-DEF1234...` | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token verified on webhook delivery | `sec_telegram_secret_99` | Yes |
| `WHATSAPP_APP_SECRET` | Meta App Secret for raw body HMAC validation | `meta_app_secret_hex` | Yes |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API permanent system user token | `EAA...` | Yes |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API Phone Number ID | `102938475610293` | Yes |
| `NOWPAYMENTS_API_KEY` | NOWPayments account API Key | `api_key_nowpayments` | Yes |
| `NOWPAYMENTS_IPN_SECRET` | NOWPayments dedicated IPN Secret (HMAC-SHA512) | `ipn_secret_nowpayments` | Yes |
| `AI_MODEL` | Primary LLM model ID (4s timeout) | `gemini-2.5-flash` | Yes |
| `AI_FALLBACK_MODEL` | Secondary fallback LLM model ID (3s timeout) | `gpt-4o-mini` | Yes |
| `AI_API_KEY` | Unified API Key for model gateway | `secret_ai_key` | Yes |
| `REPLICA_COUNT` | Strict topology assertion (must be exactly `1`) | `1` | Yes |
| `NEXT_PUBLIC_APP_URL` | Public base URL of transactional application | `https://shop.client.com` | Yes |

---

## 3. Deployment & Setup Sequence

```bash
# 1. Clone template repository
git clone https://github.com/UnderUndre/undreseller.git app
cd app

# 2. Configure environment
cp .env.example .env
# Edit .env with customer credentials

# 3. Install pinned dependencies
npm install

# 4. Deploy database migrations (uses DIRECT_URL)
npm run db:migrate

# 5. Seed initial catalog, service slots, and weekly hours
npm run db:seed

# 6. Verify TypeScript and test suites
npm run validate
npm test

# 7. Build production Next.js bundle
npm run build

# 8. Start application container
npm run start
```

---

## 4. Zero-Downtime `ADMIN_TOKEN` Rotation Procedure

To rotate admin credentials without interrupting active automation or third-party webhooks:

1. **Step 1 — Dual Token Window:**
   - Generate `NEW_TOKEN`.
   - Update environment:
     ```env
     ADMIN_TOKEN="NEW_TOKEN,OLD_TOKEN"
     ADMIN_OLD_TOKEN_EXPIRES_AT="2026-10-20T12:00:00Z" # Exactly 24h grace window
     ```
   - Redeploy or reload environment.
   - Any requests using `OLD_TOKEN` will succeed and emit audit log warning `[OLD_ADMIN_TOKEN_USED]`.

2. **Step 2 — Cutover Clients:**
   - Update client API keys, automation scripts, and cURL commands to `NEW_TOKEN`.

3. **Step 3 — Final Contract:**
   - Once traffic has migrated or 24 hours have elapsed:
     ```env
     ADMIN_TOKEN="NEW_TOKEN"
     ADMIN_OLD_TOKEN_EXPIRES_AT=""
     ```
   - Redeploy. Any subsequent use of `OLD_TOKEN` will be rejected with HTTP 401.

---

## 5. Emergency `inbox:drain` Operator Runbook

When Inngest Cloud queue processing is stalled, network is partitioned, or background jobs fail to deliver:

1. **Diagnosis**:
   - Check `SELECT count(*) FROM "InboxEvent" WHERE status = 'PENDING';` in PostgreSQL.
   - If count is growing, Inngest dispatcher is paused.

2. **Runbook Action**:
   - Log into the host container:
     ```bash
     npm run inbox:drain
     ```
   - Script `scripts/drain-inbox.ts` runs offline in-process.
   - Concurrency is protected by PostgreSQL atomic claim/lease (`status = 'PROCESSING', lockedAt = now(), lockedBy = workerId`).
   - Handlers reconstruct and execute side-effects purely from `InboxEvent.payloadJson`.
   - Events that exceed 10 attempts are automatically flagged as `FAILED` with terminal alerts logged to prevent infinite retry storms.

---

## 6. Operational SLO, RPO & RTO (Honest Disaster Recovery)

- **Availability SLO**: **99.0%** uptime for the single application container (monthly error budget: 7.2 hours).
- **Target RTO**: **$\le 30$ minutes** for single-container reboot or container image recreation.
- **RPO**: Strictly equal to the host Restic / `pg_dump` interval (typically **6 hours** on Hetzner CPX42 infrastructure).
- **Important Disclosure**: This application does **NOT** run a continuous Point-In-Time-Recovery (PITR) daemon. It relies on durable database backups.
- **Verified DR Drill**:
  - Run `docker/bench-memory.sh` to record app container RSS.
  - Before Day-14 client sign-off, operator executes a test restore of `pg_dump` into an isolated PostgreSQL container to verify schema integrity and row count matching.

---

## 7. Day-14 Client Handover Protocol

The founder conducts a strict 60-minute live handover call before escrow release:

1. [ ] **Credentials Handover**: Client inputs their live production credentials directly into host environment variables (`TELEGRAM_BOT_TOKEN`, `WHATSAPP_APP_SECRET`, `NOWPAYMENTS_IPN_SECRET`, `ADMIN_TOKEN`). Founder does **NOT** keep copies in local repositories.
2. [ ] **Live Verification Transaction**: Client executes a live smallest-unit charge:
   - 50 Telegram Stars or $1 crypto invoice against a live product item.
   - Verify webhook arrival: confirm `PaymentEvent` row created on ledger.
   - Confirm order transitions to `PAID` in live database.
3. [ ] **RPO / Backup Disclosure**: Read aloud: *"Your data backup interval is 6 hours. Restore is from dump with an RTO under 30 minutes."*
4. [ ] **Scope Knife Reminder**: Further integrations (fiat credit cards, ERP sync, second messenger bot) belong to Phase 2 retainer or $100/h backlog.
5. [ ] **Sign-off & Escrow**: Escrow released upon successful transaction confirmation.

---

## 8. Commercial Policy & Demand Gate

- **Offer**: Sprint B (HERO) — 14 Calendar Days / $4,900 flat fee.
- **Demand Gate**: The bureau operates under a strict Demand Gate requiring **10 closed Tripwire sales ($350–$490)** before opening new Sprint B client slots.
- **Retainer**: Post-delivery 7-day bugfix SLA (P1/P2 only), followed by an optional $500–$650/month maintenance retainer.

---

## 9. Client Configuration Inputs & Supply-Chain Gate (003.1 Booking-First Template)

### 9.1. Client-Supplied Business Settings
Every new client installation is initialized with sovereign defaults in `config/shop.config.ts` and can be customized via the owner admin endpoint (`PUT /api/admin/settings`):
- **Business Identity**: `businessName`, `businessDescription`, `logoUrl`, and `publicContactLinks`.
- **Locale & IANA Timezone**: `defaultLocale` (e.g., `"en"`), `timeZone` (e.g., `"Asia/Yerevan"` or `"UTC"`). Wall-clock appointment booking queries convert working hours from this timezone.
- **Currency & Confirmation**: New installations initialize to `currency = "USD"` with `currencyConfirmed = false`. The client owner must explicitly confirm or update the business currency before public service prices become visible.
- **Service Fulfillment Modes**: Configure whether services allow customer visits (`IN_CALL`), professional outcalls (`OUT_CALL`), or both. If `IN_CALL` is enabled, an owner-approved `businessServiceAddress` is required; `businessServiceAddressPublic` controls whether this address is published or only revealed to confirmed bookings.
- **Outcall Coverage**: `outCallCoverageDescription` defines the coverage area. Outcall bookings default to pending staff approval (`HELD` status with `holdExpiresAt = null`) until confirmed by staff.

### 9.2. Staff Authentication & Sessions
- **Better Auth Integration**: Requires `BETTER_AUTH_SECRET` (random 32-byte string) and `BETTER_AUTH_URL` (host URL) configured in the host environment.
- **Initial Owner Bootstrap**: Run `npx tsx scripts/bootstrap-owner.ts` with optional `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, and `BOOTSTRAP_OWNER_NAME`.

### 9.3. Supply Chain & Zero Copyleft Compliance
- All production code strictly follows the permissive license registry (`config/oss-reuse-registry.json`).
- Verify supply-chain compliance prior to release using:
  ```bash
  node scripts/verify-licenses.mjs
  ```
- Any presence of copyleft (`AGPLv3`, `GPLv3`, `MSCL`, `ELv2`) fails the gate per NIST SP 800-218 SSDF.

---

## 10. Commercial Tier 2 Capability Packs Unblocking Gate (T069)

- **Date**: 2026-10-22
- **Decision**: Booking demand validated through initial deployments; owner approved rollout of Tier 2 Capability Packs.
- **Enabled Tier 2 Packs**:
  - `Phase 15`: Product Sales & Inventory Ledger (`US1`)
  - `Phase 5`: Mixed Goods-and-Services Orders & Segmented Fulfillment (`US3`)
  - `Phase 6`: Deposit & Milestone Payment Plans (`US4`)
  - `Phase 8`: Capacity-Aware Custom Quotes & Margin Guard (`US6`)
  - `Phase 9`: Unified Party Timeline & Resumable Guest Journeys (`US7`)
  - `Phase 10`: Order Change Requests & Document Reversals (`US8`)
  - `Phase 11`: Jurisdiction Compliance SPI (`US9`)
  - `Phase 12`: Redacted Read Models & Quarantined Staging (`US10`)
