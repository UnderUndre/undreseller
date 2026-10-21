# Phase 0 Research & Decision Log: Small-Business Commerce Operations Kernel & Capability Packs (`003`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-21  
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Standard Compliance**: ISO/IEC/IEEE 12207:2017 (Decision Management & Spike Governance) & NIST SP 800-218 SSDF

---

## 1. Resolved Architecture & Scope Decisions (Locked in `/speckit.clarify`)

### Decision 1: Delivery Scope Partitioning within Sprint B ($4,900 / 14 Days) — `Q1 Option B`
- **Decision**: Partition Feature 003 into a **Mandatory Production MVP Slice (`Release 003.1`)** (`Party`, `Offering`, `CapacityPort`/`InventoryMovement`, `StaffMember`/`StaffSession` 3-role auth, `Order`/`OrderLine` snapshots, `PaymentPlan`/`PaymentAllocation`, `FulfillmentPlan`/`FulfillmentSegment` + `CompletionEvidence`, `OperatorAction` queue, core redacted read models, and 4-stage Expand/Contract migration from `001`/`002`) and **Subsequent Independent Capability Pack Phases (`Releases 003.2+`)** (`Quote Pack`, `Documents & Compliance Pack`, `ChangeRequest`, `ServiceCase`, `ImportBatch`, `Agent Read Pack`, and `Engineering AI Lab` `Phase H`).
- **Rationale**: Delivering all 34 FRs and the AI Lab as a single blocking release would violate the Sprint B 14-day / $4,900 commercial envelope (`undreseller-business-plan.md` v18.3). Option B delivers a rock-solid, revenue-ready commerce & booking kernel in `003.1` while preserving the full capability-pack architecture and portfolio AI Lab as clean subsequent phases.
- **Alternatives Considered**:
  - *Option A (Monolithic release of all 34 FRs + AI Lab)*: Rejected — high schedule risk against the 14-day delivery SLA.
  - *Option D (Architecture-only roadmap)*: Rejected — leaves `003` without an executable production MVP increment.

---

### Decision 2: Fixed Three-Role Staff Authorization Model (`OWNER`, `OPERATOR`, `PERFORMER`) — `Q2 Option B`
- **Decision**: Enforce a fixed 3-role hierarchy (`StaffRole ∈ { OWNER, OPERATOR, PERFORMER }`) across all HTTP administrative commands and Telegram Staff Bot callbacks (`authorizeStaffCallback`) via static policy guards (`FR-325a`).
- **Rationale**: Micro-businesses and service studios need clear separation between the business owner (`OWNER`: config, staff management, GDPR purges, financial/margin overrides), desk operators (`OPERATOR`: orders, customers, schedules, `OperatorAction` queue, policy-bounded refunds), and field technicians/masters (`PERFORMER`: assigned `FulfillmentSegment` execution, personal schedule view, and `CompletionEvidence` upload) without the complexity of a dynamic user-defined RBAC permission constructor.
- **Alternatives Considered**:
  - *Option A (Single all-powerful operator role)*: Rejected — allows field staff (`PERFORMER`) to trigger refunds, purges, or config mutations.
  - *Option D (Custom per-client role/permission builder)*: Rejected — unnecessary UI/DB complexity for small-business deployments.

---

### Decision 3: Individual Staff Accounts, Server-Side Sessions & Break-Glass `ADMIN_TOKEN` — `Q3 Option B`
- **Decision**: Implement individual `StaffMember` accounts (`email`, `passwordHash` via Node.js native `node:crypto` `scrypt` with random 16-byte salt and timing-safe comparison, linked `telegramUserId`) and database-backed server-side sessions (`StaffSession` storing `tokenHash = sha256(sessionToken)` in an `HttpOnly; Secure; SameSite=Lax` cookie) using a lightweight, zero-copyleft session helper compatible with Next.js 15 App Router (`lib/security/staffSession.ts`). Retain `ADMIN_TOKEN` strictly as an audited emergency break-glass credential (`BREAK_GLASS_ADMIN_TOKEN_USED`).
- **Rationale**: Once three roles exist, a shared static `ADMIN_TOKEN` cannot distinguish individual actors (`actorId`), cannot restrict `OPERATOR` vs `PERFORMER` on web routes, and cannot revoke access for a departing employee without rotating the global token. Database-backed `StaffSession` rows in existing PostgreSQL 16 require zero external Redis containers (preserving the $\le 500\text{ MB RAM}$ budget) and allow instant per-session or per-staff revocation (`revokedAt`, `StaffMember.active = false`).
- **Alternatives Considered**:
  - *Option A (Static bearer token per staff member)*: Rejected — difficult for non-technical staff to manage in browsers and lacks standard session cookie lifecycle controls.
  - *Stateless JWTs without DB session lookup*: Rejected — cannot immediately revoke an active session when a staff member is deactivated (`FR-325b`).

---

### Decision 4: Single-Tenant Dedicated-Database Topology (`1 Deployment = 1 Client Business = 1 PostgreSQL DB`) — `Q4 Option A`
- **Decision**: Each client deployment runs against its own dedicated PostgreSQL database (`SINGLE_TENANT_DEDICATED_DB`, `FR-325c`, `INV-013`). Domain tables contain zero `tenantId` columns, and multi-branch/multi-warehouse structures are deferred to a future capability pack.
- **Rationale**: Matches the Sprint B "Sovereign Commerce Factory" delivery model, keeps unique indexes (`Offering.slug`, `StaffMember.email`, `StaffMember.telegramUserId`, `idempotencyKey`) and GiST exclusion constraints (`slot_resource_no_overlap`) simple and fast, and eliminates cross-client data leakage by physical database isolation.
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
