# Implementation Plan: Small-Business Commerce Operations Kernel & Capability Packs (`003`)

> "Тяжесть — это надёжно. Даже если не выстрелит, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)  
> "These walls are funny. First you hate 'em, then you get used to 'em. Enough time passes, you get so you depend on them." — _Побег из Шоушенка_  
> "Scissors cuts paper, paper covers rock, rock crushes lizard... — Распределённый дедлок в микросервисах." — Шелдон Купер (_The Big Bang Theory_)

**Branch**: `specs/003-commerce-operations-capability-packs` | **Date**: 2026-10-21 | **Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Input**: Feature specification from `specs/003-commerce-operations-capability-packs/spec.md` (with 5/5 `/speckit.clarify` decisions locked)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**

---

## 1. Summary

Feature `003-commerce-operations-capability-packs` evolves the `001`/`002` modular storefront into a **jurisdiction-neutral small-business commerce operations kernel** while strictly preserving the Sprint B commercial envelope ($4,900 flat / 14 days, Track 2 frozen, single-VPS $\le 500\text{ MB RAM}$ application container).

In accordance with the 5 architectural decisions locked during `/speckit.clarify`:
1. **Production MVP Scope (`Q1 Option B`)**: Release `003.1` delivers the narrow Production MVP kernel (`Party`, `Offering`, `CapacityPort`/`InventoryMovement`, `Order`/`OrderLine` snapshots, `PaymentPlan`/`PaymentAllocation`, `FulfillmentPlan`/`FulfillmentSegment` + `CompletionEvidence`, `OperatorAction` work queue, core redacted read models, and 4-stage Expand/Contract migration from `001`/`002`). Subsequent capability packs (`Quote Pack`, `Documents & Compliance Pack`, `ChangeRequest`, `ServiceCase`, `ImportBatch`, `Agent Read Pack`) and the `Engineering AI Lab` (`Phase H: P-AI-001`–`P-AI-008`) are delivered as independent non-blocking phases (`003.2+`).
2. **Fixed 3-Role Staff Model (`Q2 Option B`)**: Static role hierarchy `StaffRole ∈ { OWNER, OPERATOR, PERFORMER }` enforced across HTTP commands and Telegram Staff Bot callbacks (`FR-325a`) without building a custom dynamic RBAC constructor.
3. **Individual Staff Accounts & Server-Side Sessions (`Q3 Option B`)**: Invite-only/`OWNER`-provisioned `StaffMember` accounts (`scrypt` password hashes) and revocable database-backed `StaffSession` cookies (`HttpOnly; Secure; SameSite=Lax`) with mandatory `actorId` attribution on every command (`FR-325b`); `ADMIN_TOKEN` is retained strictly as an emergency break-glass credential with dedicated high-severity audit logging (`BREAK_GLASS_ADMIN_TOKEN_USED`).
4. **Single-Tenant Dedicated-Database Topology (`Q4 Option A`)**: `1 client business = 1 deployment + 1 dedicated PostgreSQL database` (`FR-325c`, `INV-013`), zero `tenantId` columns in domain tables, and multi-branch support deferred to a future capability pack.
5. **Single-VPS Production Operational Baseline (`Q5 Option B`)**: `99.0% uptime`, `RTO <= 60 minutes`, `RPO <= 24 hours`, `100 concurrent requests`, and `app RSS <= 500 MB` (`NFR-303`, `NFR-304`), with the optional `Engineering AI Lab` (`LM Studio`, `OmniRoute`, monitoring backends, VPN workstation) isolated outside the 500 MB commerce-core container.

---

## 2. Technical Context

