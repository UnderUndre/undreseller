# Research & Decision Log: Booking-First Service Template (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Standard Compliance**: ISO/IEC/IEEE 12207:2017 (Decision Management & Spike Governance) & NIST SP 800-218 SSDF

---

## 1. Resolved Architecture & Scope Decisions

### Decision 1: Sprint B Delivery Scope ($4,900 / 14 Days) — Updated for `003.1`
- **Decision**: Release `003.1` is a reusable single-business template for independent specialists and small service teams. It includes a public business page, professional profile and portfolio pages, service listings, appointment availability and booking, three fixed staff roles, basic business configuration, and production readiness. Product sales, inventory, mixed carts, online payments, complex operations, and broad commerce-kernel migration move to later releases. No more than one client-selected external API integration is included, and the booking journey works without one.
- **Rationale**: The narrow booking journey addresses the fastest near-term launch need and fits the business plan's $4,900 / 14-day scope. A specialist gets a portfolio and booking page, while a small service business can publish pages for multiple staff. Additional commerce packs can follow after real deployments validate demand.
- **Alternatives Considered**:
  - *Previous broad MVP scope (commerce kernel, inventory, payment plans, messaging, and fulfillment)*: Replaced — too large for the first release and not needed to validate service booking.
  - *Architecture-only roadmap*: Rejected — leaves `003` without a usable template to deploy.

---

### Decision 2: Fixed Three-Role Staff Authorization Model (`OWNER`, `OPERATOR`, `PERFORMER`)
- **Decision**: Keep exactly three fixed roles with statically checked permissions in the first release. `OWNER` controls the business and staff; `OPERATOR` manages services, profiles, schedules, and bookings; `PERFORMER` manages their own public profile and portfolio and sees their assigned bookings. An owner who also provides services can be linked to a bookable resource. No custom role builder or Telegram callback authorization is required in this release.
- **Rationale**: The role model covers both a solo specialist and a small team without adding a fourth role. It gives a professional control over their portfolio while keeping business settings and other staff data protected.
- **Alternatives Considered**:
  - *Option A (Single all-powerful operator role)*: Rejected — allows field staff (`PERFORMER`) to trigger refunds, purges, or config mutations.
  - *Option D (Custom per-client role/permission builder)*: Rejected — unnecessary UI/DB complexity for small-business deployments.

---

### Decision 3: Individual Staff Accounts, Server-Side Sessions & Break-Glass `ADMIN_TOKEN`
- **Decision**: Use Better Auth for individual staff identities and revocable PostgreSQL-backed sessions, linked to application `StaffMember` records for the fixed role and audit attribution. Retain `ADMIN_TOKEN` only as an audited emergency recovery credential. Messaging identities are optional future integrations, not required for staff access.
- **Rationale**: A shared static `ADMIN_TOKEN` cannot distinguish individual actors (`actorId`), cannot restrict `OPERATOR` vs `PERFORMER` on web routes, and cannot revoke access for a departing employee without rotating the global token. Better Auth provides the maintained password/session lifecycle and Prisma integration; the application keeps its own fixed role checks and staff activity state. This avoids custom password hashing and custom cookie/session lifecycle code while using the existing PostgreSQL database without Redis.
- **Implementation reference**: Better Auth's [Prisma adapter documentation](https://better-auth.com/docs/adapters/prisma). Pin the supported library release during implementation and generate its schema from that release.
- **Alternatives Considered**:
  - *Handwritten password hashes and session tables*: Rejected — duplicates security-sensitive credential, cookie, expiry, and revocation mechanisms already provided by the maintained library.
  - *Stateless JWTs without database session lookup*: Rejected — cannot immediately revoke an active session when a staff member is deactivated (`FR-325b`).

---

### Decision 4: Single-Tenant Dedicated-Database Topology (`1 Deployment = 1 Client Business = 1 PostgreSQL DB`) — `Q4 Option A`
- **Decision**: Each client deployment runs against its own dedicated PostgreSQL database (`SINGLE_TENANT_DEDICATED_DB`, `FR-325c`, `INV-013`). Domain tables contain zero `tenantId` columns, and multi-branch/multi-warehouse structures are deferred to a future capability pack.
- **Rationale**: Matches the Sprint B delivery model, keeps unique indexes (`Offering.slug`, `StaffMember.authUserId`, `StaffMember.telegramUserId`, `idempotencyKey`) and GiST exclusion constraints (`slot_resource_no_overlap`) simple and fast, and eliminates cross-client data leakage by physical database isolation.
- **Alternatives Considered**:
  - *Option B/C (Multi-schema or shared-table `tenantId` multi-tenancy)*: Rejected — introduces cross-tenant query leak risks, complicates `pg_dump` restore drills and GDPR purges, and drifts toward a SaaS control plane.

---

