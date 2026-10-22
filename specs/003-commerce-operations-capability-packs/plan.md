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
1. **First Release Scope**: A public business page, public professional pages with portfolio items and service lists, appointment availability and booking with `IN_CALL`/`OUT_CALL` choices, mode-specific service prices and a fixed travel fee, manual staff confirmation of outcall coverage, configurable branding/locale/timezone/currency, and production readiness. This remains one appointment-booking process; product sales, inventory, mixed carts, online payment processing, messaging bots, and broad commerce migration are later packs.
2. **Fixed 3-Role Staff Model**: Keep `OWNER`, `OPERATOR`, and `PERFORMER`. A professional can manage their own page and portfolio. An owner who also provides a service may own a bookable resource.
3. **Individual Staff Accounts & Sessions**: Use invite-only staff identities through Better Auth (`app/api/auth/[...all]/route.ts`, `lib/security/staffAuth.ts`), with database-backed sessions managed by the library, an idempotent initial `OWNER` bootstrap (`scripts/bootstrap-owner.ts` or break-glass `ADMIN_TOKEN`), and `AuditEvent` attribution in the application. Keep `ADMIN_TOKEN` only as audited emergency recovery. Messaging identities are not needed for staff access.
4. **Single-Business Deployment**: Each installation and database serves one client business. Shared-database multi-tenancy and branch management remain future work.
5. **Single-VPS Production Baseline**: Preserve the agreed uptime, backup/restore, concurrency, and memory limits. The operational acceptance checks focus on public pages and booking.

---

## 2. Technical Context

- **Language/Version**: TypeScript 5.8 / Node.js 22 LTS / Next.js 15 (App Router, root `app/` and `lib/` layout).
- **Primary Dependencies**: Existing application dependencies; Prisma ORM and Zod for persistence and input validation; Better Auth with its PostgreSQL/Prisma integration for staff identities and sessions. Before integrating it, select a supported release, pin the exact version in the package manifest and lockfile, and validate its license and advisories. A messaging or payment SDK is not required for the first release.
- **Storage**: PostgreSQL 16 with `btree_gist` for the overlap-safe `slot_resource_no_overlap` exclusion constraint across buffered appointment windows. One database per client installation.
- **Testing**: Jest 29 (unit, contract, concurrency, and migration tests) + Playwright E2E + `docker/bench-memory.sh` & `scripts/verify-single-vps-dr.sh` (RSS & DR restore drill).
- **Target Platform**: Single-VPS Linux host (Docker Compose + Traefik v3, Hetzner CPX42 baseline) for `commerce-core`; optional external GPU workstation over WireGuard/Tailscale VPN for `Phase H` (`LM Studio` + `OmniRoute`).
- **Project Type**: Single-business modular web application (`MODULAR_MONOLITH`, `REPLICA_COUNT=1`).
- **Performance Goals**: Public page and availability p95/p99, and booking create/cancel p95/p99, meet the NFR targets under the reproducible load profile in `spec.md`; booking writes also preserve the no-overlap guarantee across service and outcall travel buffers.
- **Constraints**: Main application container **`app RSS <= 500 MB RAM`** under **100 concurrent booking requests** (`NFR-303`); **99.0% uptime**, **RTO $\le 60$ min**, **RPO $\le 24$ h** (`NFR-304`); additive, reviewed schema changes that preserve existing bookings (`NFR-305`).
- **Scale/Scope**: One business per deployment; first release centers on service listings, professional profiles, and appointment booking. Broader commerce stories are subsequent packs.
- **Security Surface & STRIDE Triggers**: Public profile publication, booking/customer contact and outcall-address data, business-address visibility, staff authentication and initial `OWNER` bootstrap, fixed three-role permissions, and GET-safe/POST-consumed cancellation links require security review. Messaging bots, payment gateways, and AI integrations are out of the first release.
- **Database Migration Trigger**: Add only the Better Auth tables, `StaffMember`, `AuditEvent`, `CurrencyMetadata`, `Resource`, `AvailabilityException`, `ProfessionalProfile`, `ProfessionalService`, `PortfolioItem`, and additive `ShopSettings`, `Item`, and `SlotReservation` fields missing from the current schema. Preserve existing `Item`, `SlotReservation`, `Order`, `OrderItem`, and customer history; no broad commerce conversion is required.
- **Supply Chain & Licensing**: Permissive licenses only (`MIT`, `BSD-3-Clause`, `Apache-2.0`) enforced via `config/oss-reuse-registry.json`; zero `AGPLv3`/`GPLv3`/`MSCL`/`ELv2` code reuse.
- **Research Spikes & Disposal**: Two timeboxed spikes documented in `research.md` (`Spike 1: Agent Read Pack MCP`, `Spike 2: LM Studio + OmniRoute Outage Drill`) with mandatory branch/prototype deletion protocols (Constitution Principle XI).