- **Language/Version**: TypeScript 5.8 / Node.js 22 LTS / Next.js 15 (App Router, root `app/` and `lib/` layout).
- **Primary Dependencies**: Prisma ORM 6.4.1, grammY 1.35.0 (`bot` + `staffBot`), Inngest SDK 3.x (with built-in 5s `inboxPoller` + PostgreSQL `deadlineSweeper` fallback), Zod 3.24, Node.js native `node:crypto` (`scrypt`, `timingSafeEqual`, `createHmac`).
- **Storage**: PostgreSQL 16 with `btree_gist` extension (`DATABASE_URL` pooled `connection_limit=10`, `DIRECT_URL` for guarded 4-stage migrations). Single-tenant dedicated database per client deployment (`Q4 Option A`).
- **Testing**: Jest 29 (unit, contract, concurrency, and migration tests) + Playwright E2E + `docker/bench-memory.sh` (RSS & DR restore drill).
- **Target Platform**: Single-VPS Linux host (Docker Compose + Traefik v3, Hetzner CPX42 baseline) for `commerce-core`; optional external GPU workstation over WireGuard/Tailscale VPN for `Phase H` (`LM Studio` + `OmniRoute`).
- **Project Type**: Single modular monolith web application & dual Telegram bot engine (`MODULAR_MONOLITH`, `REPLICA_COUNT=1`).
- **Performance Goals**: Read-model & `checkCapacity` queries `< 50 ms (p95)` / `< 120 ms (p99)` (`NFR-301`); write commands & webhook acks `< 250 ms (p95)` / `< 1,500 ms (p99)` (`NFR-302`).
- **Constraints**: Main application container **`app RSS <= 500 MB RAM`** under **100 concurrent requests** (`NFR-303`); **99.0% uptime**, **RTO $\le 60$ min**, **RPO $\le 24$ h** (`NFR-304`); 4-stage migrations with `lock_timeout = '2s'` and `statement_timeout = '5s'` (`NFR-305`).
- **Scale/Scope**: Single client business per deployment; up to 10 offerings / 480 minutes per booking basket; 11 user stories partitioned into Tier 1 Production MVP (`US1`–`US5`), Tier 2 Capability Packs (`US6`–`US10`), and Tier 3 Portfolio AI Lab (`US11`).
- **Security Surface & STRIDE Triggers**: Modifies admin authentication (`StaffMember` + `StaffSession` + break-glass `ADMIN_TOKEN`), 3-role RBAC (`OWNER`, `OPERATOR`, `PERFORMER`), HMAC guest tokens (`ContinuationLink`), and private VPN AI Gateway contour $\to$ **Full STRIDE matrix required and completed below**.
- **Database Migration Trigger**: Evolves `001`/`002` `Item`, `Order`, `OrderItem`, `SlotReservation`, and `MessengerContact` into `Offering`, `OrderLine`, `Party`, `PaymentPlan`, `FulfillmentPlan`, and `OperatorAction` $\to$ **4-stage Expand/Contract required**.
- **Supply Chain & Licensing**: Permissive licenses only (`MIT`, `BSD-3-Clause`, `Apache-2.0`) enforced via `config/oss-reuse-registry.json`; zero `AGPLv3`/`GPLv3`/`MSCL`/`ELv2` code reuse.
- **Research Spikes & Disposal**: Two timeboxed spikes documented in `research.md` (`Spike 1: Agent Read Pack MCP`, `Spike 2: LM Studio + OmniRoute Outage Drill`) with mandatory branch/prototype deletion protocols (Constitution Principle XI).

---

## 3. Architectural Topology Evaluation & Constitution Check

### 3.1. Topology Evaluation (Conway's Law & Inverse Conway Maneuver)
- **Commerce Core (`Track 1`)**: Strictly **Modular Monolith (`MODULAR_MONOLITH`, `REPLICA_COUNT=1`)**. Splitting `Party`, `Offering`, `Capacity`, `Order`, `PaymentPlan`, and `FulfillmentPlan` into distributed microservices is rejected because atomic cross-aggregate invariants (`INV-001`–`INV-004`) require local PostgreSQL ACID transactions and a $\le 500\text{ MB RAM}$ footprint.
- **Optional AI Engineering Lab (`Phase H`)**: Justified under **Clause (b) Heterogeneous Hardware Requirements (GPU vs CPU)**. Local GGUF inference (`LM Studio`) and the `OmniRoute` sidecar run on an external GPU workstation connected via private WireGuard/Tailscale VPN behind the `LanguageModelGateway` port, completely decoupled from the CPU-bound VPS commerce container.

### 3.2. Constitution Check (Pre-Design & Post-Design Gate)

