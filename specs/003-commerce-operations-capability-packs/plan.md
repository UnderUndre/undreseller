# Implementation Plan: Booking-First Service Template (`003.1`)

> "Тяжесть — это надёжно. Даже если не выстрелит, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)  
> "These walls are funny. First you hate 'em, then you get used to 'em. Enough time passes, you get so you depend on them." — _Побег из Шоушенка_  
> "Scissors cuts paper, paper covers rock, rock crushes lizard... — Распределённый дедлок в микросервисах." — Шелдон Купер (_The Big Bang Theory_)

**Branch**: `specs/003-commerce-operations-capability-packs` | **Date**: 2026-10-22 | **Spec**: `specs/003-commerce-operations-capability-packs/spec.md`
**Input**: Booking-first scope revision of the Feature 003 specification
**Standard Compliance**: ISO/IEC/IEEE 29148:2018, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.4**

---

## 1. Summary

Feature `003.1` turns the existing service and booking application into a reusable template for independent professionals and small service businesses, within the Sprint B commercial envelope ($4,900 flat / 14 days, one primary booking process, at most one client-selected external API, single-VPS $\le 500\text{ MB RAM}$ application container). Sprint B implementation is blocked until the business plan's 10 paid Tripwire audits have been completed in the first 60 days and the evidence has been recorded.

In accordance with the 5 architectural decisions locked during `/speckit.clarify`:
1. **First Release Scope**: A public business page, public professional pages with portfolio items and service lists, appointment availability and booking, configurable branding/locale/timezone/currency, and production readiness. Product sales, inventory, mixed carts, online payment processing, messaging bots, and broad commerce migration are later packs.
2. **Fixed 3-Role Staff Model**: Keep `OWNER`, `OPERATOR`, and `PERFORMER`. A professional can manage their own page and portfolio. An owner who also provides a service may own a bookable resource.
3. **Individual Staff Accounts & Sessions**: Use invite-only staff identities through Better Auth, with database-backed sessions managed by the library and audit attribution in the application. Keep `ADMIN_TOKEN` only as audited emergency recovery. Messaging identities are not needed for staff access.
4. **Single-Business Deployment**: Each installation and database serves one client business. Shared-database multi-tenancy and branch management remain future work.
5. **Single-VPS Production Baseline**: Preserve the agreed uptime, backup/restore, concurrency, and memory limits. The operational acceptance checks focus on public pages and booking.

---

## 2. Technical Context

- **Language/Version**: TypeScript 5.8 / Node.js 22 LTS / Next.js 15 (App Router, root `app/` and `lib/` layout).
- **Primary Dependencies**: Existing application dependencies; Prisma ORM and Zod for persistence and input validation; Better Auth with its PostgreSQL/Prisma integration for staff identities and sessions. Before integrating it, select a supported release, pin the exact version in the package manifest and lockfile, and validate its license and advisories. A messaging or payment SDK is not required for the first release.
- **Storage**: PostgreSQL with the existing application's connection and migration setup. Use `btree_gist` only if required by the current overlap-safe booking implementation. One database per client installation.
- **Testing**: Jest 29 (unit, contract, concurrency, and migration tests) + Playwright E2E + `docker/bench-memory.sh` (RSS & DR restore drill).
- **Target Platform**: Single-VPS Linux host (Docker Compose + Traefik v3, Hetzner CPX42 baseline) for `commerce-core`; optional external GPU workstation over WireGuard/Tailscale VPN for `Phase H` (`LM Studio` + `OmniRoute`).
- **Project Type**: Single-business modular web application (`MODULAR_MONOLITH`, `REPLICA_COUNT=1`).
- **Performance Goals**: Public page and availability p95/p99, and booking create/cancel p95/p99, meet the NFR targets under the reproducible load profile in `spec.md`; booking writes also preserve the no-overlap guarantee.
- **Constraints**: Main application container **`app RSS <= 500 MB RAM`** under **100 concurrent booking requests** (`NFR-303`); **99.0% uptime**, **RTO $\le 60$ min**, **RPO $\le 24$ h** (`NFR-304`); additive, reviewed schema changes that preserve existing bookings (`NFR-305`).
- **Scale/Scope**: One business per deployment; first release centers on service listings, professional profiles, and appointment booking. Broader commerce stories are subsequent packs.
- **Security Surface & STRIDE Triggers**: Public profile publication, booking/customer contact data, staff authentication, fixed three-role permissions, and cancellation links require security review. Messaging bots, payment gateways, and AI integrations are out of the first release.
- **Database Migration Trigger**: Add only the profile/portfolio fields and tables, staff session/access data, resource scheduling data, and booking support missing from the current schema. Preserve existing bookings and customer history; no broad commerce conversion is required.
- **Supply Chain & Licensing**: Permissive licenses only (`MIT`, `BSD-3-Clause`, `Apache-2.0`) enforced via `config/oss-reuse-registry.json`; zero `AGPLv3`/`GPLv3`/`MSCL`/`ELv2` code reuse.
- **Research Spikes & Disposal**: Two timeboxed spikes documented in `research.md` (`Spike 1: Agent Read Pack MCP`, `Spike 2: LM Studio + OmniRoute Outage Drill`) with mandatory branch/prototype deletion protocols (Constitution Principle XI).