---

## 3. Architectural Topology Evaluation & Constitution Check

### 3.1. Topology Evaluation
- **Service Template**: Keep the current modular web application and PostgreSQL deployment. Public pages, service listings, staff operations, and both appointment location modes share one application and database so mode-specific availability checks, travel buffers, price snapshots, manual outcall coverage decisions, and booking creation can be handled in one transactional boundary.
- **Later integrations**: Any one optional external API selected for a client is reached through a narrow adapter. Payment systems, multiple messaging channels, and the optional AI Lab are not dependencies of booking availability.

### 3.2. Constitution Check (Pre-Design & Post-Design Gate)

| Principle | Gate Status | Verification in Feature 003 Plan |
| :--- | :--- | :--- |
| **I–III. Source of Truth & Protected Slots** | **PASS** | All specs and commands live in canonical paths (`specs/003-commerce-operations-capability-packs/`, `specs/main/`); zero hand-edits to generated targets. |
| **IV. SemVer Discipline (0.x Zone)** | **PASS** | Feature 003 is a backward-compatible minor feature evolution (`2.1.0` $\to$ `2.2.0` / `0.x` minor bump via `/bump` only at release). |
| **VI. Cross-AI Review Gate** | **PENDING** | `reviews/analyze.md` and `reviews/gemini.md` are PASS for the revised `003.1` scope; one additional external AI review PASS is required before `/speckit.implement`. |
| **VII-B. Business Plan Alignment** | **PASS** | Aligned against `undreseller-business-plan.md` v18.4: public professional pages and service booking, three roles, one booking process, at most one client-selected external API, and the 10-paid-Tripwire demand gate before Sprint B starts. |
| **VIII. Living Spec (`specs/main/`)** | **PASS** | `specs/main/README.md`, `architecture.md`, and `requirements.md` updated to v2.1.0 with Business Plan v18.4 and Feature `003.1` target architecture alignment. |
| **IX. Two-Phase Review Flow** | **PASS** | Planning artifacts isolated in `specs/003-commerce-operations-capability-packs/`. |
| **X. Safe Schema Change** | **PASS** | `003.1` uses two small additive migrations (`20261022000000_003_booking_template` and `20261022010000_003_service_locations`), preserves existing `Item`/`SlotReservation`/`Order` data, and verifies compatibility and rollback in `T011`–`T012`. |
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
    ├── analyze.md               # Cross-artifact consistency analysis (/speckit.analyze)
    └── gemini.md                # Independent external AI review (/speckit.review)