### Decision 5: Single-VPS Production Operational Baseline — `Q5 Option B`
- **Decision**: Lock the mandatory Production MVP operational baseline to a Single-VPS profile: **99.0% uptime**, **RTO $\le 60$ minutes**, **RPO $\le 24$ hours** (automated `pg_dump` + Restic backup), **100 concurrent requests**, and **`app RSS <= 500 MB`** for the main application container (`NFR-303`, `NFR-304`). Optional `Engineering AI Lab` components (`LM Studio`, `OmniRoute`, monitoring backends, VPN workstation) run outside the 500 MB app container budget and are decoupled from `commerce-core` availability.
- **Rationale**: Provides an objective, verifiable acceptance target for single-VPS client deployments without requiring Kubernetes, multi-node HA clustering, or continuous WAL PITR.
- **Alternatives Considered**:
  - *Option A (Best-effort demo baseline)*: Rejected — insufficient for production client handoff on Day 14.
  - *Option C/D (Multi-node HA / 5-min PITR)*: Rejected — over-engineered and cost-prohibitive for micro-business single-VPS deployments.

---

### Decision 6: Clean-Room OSS Pattern Borrowing & License Gate
- **Decision**: Borrow architectural patterns (clean-room design reference only) from Medusa (MIT core), Spree (BSD-3-Clause), Directus (MSCL — design reference only), Twenty (AGPLv3 — design reference only), Invoice Ninja (ELv2 — design reference only), Dolibarr (GPLv3 — design reference only), and Apache OFBiz (Apache-2.0). Enforce an automated license & attribution gate (`config/oss-reuse-registry.json`) allowing code/adapted-code only from `MIT`, `BSD-3-Clause`, and `Apache-2.0` sources with exact file path and commit SHA.
- **Rationale**: Prevents copyleft (`AGPLv3`, `GPLv3`) or source-available (`MSCL`, `ELv2`) contamination of the commercial template while reusing battle-tested domain invariants.

---

## 2. Spike Governance (ISO/IEC/IEEE 12207 Decision Management & Constitution Principle XI)

 Feature 003 includes two bounded technical spikes in subsequent phases (`Phase G` and `Phase H`). Both are governed by strict timeboxes, quantitative verification metrics, and mandatory prototype disposal protocols:

### Spike 1: Read-Only MCP Surface (`Agent Read Pack` — `Phase G`)
- **Objective**: Verify that a read-only Model Context Protocol (MCP) adapter can expose bounded projections (`CatalogSearchView`, `AvailabilityView`, `OrderSummaryView`, `OperatorActionView`) with zero PII leakage and zero mutation tools.
- **Timebox**: Strictly $\le 1\text{ day}$ (8 engineering hours).
- **Quantitative Verification Metrics**:
  - Query latency via read-only projection adapter: **p95 < 50 ms**, **p99 < 120 ms** (`NFR-301`);
  - Memory overhead inside app container: **$\le 25\text{ MB}$ additional RSS** (total app RSS $\le 500\text{ MB}$);
  - Security verification: **0 bytes of raw PII** across 100 test payloads and **0 registered write/mutation tools** (`INV-008`, `INV-010`).
- **Spike Disposal Path (MANDATORY DELETION PROTOCOL)**:
  - All exploratory prototype scripts, scratch MCP transports, and temporary spike branches (`spike/003-mcp-read-pack`) MUST be **completely deleted (`git branch -D` / `rm -rf`)** after metrics are recorded.
  - Zero prototype code may be merged or copy-pasted into `lib/` or `app/`. If approved for `Phase G`, the production module (`lib/packs/agentRead/`) is written clean-room from scratch against the typed `CapabilityModule` and read-model contracts.

### Spike 2: Local LLM (`LM Studio`) + `OmniRoute` AI Gateway Outage Drill (`Engineering AI Lab` — `Phase H`)
- **Objective**: Validate the `LanguageModelGateway` OpenAI-compatible wire contract (`generate`, `stream`, `health`) against an `OmniRoute` sidecar and local `LM Studio` server over a private WireGuard/Tailscale subnet, including fail-closed behavior for `AiDataClass.CONFIDENTIAL` when `LM Studio` is stopped.
- **Timebox**: Strictly $\le 2\text{ days}$ (16 engineering hours).
- **Quantitative Verification Metrics**:
  - Primary route timeout enforcement: **$\le 4,000\text{ ms}$**, fallback route: **$\le 3,000\text{ ms}$**, total ceiling: **$\le 8,000\text{ ms}$** (`NFR-306`);
  - Golden dataset benchmark (`50–100` cases): **100% Zod structured-output validity**, **0% PII leakage**, **100% adversarial prompt-injection refusal**, and **$\ge 90\%$ field-extraction accuracy** (`NFR-307`);
  - Fail-closed outage drill: **0 cloud fallbacks** for `CONFIDENTIAL` requests when `LM Studio` is offline (< 500 ms fail-closed response), and **0 impact** on `commerce-core` checkout/booking availability or its `500 MB` container RSS ceiling.
- **Spike Disposal Path (MANDATORY DELETION PROTOCOL)**:
  - Any ad-hoc benchmark notebooks, raw curl scripts, unredacted test logs, and exploratory gateway configs created during the spike MUST be **completely destroyed** before Phase H implementation.
  - Production Lab artifacts (`lib/ai/gateway.ts`, `infrastructure/compose/ai-lab.compose.yml`, `scripts/ai-benchmark.ts`) are authored clean-room from scratch with full PII redaction (`INV-010`).