| Principle | Gate Status | Verification in Feature 003 Plan |
| :--- | :--- | :--- |
| **I–III. Source of Truth & Protected Slots** | **PASS** | All specs and commands live in canonical paths (`specs/003-commerce-operations-capability-packs/`, `specs/main/`); zero hand-edits to generated targets. |
| **IV. SemVer Discipline (0.x Zone)** | **PASS** | Feature 003 is a backward-compatible minor feature evolution (`2.1.0` $\to$ `2.2.0` / `0.x` minor bump via `/bump` only at release). |
| **VI. Cross-AI Review Gate** | **PASS** | `/speckit.analyze` report generated in `reviews/analyze.md`; implementation gated until `analyze.md` + $\ge 2$ external reviews pass. |
| **VII-B. Business Plan Alignment** | **PASS** | Verified against `undreseller-business-plan.md` v18.3: Option B scope preserves the $4,900 / 14-day Sprint B envelope, $\le 500\text{ MB RAM}$ ceiling, and Track 2 freeze (`Business plan: unchanged`). |
| **VIII. Living Spec (`specs/main/`)** | **PASS** | `specs/main/README.md`, `architecture.md`, and `requirements.md` updated to v2.1.0 with Feature 003 target architecture reference. |
| **IX. Two-Phase Review Flow** | **PASS** | Planning artifacts isolated in `specs/003-commerce-operations-capability-packs/`. |
| **X. Zero-Downtime Expand/Contract** | **PASS** | 4 decoupled migration deployments (`Expand` $\to$ `Backfill` $\to$ `Validate/Cutover` $\to$ `Contract`) with `lock_timeout = '2s'`, `statement_timeout = '5s'`, and `down.sql` rollbacks. |
| **XI. Spike Governance & Disposal** | **PASS** | Both `Phase G` (MCP Read Pack) and `Phase H` (AI Lab) spikes have $\le 2$-day timeboxes, p95/memory metrics, and mandatory prototype deletion rules in `research.md`. |

---

## 4. Project Structure

### 4.1. Documentation (This Feature)

```text
specs/003-commerce-operations-capability-packs/
├── spec.md                      # Clarified feature specification (Q1–Q5 locked)
├── plan.md                      # This implementation plan (/speckit.plan)
├── research.md                  # Phase 0 architectural decisions & Spike Governance
├── data-model.md                # Phase 1 Prisma domain models & 4-stage DDL specs
├── quickstart.md                # Phase 1 Tracer Bullet & Single-VPS DR runbook
├── contracts/
│   └── api-contracts.md         # Phase 1 HTTP, RBAC, CapacityPort, ReadModel & AI contracts
├── checklists/
│   └── requirements.md          # Requirements quality checklist (5/5 Clarify locked)
├── tasks.md                     # Phase 2 dependency-ordered task breakdown (/speckit.tasks)
└── reviews/
    └── analyze.md               # Cross-artifact consistency analysis (/speckit.analyze)
```

### 4.2. Source Code Layout (Repository Root — Modular Monolith)