---

## 3. Architectural Topology Evaluation & Constitution Check

### 3.1. Topology Evaluation
- **Service Template**: Keep the current modular web application and PostgreSQL deployment. Public pages, service listings, staff operations, and booking share one application and database so availability checks and booking creation can be made safely in one transactional boundary.
- **Later integrations**: Any one optional external API selected for a client is reached through a narrow adapter. Payment systems, multiple messaging channels, and the optional AI Lab are not dependencies of booking availability.

### 3.2. Constitution Check (Pre-Design & Post-Design Gate)

| Principle | Gate Status | Verification in Feature 003 Plan |
| :--- | :--- | :--- |
| **I–III. Source of Truth & Protected Slots** | **PASS** | All specs and commands live in canonical paths (`specs/003-commerce-operations-capability-packs/`, `specs/main/`); zero hand-edits to generated targets. |
| **IV. SemVer Discipline (0.x Zone)** | **PASS** | Feature 003 is a backward-compatible minor feature evolution (`2.1.0` $\to$ `2.2.0` / `0.x` minor bump via `/bump` only at release). |
| **VI. Cross-AI Review Gate** | **PENDING** | Scope changed on 2026-10-22; regenerate `analyze.md` and obtain the required external reviews before implementation. Existing review files cover the previous broad scope. |
| **VII-B. Business Plan Alignment** | **ALIGNED; RECHECK REQUIRED** | Updated against `undreseller-business-plan.md` v18.4: public professional pages and service booking, three roles, one booking process, and at most one client-selected external API. |
| **VIII. Living Spec (`specs/main/`)** | **PASS** | `specs/main/README.md`, `architecture.md`, and `requirements.md` updated to v2.1.0 with Feature 003 target architecture reference. |
| **IX. Two-Phase Review Flow** | **PASS** | Planning artifacts isolated in `specs/003-commerce-operations-capability-packs/`. |
| **X. Safe Schema Change** | **PENDING** | `003.1` uses small additive migrations and preserves existing booking/customer data. The broader commerce migration requires its own plan and review. |
| **XI. Spike Governance & Disposal** | **PASS** | Both `Phase G` (MCP Read Pack) and `Phase H` (AI Lab) spikes have $\le 2$-day timeboxes, p95/memory metrics, and mandatory prototype deletion rules in `research.md`. |

---

## 4. Project Structure

### 4.1. Documentation (This Feature)

```text
specs/003-commerce-operations-capability-packs/
├── spec.md                      # Booking-first product scope and requirements
├── plan.md                      # Booking-first implementation plan
├── research.md                  # Scope and architecture decisions
├── data_model.md                # Profile, service, booking, and future pack models
├── quickstart.md                # Booking acceptance and client handoff runbook
├── contracts.md                 # Public page, booking, staff role, and future pack contracts
├── checklist.md                 # Scope review and cross-AI gates
├── tasks.md                     # Booking-first delivery tasks and later-pack backlog
└── reviews/
    └── analyze.md               # Cross-artifact consistency analysis (/speckit.analyze)
```

### 4.2. Source Code Layout (Repository Root — Modular Monolith)

```text
undreseller/
├── prisma/
│   ├── schema.prisma                                                   # Additive profile, portfolio, schedule, and staff-access models
│   └── migrations/
│       └── 20261022000000_003_booking_template/migration.sql           # Small, additive, reversible booking-template changes
├── config/
│   ├── shop.config.ts                                                  # Business branding, locale, timezone, and currency settings
│   └── oss-reuse-registry.json                                         # Path-level permissive OSS attribution manifest
├── lib/
│   ├── security/
│   │   ├── staffAuth.ts                                                # Better Auth identity linking and application role mapping
│   │   ├── staffRbac.ts                                                # Fixed 3-role policy guard (OWNER > OPERATOR > PERFORMER)
│   │   └── adminAuth.ts                                                # Session auth + audited break-glass ADMIN_TOKEN fallback
│   ├── kernel/
│   │   ├── professionalProfileService.ts                               # Professional pages, portfolio items, publication, and service associations
│   │   ├── serviceService.ts                                           # Service listings and business configuration
│   │   └── bookingService.ts                                           # Availability, overlap-safe booking, and cancellation
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
│       │   ├── profiles/route.ts                                       # Role-scoped professional profile management
│       │   ├── services/route.ts                                       # Service listing management
│       │   └── bookings/route.ts                                       # Staff booking view and booking updates
│       ├── public/business/route.ts                                    # Public business page data
│       ├── public/professionals/[slug]/route.ts                         # Published profile, portfolio, and services
│       └── booking/route.ts                                            # Customer booking create/cancel endpoints
├── scripts/
│   ├── verify-single-vps-dr.sh                                         # Automated pg_dump + restore drill verifying RTO <= 60m & RPO <= 24h
│   ├── ai-benchmark.ts                                                 # Phase H: Golden dataset evaluation runner
│   └── ai-outage-drill.ts                                              # Phase H: Local LM Studio fail-closed outage drill
└── infrastructure/
    └── compose/
        └── ai-lab.compose.yml                                          # Phase H: Optional OmniRoute + LM Studio + VPN lab profile
```