```

### 4.2. Source Code Layout (Repository Root — Modular Monolith)

```text
undreseller/
├── prisma/
│   ├── schema.prisma                                                   # Additive profile, portfolio, schedule, audit, currency, and staff-access models
│   └── migrations/
│       ├── 20261022000000_003_booking_template/migration.sql           # Stage 1 Expand: Better Auth, StaffMember, AuditEvent, CurrencyMetadata, Resource, Profile, Portfolio
│       └── 20261022010000_003_service_locations/migration.sql          # Stage 1b Expand: ShopSettings/Item/SlotReservation location-mode, buffer, and price-snapshot fields
├── config/
│   ├── shop.config.ts                                                  # Business branding, locale, timezone, currency, and capability-pack config
│   ├── currency-registry.ts                                            # Maintained ISO 4217 + explicit non-ISO currency metadata loader
│   └── oss-reuse-registry.json                                         # Path-level permissive OSS attribution manifest
├── lib/
│   ├── security/
│   │   ├── staffAuth.ts                                                # Better Auth setup, identity linking, and session resolution
│   │   ├── staffRbac.ts                                                # Fixed 3-role policy guard (OWNER > OPERATOR > PERFORMER)
│   │   └── adminAuth.ts                                                # Session auth + audited break-glass ADMIN_TOKEN fallback
│   ├── kernel/
│   │   ├── professionalProfileService.ts                               # Professional pages, portfolio items, publication, and service associations
│   │   ├── serviceService.ts                                           # Service listings, location modes, mode prices, and business configuration
│   │   └── bookingService.ts                                           # Timezone-aware availability, buffered overlap-safe booking, and cancellation
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
│   ├── professionals/
│   │   └── [slug]/page.tsx                                             # Public professional profile, portfolio gallery, and booking entry page
│   └── api/
│       ├── auth/
│       │   └── [...all]/route.ts                                       # Better Auth App Router handler (sign-in, sign-out, session)
│       ├── admin/
│       │   ├── settings/route.ts                                       # PUT /api/admin/settings (OWNER-only business, currency & location config)
│       │   ├── staff/route.ts                                          # POST /api/admin/staff (OWNER-only staff provisioning & role assignment)
│       │   ├── staff/[id]/revoke-sessions/route.ts                     # POST /api/admin/staff/[id]/revoke-sessions (Immediate session revocation)
│       │   ├── profiles/route.ts                                       # GET/POST role-scoped professional profiles
│       │   ├── profiles/[id]/route.ts                                  # PATCH role-scoped professional profile & portfolio items
│       │   ├── services/route.ts                                       # GET/POST service listings
│       │   ├── services/[id]/route.ts                                  # PATCH service location modes, prices, and buffers
│       │   ├── bookings/route.ts                                       # GET role-filtered staff booking views
│       │   └── bookings/[id]/route.ts                                  # PATCH booking status, outcall coverage approval/rejection, reschedule
│       ├── public/
│       │   ├── business/route.ts                                       # GET public business page data
│       │   └── professionals/[slug]/route.ts                           # GET published profile, portfolio, and services
│       └── booking/
│           ├── slots/route.ts                                          # GET timezone- and mode-aware available appointment slots
│           ├── route.ts                                                # POST overlap-safe customer booking creation
│           └── [id]/cancel/route.ts                                    # POST token-verified customer/staff booking cancellation
├── scripts/
│   ├── bootstrap-owner.ts                                              # Idempotent initial OWNER & CurrencyMetadata bootstrap script
│   ├── backfill-booking-template.ts                                    # Idempotent Resource & CurrencyMetadata backfill + reconciliation (T011)
│   ├── verify-licenses.mjs                                             # Supply-chain CVE & zero-copyleft license gate (T003)
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
| **S**poofing | Better Auth sessions, initial `OWNER` bootstrap, public booking cancellation credentials, `ADMIN_TOKEN`, `ContinuationLink`, OmniRoute AI Gateway | Staff session theft, unauthorized initial owner signup, link-preview bot auto-cancellation, forged cancellation links, or unauthorized access to the local LLM workstation | Better Auth manages database-backed staff sessions and secure HTTP-only cookies (`lib/security/staffAuth.ts`); public signup is disabled and initial `OWNER` bootstrap requires CLI access or `ADMIN_TOKEN` (`FR-325b`). Booking cancellation uses a 32-byte random token stored only as SHA-256 hash (`INV-014`); `GET` on the cancellation URL is strictly read-only and only `POST /api/booking/[id]/cancel` consumes the token. `OmniRoute` and `LM Studio` bind only to localhost/private VPN. |
| **T**ampering | `OrderItem`/`OrderLine`, `SlotReservation` price/buffer snapshots, `InventoryBalance`, `CommercialDocument`, Admin/MCP endpoints | Client-supplied booking prices, overlapping appointments colliding with outcall travel buffers, manual stock overwrites, direct DB table edits from UI/MCP | Server-side price recomputation and immutable `SlotReservation`/`OrderItem` snapshots (`INV-015`, `INV-001`); `SlotReservation.startTime`/`endTime` span the full occupied window including service and outcall travel buffers under GiST `slot_resource_no_overlap` (`INV-004`); `INV-008` total ban on direct table writes from UI/MCP; `scheduleVersion` CAS guards. |
| **R**epudiation | Staff mutations, outcall coverage rejections, margin overrides, blacklist unblocks, emergency `ADMIN_TOKEN` calls | Staff member denying a booking cancellation, outcall rejection, or emergency token invocation | Every command writes an append-only `AuditEvent` with individual `actorId` (`StaffMember.id`), `actorRole`, and `reason`; break-glass `ADMIN_TOKEN` calls emit `BREAK_GLASS_ADMIN_TOKEN_USED` (`FR-325b`). |
| **I**nformation Disclosure | Customer PII and `OUT_CALL` addresses, non-public business addresses, cross-client data, cloud LLM prompts | Cross-tenant SQL leak, customer address in public output/logs/MCP, or private business address exposure | Physical single-tenant dedicated-DB isolation (`FR-325c`, `INV-013`, zero `tenantId` sharing); location addresses are limited to the booking customer and authorized staff; public business address is returned only when `businessServiceAddressPublic = true`; `AiDataClass.CONFIDENTIAL` routes local-only and fails closed (`FR-333`); PII-redacted read models (`INV-010`) + recursive `logger.ts` denylist. |
| **D**enial of Service | Checkout/slot endpoints, `OUT_CALL` hold exhaustion, `ImportBatch` uploads, slow local LLM inference | Combinatorial slot queries, rate-unbounded booking/cancellation floods, huge CSV imports, or stalled LLM inference exhausting Node.js memory/connections | Per-IP rate limiting on booking creation and cancellation (`lib/security/rateLimiter.ts`); basket cap ($\le 10$ items, $\le 480$ min); `ImportBatch` row cap; `LanguageModelGateway` hard `AbortSignal` timeouts (`4s` primary / `3s` fallback / `8s` total, `NFR-306`); AI Lab isolated outside the `500 MB` commerce-core container (`NFR-303`). |
| **E**levation of Privilege | `PERFORMER` role, terminated staff sessions, future jurisdiction config and MCP tools | `PERFORMER` attempting to edit another professional's page, approve `OUT_CALL` coverage, or view another person's bookings; former staff reusing a session | Static 3-role guard (`OWNER > OPERATOR > PERFORMER`, `FR-325a`) on every staff route; `OUT_CALL` coverage approval restricted to `OWNER`/`OPERATOR`; revoke the identity's sessions through Better Auth and reject inactive `StaffMember` records (`FR-325b`); publication and profile ownership checks; later MCP surfaces expose no mutation tools. |