```text
undreseller/
├── prisma/
│   ├── schema.prisma                                                   # Expanded 003 domain models + 001/002 compatibility
│   └── migrations/
│       ├── 20261022000000_003_kernel_expand/migration.sql              # Stage 1: Additive tables & nullable columns (+ down.sql)
│       ├── 20261022010000_003_kernel_backfill/migration.sql            # Stage 2: Backfill checkpoint metadata (+ down.sql)
│       ├── 20261022020000_003_kernel_validate_cutover/migration.sql    # Stage 3: NOT VALID CHECK + VALIDATE + cutover (+ down.sql)
│       └── 20261022030000_003_kernel_contract/migration.sql            # Stage 4: Contract cleanup (+ down.sql)
├── config/
│   ├── shop.config.ts                                                  # Brand & store configuration
│   ├── client-manifest.schema.ts                                       # Zod schema for Client Customization Manifest & CapabilityPacks
│   └── oss-reuse-registry.json                                         # Path-level permissive OSS attribution manifest
├── lib/
│   ├── security/
│   │   ├── staffSession.ts                                             # Individual StaffMember scrypt auth + StaffSession cookie/DB lookup
│   │   ├── staffRbac.ts                                                # Fixed 3-role policy guard (OWNER > OPERATOR > PERFORMER)
│   │   └── adminAuth.ts                                                # Session auth + audited break-glass ADMIN_TOKEN fallback
│   ├── kernel/
│   │   ├── capabilityRegistry.ts                                       # Compiled CapabilityModule registry & route/job/policy wiring
│   │   ├── currency.ts                                                 # CurrencyMetadata minor-unit resolver (zero hardcoded /100)
│   │   ├── partyService.ts                                             # Unified Party, PartyIdentifier, ContactPoint & ChannelIdentity resolution
│   │   ├── offeringService.ts                                          # Unified Offering, OfferingVariant & ServicePolicy service (+ Item dual-write)
│   │   ├── capacityPort.ts                                             # Unified CapacityPort (InventoryMovement ledger + GiST SlotReservation)
│   │   ├── paymentPlanService.ts                                       # PaymentPlan, PaymentMilestone & PaymentAllocation service
│   │   ├── fulfillmentPlanService.ts                                   # Mixed FulfillmentPlan, FulfillmentSegment & CompletionEvidence service
│   │   ├── operatorActionService.ts                                    # Exception-driven OperatorAction queue & safe resolution commands
│   │   └── readModels.ts                                               # PII-redacted OrderSummaryView, OperatorActionView, PartyTimelineView, CashCommitmentView
│   ├── packs/
│   │   ├── quotes/                                                     # Phase C: Quote, QuoteLine, MarginGuard & quote-to-order conversion
│   │   ├── documents/                                                  # Phase D-Ext: ChangeRequest, CommercialDocument & CREDIT_NOTE reversals
│   │   ├── operations/                                                 # Phase E: Conversation-to-draft, ContinuationLink, ServiceCase, DataQuality, ImportBatch
│   │   ├── compliance/                                                 # Phase F: JurisdictionProfile & 5 narrow compliance SPI ports
│   │   └── agentRead/                                                  # Phase G: Disposable/read-only MCP projection adapter (zero mutation tools)
│   └── ai/
│       ├── gateway.ts                                                  # Phase H: LanguageModelGateway port (OpenAI-compatible wire contract)
│       ├── routingPolicy.ts                                            # Phase H: AiDataClass routing (CONFIDENTIAL local-only fail-closed)
│       └── telemetry.ts                                                # Phase H: Redacted AiTelemetryRecord emitter (INV-010)
├── app/
│   └── api/
│       ├── admin/
│       │   ├── auth/login/route.ts                                     # Staff session login
│       │   ├── auth/logout/route.ts                                    # Staff session logout
│       │   ├── staff/route.ts                                          # OWNER-only staff provisioning & role assignment
│       │   ├── staff/[id]/revoke-sessions/route.ts                     # Immediate per-staff session revocation
│       │   ├── operator-actions/route.ts                               # OperatorActionView exception queue
│       │   ├── operator-actions/[id]/resolve/route.ts                  # Role-gated resolution command
│       │   ├── catalog/offerings/route.ts                              # Unified Offering management
│       │   ├── inventory/movements/route.ts                            # Auditable InventoryMovement append endpoint
│       │   ├── fulfillment/my-segments/route.ts                        # PERFORMER assigned FulfillmentSegment view
│       │   └── fulfillment/segments/[id]/evidence/route.ts             # PERFORMER/OPERATOR CompletionEvidence submission
├── scripts/
│   ├── backfill-003-kernel.ts                                          # Idempotent bounded batch backfill (001/002 -> 003.1)
│   ├── verify-single-vps-dr.sh                                         # Automated pg_dump + restore drill verifying RTO <= 60m & RPO <= 24h
│   ├── ai-benchmark.ts                                                 # Phase H: Golden dataset evaluation runner
│   └── ai-outage-drill.ts                                              # Phase H: Local LM Studio fail-closed outage drill
└── infrastructure/
    └── compose/
        └── ai-lab.compose.yml                                          # Phase H: Optional OmniRoute + LM Studio + VPN lab profile
```

**Structure Decision**: Retain the single Next.js 15 root layout (`app/`, `lib/`, `prisma/`, `scripts/`) so `003` builds directly on the working `001`/`002` codebase without introducing monorepo workspace overhead or breaking existing imports. New kernel services live in `lib/kernel/`, subsequent optional packs live in `lib/packs/`, and the optional AI Lab lives in `lib/ai/` + `infrastructure/compose/ai-lab.compose.yml`.

---

## 5. Threat Modeling & Security Boundaries (STRIDE — NIST SP 800-218 SSDF)