**Structure Decision**: Retain the existing Next.js application layout and imports. Add only the profile, portfolio, service, booking, and access-control parts missing from the current code. Keep commerce, messaging, and AI integrations out of the first-release dependency path.

---

## 5. Threat Modeling & Security Boundaries (STRIDE — NIST SP 800-218 SSDF)

This table covers the full Feature 003 roadmap. `003.1` focuses on public profile publication, customer contact data, appointment concurrency, staff sessions, and three-role access; payment, messaging, AI, and import threats apply only when those later packs are enabled.

| Threat Category (STRIDE) | Target Component / Asset | Potential Attack Vector | Mitigation / Architecture Countermeasure |
| :--- | :--- | :--- | :--- |
| **S**poofing | Better Auth sessions, public booking cancellation credentials, `ADMIN_TOKEN`, `ContinuationLink`, OmniRoute AI Gateway | Staff session theft, forged cancellation links, forged guest continuation links, or unauthorized access to the local LLM workstation | Better Auth manages database-backed staff sessions and secure cookies; the application maps identities to active `StaffMember` records and enforces fixed roles (`FR-325b`). Booking cancellation uses an unguessable booking-scoped token whose hash alone is stored and which expires and is consumed/revoked (`INV-014`). `JourneyToken` remains a separate later-pack credential; `OmniRoute` and `LM Studio` bind only to localhost/private VPN. |
| **T**ampering | `OrderLine`, `InventoryBalance`, `CommercialDocument`, Admin/MCP endpoints | Altering accepted prices, manual stock overwrites, direct DB table edits from UI/MCP | `INV-001` immutable `OrderLine` snapshots; `INV-003` append-only `InventoryMovement` ledger; `INV-007` credit-note/refund-only corrections; `INV-008` total ban on direct table writes from UI/MCP; `scheduleVersion` CAS guards. |
| **R**epudiation | Staff mutations, margin overrides, blacklist unblocks, emergency `ADMIN_TOKEN` calls | Staff member denying an order change, refund, or emergency token invocation | Every command writes an append-only `AuditEvent` and updates `OperatorAction.auditHistory` with individual `actorId` (`StaffMember.id`), `actorRole`, and `reason`; break-glass `ADMIN_TOKEN` calls emit `BREAK_GLASS_ADMIN_TOKEN_USED` (`FR-325b`). |
| **I**nformation Disclosure | Customer PII (`ContactPoint`, `customerNotes`), cross-client data, cloud LLM prompts | Cross-tenant SQL leak, PII in logs/MCP, or leaking `CONFIDENTIAL` customer notes to cloud LLM APIs | Physical single-tenant dedicated-DB isolation (`FR-325c`, `INV-013`, zero `tenantId` sharing); `AiDataClass.CONFIDENTIAL` routed strictly to local `LM Studio` and fails closed on outage (`FR-333`); PII-redacted read models (`INV-010`) + recursive `logger.ts` denylist. |
| **D**enial of Service | Checkout/slot endpoints, `ImportBatch` uploads, slow local LLM inference | Combinatorial slot queries, huge CSV imports, or stalled LLM inference exhausting Node.js memory/connections | Basket cap ($\le 10$ items, $\le 480$ min); `ImportBatch` row cap; `LanguageModelGateway` hard `AbortSignal` timeouts (`4s` primary / `3s` fallback / `8s` total, `NFR-306`); AI Lab isolated outside the `500 MB` commerce-core container (`NFR-303`). |
| **E**levation of Privilege | `PERFORMER` role, terminated staff sessions, future jurisdiction config and MCP tools | `PERFORMER` attempting to edit another professional's page or view another person's bookings; former staff reusing a session; arbitrary future config content | Static 3-role guard (`OWNER > OPERATOR > PERFORMER`, `FR-325a`) on every staff route; revoke the identity's sessions through Better Auth and reject inactive `StaffMember` records (`FR-325b`); publication and profile ownership checks; later config is validated as data and later MCP surfaces expose no mutation tools. |