---

## 6. Database Migration Strategy

- `003.1` adds only the missing Better Auth tables, `StaffMember`, `AuditEvent`, `CurrencyMetadata`, `Resource`, `AvailabilityException`, `ProfessionalProfile`, `ProfessionalService`, `PortfolioItem`, and additive `ShopSettings`, `Item`, and `SlotReservation` fields (`20261022000000_003_booking_template` and `20261022010000_003_service_locations`). Existing `Item`, `SlotReservation`, `Order`, `OrderItem`, customer details, and appointment history remain readable and are not renamed or bulk-converted.
- **Phase 1 — Expand**: Add new tables and nullable/defaulted fields only. Keep the current application version and the prior version compatible with the expanded schema. Build indexes with non-blocking/concurrent DDL where PostgreSQL supports it; set bounded `lock_timeout = '2s'` and `statement_timeout = '5s'`.
- **Phase 2 — Dual-Write & Backfill**: Ensure `Resource` rows exist for every distinct `WeeklyHours.resourceId` and `SlotReservation.resourceId` (`"default_master"`) and seed ISO 4217 `CurrencyMetadata` rows (`scripts/backfill-booking-template.ts` in `T011`). New location modes, outcall-pricing overrides, customer addresses, `appointmentStartTime`/`appointmentEndTime`, and booking-price snapshots have no reliable historical source; leave those nullable fields `null` on old reservations and require them only for new bookings (`INV-015`).
- **Phase 3 — Cutover**: Switch reads for migrated resource/currency metadata only after the backfill comparison is clean and telemetry shows no regression. For new independent tables, enable their new read paths behind the release configuration and keep the old service/booking read path available until acceptance completes.
- **Phase 4 — Contract**: `003.1` drops no legacy columns or tables. Any later removal of an old representation requires a separate reviewed migration after the compatibility window, with its own backup, data reconciliation, and rollback procedure.
- **Migration rollback**: Before cutover, roll application code back to the prior version and leave additive schema/data in place. After cutover, return reads to the prior compatible path while preserving all new and historical records. A down migration may drop an added table only after verifying it is unused and empty; otherwise retain it. If application rollback cannot restore service, restore the pre-migration backup to an isolated database, verify record counts and sample bookings, then reconcile new bookings before reconnecting traffic.
- `T011` performs the idempotent resource/currency backfill and reconciliation (`scripts/backfill-booking-template.ts`). `T012` tests the migration-specific rollback and old-version compatibility against a restored database (`tests/unit/db-gist-and-migration.test.ts`).
- A broad commerce-kernel migration may be proposed with later product and payment packs after its data mappings and rollback plan are reviewed independently.

---

## 7. Observability, Single-VPS Recovery & Rollback Plan

### 7.1. Observability & Telemetry
- **Metrics & SLIs**: Public page and availability response time, booking write errors, overlapping-booking rejection, staff-session errors, and application memory.
- **Structured Logging**: JSON logs via `lib/telemetry/logger.ts` with recursive denylist stripping customer PII, service addresses (`serviceAddress`, `serviceAddressSnapshot`, `businessServiceAddress` when private), Better Auth credentials/session values, temporary passwords, cancellation-link tokens, `ADMIN_TOKEN`, and raw AI prompts (`INV-010`, `INV-014`).
- **Distributed Traces**: OpenTelemetry spans cover public page reads, mode-specific availability queries, booking create/cancel commands, Better Auth session checks, and database calls. Exported attributes contain operation names and result classes only, never raw contact details, service addresses, credentials, tokens, or query-string values.
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