| Threat Category (STRIDE) | Target Component / Asset | Potential Attack Vector | Mitigation / Architecture Countermeasure |
| :--- | :--- | :--- | :--- |
| **S**poofing | `StaffSession`, `ADMIN_TOKEN`, `ContinuationLink`, `OmniRoute` AI Gateway | Shared token reuse, session hijacking, forged guest continuation links, unauthorized access to local LLM workstation | Individual `StaffMember` accounts (`scrypt` hash) + `HttpOnly; Secure; SameSite=Lax` cookie storing opaque token hashed (`sha256`) in `StaffSession` (`FR-325b`); HMAC-SHA256 signed `JourneyToken`/`MagicRescheduleLink`; `OmniRoute` + `LM Studio` bound to localhost/WireGuard VPN subnet. |
| **T**ampering | `OrderLine`, `InventoryBalance`, `CommercialDocument`, Admin/MCP endpoints | Altering accepted prices, manual stock overwrites, direct DB table edits from UI/MCP | `INV-001` immutable `OrderLine` snapshots; `INV-003` append-only `InventoryMovement` ledger; `INV-007` credit-note/refund-only corrections; `INV-008` total ban on direct table writes from UI/MCP; `scheduleVersion` CAS guards. |
| **R**epudiation | Staff mutations, margin overrides, blacklist unblocks, emergency `ADMIN_TOKEN` calls | Staff member denying an order change, refund, or emergency token invocation | Every command writes an append-only `AuditEvent` and updates `OperatorAction.auditHistory` with individual `actorId` (`StaffMember.id`), `actorRole`, and `reason`; break-glass `ADMIN_TOKEN` calls emit `BREAK_GLASS_ADMIN_TOKEN_USED` (`FR-325b`). |
| **I**nformation Disclosure | Customer PII (`ContactPoint`, `customerNotes`), cross-client data, cloud LLM prompts | Cross-tenant SQL leak, PII in logs/MCP, or leaking `CONFIDENTIAL` customer notes to cloud LLM APIs | Physical single-tenant dedicated-DB isolation (`FR-325c`, `INV-013`, zero `tenantId` sharing); `AiDataClass.CONFIDENTIAL` routed strictly to local `LM Studio` and fails closed on outage (`FR-333`); PII-redacted read models (`INV-010`) + recursive `logger.ts` denylist. |
| **D**enial of Service | Checkout/slot endpoints, `ImportBatch` uploads, slow local LLM inference | Combinatorial slot queries, huge CSV imports, or stalled LLM inference exhausting Node.js memory/connections | Basket cap ($\le 10$ items, $\le 480$ min); `ImportBatch` row cap; `LanguageModelGateway` hard `AbortSignal` timeouts (`4s` primary / `3s` fallback / `8s` total, `NFR-306`); AI Lab isolated outside the `500 MB` commerce-core container (`NFR-303`). |
| **E**levation of Privilege | `PERFORMER` role, terminated staff sessions, `JurisdictionProfile.configJson`, MCP tools | `PERFORMER` attempting refunds/config changes, ex-employee reusing session or Telegram Staff Bot button, arbitrary JS in config | Static 3-role guard (`OWNER > OPERATOR > PERFORMER`, `FR-325a`) on all HTTP routes and `authorizeStaffCallback`; immediate `StaffSession` + `telegramUserId` revocation (`FR-325b`); zero MCP mutation tools; Zod-only `configJson` validation. |

---

## 6. Database Migration Strategy (4-Stage Expand/Contract — Principle X)