---

## 6. Database Migration Strategy

- `003.1` adds only the missing profile, portfolio, staff-link, resource/schedule, and booking-cancellation-credential fields. Existing `Item`, `SlotReservation`, `Order`, customer details, and appointment history remain readable and are not renamed or bulk-converted.
- **Phase 1 — Expand**: Add new tables and nullable fields only. Keep the current application version and the prior version compatible with the expanded schema. Build large indexes with non-blocking/concurrent DDL where PostgreSQL supports it; set bounded lock and statement timeouts.
- **Phase 2 — Dual-Write & Backfill**: Where a value moves from an existing representation to a new one, keep writes in both representations while reads still use the old representation. Backfill only deterministic existing service-to-resource links with an idempotent, rate-limited job, then compare counts and values. For new profile, session-link, resource, and cancellation-credential data with no prior representation, record that dual-write/backfill is not applicable; do not invent legacy values.
- **Phase 3 — Cutover**: Switch reads for migrated values only after the backfill comparison is clean and telemetry shows no regression. For new independent tables, enable their new read paths behind the release configuration and keep the old service/booking read path available until acceptance completes.
- **Phase 4 — Contract**: `003.1` drops no legacy columns or tables. Any later removal of an old representation requires a separate reviewed migration after the compatibility window, with its own backup, data reconciliation, and rollback procedure.
- **Migration rollback**: Before cutover, roll application code back to the prior version and leave additive schema/data in place. After cutover, return reads to the prior compatible path while preserving all new and historical records. A down migration may drop an added table only after verifying it is unused and empty; otherwise retain it. If application rollback cannot restore service, restore the pre-migration backup to an isolated database, verify record counts and sample bookings, then reconcile new bookings before reconnecting traffic.
- `T011` performs any applicable dual-write/backfill and reconciliation. `T012` tests the migration-specific rollback and old-version compatibility against a restored database; a backup restore check alone is not sufficient.
- A broad commerce-kernel migration may be proposed with later product and payment packs after its data mappings and rollback plan are reviewed independently.

---

## 7. Observability, Single-VPS Recovery & Rollback Plan

### 7.1. Observability & Telemetry
- **Metrics & SLIs**: Public page and availability response time, booking write errors, overlapping-booking rejection, staff-session errors, and application memory.
- **Structured Logging**: JSON logs via `lib/telemetry/logger.ts` with recursive denylist stripping customer PII, Better Auth credentials/session values, cancellation-link tokens, `ADMIN_TOKEN`, and raw AI prompts (`INV-010`, `INV-014`).
- **Distributed Traces**: OpenTelemetry spans cover public page reads, availability queries, booking create/cancel commands, Better Auth session checks, and database calls. Exported attributes contain operation names and result classes only, never raw contact details, credentials, tokens, or query-string values.
- **Health Checks & Probes**: `GET /api/health` verifies PostgreSQL `SELECT 1` connectivity and integration profile readiness in `< 20 ms` with zero env/PII exposure.

### 7.2. Single-VPS Disaster Recovery & Rollback Strategy (`Q5 Option B`)
- **Mandatory Operational Baseline**:
  - **Availability**: **99.0% uptime** on a single-VPS deployment (`REPLICA_COUNT=1`);
  - **Recovery Time Objective (RTO)**: **$\le 60$ minutes** (container restart + automated `pg_dump` restore script `scripts/verify-single-vps-dr.sh`);
  - **Recovery Point Objective (RPO)**: **$\le 24$ hours** (scheduled daily `pg_dump` + Restic encrypted snapshot; zero dependency on Kubernetes or continuous WAL PITR);
- **Concurrency & Memory Envelope**: **100 concurrent booking requests** with main application container **`app RSS <= 500 MB RAM`** (`NFR-303`, `NFR-304`).
- **DR GameDay Scenario**: Restore a backup no older than 24 hours into a clean verification database; confirm business settings, staff, professional pages, services, customers, and appointments are readable; record backup age (RPO), elapsed restore time (RTO), and peak RSS. Acceptance requires RPO `<= 24 hours` and RTO `<= 60 minutes`.
- **Rollback Triggers & Procedure**: If booking errors, response time, or data integrity exceed the agreed acceptance limits, stop deployment, restore the last known-good application/database state through the documented backup procedure, and preserve the booking records for reconciliation. Do not remove or rewrite customer history as part of rollback.

---

## 8. Complexity Tracking

*Zero Constitution violations — no complexity waiver required.*