- **Data Consistency Model**: Single-tenant PostgreSQL 16 ACID transactions for all domain command writes (`CapacityPort`, `Order` + `OrderLine`, `PaymentPlan` + `PaymentAllocation`, `FulfillmentPlan` + `FulfillmentSegment`, `OperatorAction`). Read models project directly from committed relational state.
- **Capacity & IOPS Bounds**: Bounded batch backfill (`LIMIT 500 FOR UPDATE SKIP LOCKED`) keeps write IOPS overhead `< 10%` and lock wait `< 50 ms`. Every DDL statement runs under `SET lock_timeout = '2s'` and `SET statement_timeout = '5s'` with up to 5 exponential-backoff retries via `scripts/migrate.ts`.
- **Stage 1 (Expand — `20261022000000_003_kernel_expand`)**: Add new `003` tables (`StaffMember`, `StaffSession`, `Party`, `Offering`, `OfferingVariant`, `InventoryBalance`, `InventoryMovement`, `OrderLine`, `PaymentPlan`, `PaymentMilestone`, `PaymentAllocation`, `FulfillmentPlan`, `FulfillmentSegment`, `CompletionEvidence`, `OperatorAction`, `AuditEvent`) and nullable `Order.partyId` / `SlotReservation.bufferBeforeMin` / `bufferAfterMin`. Enable application dual-write from `Item`/`Order`/`OrderItem`/`MessengerContact` to the new tables.
- **Stage 2 (Backfill — `20261022010000_003_kernel_backfill` + `scripts/backfill-003-kernel.ts`)**: Resumable idempotent batch script migrates existing `Item` $\to$ `Offering`/`OfferingVariant`/`InventoryBalance`, `MessengerContact` $\to$ `Party`/`ContactPoint`/`ChannelIdentity`, and `Order`/`OrderItem` $\to$ `OrderLine`/`PaymentPlan`/`FulfillmentPlan`. Zero `SET NOT NULL` inside backfill transactions.
- **Stage 3 (Validate & Cutover — `20261022020000_003_kernel_validate_cutover`)**: Add `CHECK ("partyId" IS NOT NULL) NOT VALID` on `Order`, execute `VALIDATE CONSTRAINT` in a separate transaction once unmigrated remainder is `0`, and cut over read models to the `003` tables while keeping dual-write active.
- **Stage 4 (Contract — `20261022030000_003_kernel_contract`)**: After production observation confirms zero read-switch errors, promote validated constraints and retire temporary dual-write shims while preserving historical order/item readability (`INV-011`).
- **Rollback Path**: Each migration directory includes an idempotent `down.sql` tested in CI against a restored v2.1 snapshot.

---

## 7. Observability, Single-VPS Recovery & Rollback Plan (`Q5 Option B`)

### 7.1. Observability & Telemetry
- **Metrics & SLIs**: Capacity check & read-model latency (`p95 < 50 ms`, `p99 < 120 ms`), write command latency (`p95 < 250 ms`, `p99 < 1,500 ms`), `OperatorAction` queue depth by severity, `InboxEvent` / `TelegramOutbox` lag, and `AiTelemetryRecord` latency/fallback counters.
- **Structured Logging**: JSON logs via `lib/telemetry/logger.ts` with recursive denylist stripping `customerPhone`, `customerEmail`, `customerNotes`, `passwordHash`, `tokenHash`, `ADMIN_TOKEN`, and raw AI prompts (`INV-010`).
- **Health Checks & Probes**: `GET /api/health` verifies PostgreSQL `SELECT 1` connectivity and integration profile readiness in `< 20 ms` with zero env/PII exposure.

### 7.2. Single-VPS Disaster Recovery & Rollback Strategy (`Q5 Option B`)
- **Mandatory Operational Baseline**:
  - **Availability**: **99.0% uptime** on a single-VPS deployment (`REPLICA_COUNT=1`);
  - **Recovery Time Objective (RTO)**: **$\le 60$ minutes** (container restart + automated `pg_dump` restore script `scripts/verify-single-vps-dr.sh`);
  - **Recovery Point Objective (RPO)**: **$\le 24$ hours** (scheduled daily `pg_dump` + Restic encrypted snapshot; zero dependency on Kubernetes or continuous WAL PITR);
  - **Concurrency & Memory Envelope**: **100 concurrent requests** with main application container **`app RSS <= 500 MB RAM`** (`NFR-303`, `NFR-304`).
- **DR GameDay Scenario**: Automated drill (`scripts/verify-single-vps-dr.sh` + `docker/bench-memory.sh`) takes a fresh `pg_dump` snapshot, restores it into a clean verification container, runs integrity assertions (`InventoryBalance == SUM(InventoryMovement)`, `PaymentPlan` allocations, `OperatorAction` counts), and verifies total recovery time `< 60 minutes` and peak RSS $\le 500\text{ MB}$.
- **Rollback Triggers & Procedure**: If error rate exceeds `1%`, `p95` read latency exceeds `100 ms`, or `migrate-safe.sh` hits `lock_timeout` 5 times, abort cutover, toggle read-switch flag back to legacy `002` tables, and execute the stage-specific `down.sql`.

---

## 8. Complexity Tracking

*Zero Constitution violations — no complexity waiver required.*
