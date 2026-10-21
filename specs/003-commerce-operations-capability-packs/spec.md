# Feature Specification: Small-Business Commerce Operations Kernel & Capability Packs

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom  
> "Обувать пизду в лапти." — Народная мудрость о художественном пиздеже вместо ТЗ  
> "Why don't you explain this to me like I'm five." — Майкл Скотт (_The Office_)  
> "Well, I didn't realize you had documentation." — Бабуленька (_Young Sheldon_)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Directory**: `specs/003-commerce-operations-capability-packs`  
**Legacy Alias**: `003-small-business-operations-kernel`  
**Created**: 2026-10-21  
**Status**: Clarified (Ready for `/speckit.plan`)  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering), ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**  
**Input**: Evolution of the modular storefront (`001` + `002`) into a jurisdiction-neutral, capability-packed small-business commerce operations kernel (`Party`, `Offering`, `Capacity`, `Quote`, `Order`, `PaymentPlan`, `FulfillmentPlan`, `CommercialDocument`, `OperatorAction`, `RedactedReadModels`, `ComplianceAdapters`) with an optional Portfolio AI Gateway & Local Inference Engineering Lab (`LM Studio` + `OmniRoute`).

---

## 1. Executive Summary & Architectural Direction

### 1.1. Executive Summary & Delivery Boundary (Option B Scope + Option A Single-Tenant Topology + Option B Single-VPS Baseline)

Feature `003-commerce-operations-capability-packs` evolves the existing product-and-service storefront (`001-modular-commerce-template` + `002-service-cart-and-staff-bot`) into a **jurisdiction-neutral small-business commerce operations kernel**. It does **not** become a general ERP, double-entry accounting system, standalone CRM platform, multi-vendor marketplace, multi-tenant SaaS control plane, or no-code database product.

To strictly honor the **Sprint B commercial envelope ($4,900 flat / 14 calendar days, $\le 500\text{ MB RAM}$)** without discarding the target modular architecture or the portfolio AI Engineering Lab, Feature 003 locks:
- **Production MVP Scope (`Q1 Option B`)**: Narrow Production MVP kernel in Release `003.1`, with advanced packs and the AI Engineering Lab in subsequent independent phases;
- **Fixed 3-Role Staff Model (`Q2 Option B`)**: `OWNER`, `OPERATOR`, `PERFORMER`;
- **Session-Based Staff Authentication (`Q3 Option B`)**: Individual `StaffMember` accounts and revocable server-side `StaffSession` records via a maintained auth library, with `ADMIN_TOKEN` restricted to audited emergency break-glass use;
- **Single-Tenant Dedicated-Database Topology (`Q4 Option A`)**: `1 client business = 1 deployment + 1 dedicated PostgreSQL database`;
- **Single-VPS Production Operational Baseline (`Q5 Option B`)**: `99.0% uptime`, `RTO <= 60 minutes`, `RPO <= 24 hours`, `100 concurrent requests`, and `app container RSS <= 500 MB` (with optional Engineering Lab, `LM Studio`, `OmniRoute`, monitoring backends, and VPN workstation excluded from the 500 MB app container ceiling and decoupled from commerce-core availability).

Feature 003 is partitioned into two explicit delivery tiers (**Q1 Option B**):

1. **Mandatory Production MVP Slice (Release 003.1 — Blocking for Sprint B Delivery)**:
   - **Single-Tenant Deployment Isolation (`FR-325c`)**: One client business per deployment and dedicated PostgreSQL database (no shared-table `tenantId` or multi-schema routing; branches, warehouses, and additional legal entities are not modeled as independent tenants in MVP);
   - **`Party`** unification (`PERSON | ORGANIZATION`, `PartyIdentifier`, `ContactPoint`, `ChannelIdentity`);
   - **`Offering`** unification (`PRODUCT | SERVICE | BUNDLE | DIGITAL | CUSTOM_QUOTE`, `OfferingVariant`, `CurrencyMetadata`);
   - **`CapacityPort`** (`InventoryBalance` + immutable `InventoryMovement` ledger for goods; `Reservation` + PostgreSQL GiST `slot_resource_no_overlap` + buffers/exceptions for services);
   - **Fixed 3-Role Staff Model (`StaffRole ∈ { OWNER, OPERATOR, PERFORMER }`) & Individual Session-Based Staff Auth (`StaffMember`, `StaffSession`)** via a maintained auth library with `OWNER`-only provisioning, individual session revocation, per-command `actorId` auditing, and `ADMIN_TOKEN` restricted to emergency break-glass use;
   - **`Order` & `OrderLine` immutable commercial snapshots**;
   - **`PaymentPlan`, `PaymentMilestone` & `PaymentAllocation`** (deposit, milestone, balance, pay-on-site, and provider-separated `RefundOperation`);
   - **`FulfillmentPlan` & `FulfillmentSegment`** (`INVENTORY`, `APPOINTMENT`, `DIGITAL`, `DELIVERY`, `MANUAL_MILESTONE`) with basic `CompletionEvidence`;
   - **`OperatorAction` exception-driven work queue** and core redacted read models (`OperatorActionView`, `OrderSummaryView`, `PartyTimelineView`, `AvailabilityView`);
   - **4-stage Expand $\to$ Backfill $\to$ Validate/Cutover $\to$ Contract migration** from the `001`/`002` schema (`Item`, `Order`, `OrderItem`, `SlotReservation`, `MessengerContact`).
2. **Subsequent Independent Capability Pack Phases & Non-Blocking Portfolio Workstream (Releases 003.2+ — Post-MVP / Phase 2 Modules)**:
   - **`Quote Pack` & `MarginGuard`** (`Quote`, `QuoteLine`, versioned quote-to-order conversion);
   - **`Documents & Jurisdiction Compliance Pack`** (`CommercialDocument`, `DocumentRender`, `JurisdictionProfile`, `TaxQuoteProvider`, `FiscalReceiptProvider`, `ElectronicInvoiceProvider`, `ProductComplianceProvider`, `TransportDocumentProvider`);
   - **Advanced `Relationship & Operations` Extensions** (AI conversation-to-draft, resumable guest `Journey` / `ContinuationLink`, `ChangeRequest` workflow, `ServiceCase` / `WarrantyCoverage`, `DataQualityIssue` scanner, quarantined `ImportBatch` pipeline, `ActionSuggestion`, and limited-connectivity draft mode);
   - **`Agent Read Pack`** (disposable read-only MCP spike per Constitution Principle XI);
   - **`Engineering AI Lab` Workstream (`P-AI-001`–`P-AI-008`)** (`LanguageModelGateway`, local `LM Studio` inference, `OmniRoute` sidecar gateway, `AiDataClass` routing, golden-dataset benchmark, local outage drill, and private VPN workstation topology).

The feature connects the complete commercial promise lifecycle required by micro-businesses, service studios, and product-plus-service merchants:

```text
interest / conversation
  → party & channel identity
  → structured draft / quote or cart
  → capacity check & reservation (stock / staff / resource)
  → customer acceptance & order snapshot
  → payment plan & allocation (deposit / milestone / balance / pay-on-site)
  → commercial document & optional compliance adapter reference
  → segmented fulfillment & completion evidence
  → post-sale warranty / service case & follow-up suggestion
```

The system supports physical goods, scheduled services, composite bundles, digital goods, and custom-quoted work through one unified commercial **`Offering`** abstraction while preserving separate capacity models:
- **Goods (`PRODUCT`)** consume inventory via immutable `InventoryMovement` records;
- **Services (`SERVICE`)** consume staff/resource time protected by PostgreSQL GiST exclusion constraints;
- **Digital goods (`DIGITAL`)** create post-payment `DigitalEntitlement` records;
- **Custom work (`CUSTOM_QUOTE`)** requires an approved, versioned `Quote` snapshot;
- **Bundles (`BUNDLE`)** compose the above capacity providers across segmented fulfillment plans.

The runtime architecture remains a **single modular monolith** (`MODULAR_MONOLITH`, `REPLICA_COUNT=1`, $\le 500\text{ MB RAM}$ for the production application container) backed by a dedicated PostgreSQL 16 transactional database per client deployment (`EXISTING_POSTGRES_DOMAIN`, `SINGLE_TENANT_DEDICATED_DB`). Capability packs are compiled into the application and enabled or disabled per client deployment via a Zod-validated customization manifest without bypassing domain invariants.

Transactional entities are **never** exposed as unrestricted CRUD collections. All state mutations pass through typed application commands within PostgreSQL transactions. Administrative UIs, operational queues, reports, and optional read-only AI/MCP surfaces consume bounded, PII-redacted read models.

### 1.2. Differentiating Value Proposition ("One Recoverable Customer Promise")

Existing open-source software fragments small-business operations across separate e-commerce stores, booking calendars, CRM boards, and invoicing tools—causing customer promises to drop between chat messages, price quotes, calendar availability, partial payments, and on-site execution.

Feature 003 is differentiated not by having more entity CRUD screens, but by maintaining **one recoverable customer promise** across:
1. **Exception-driven operator work queue (`OperatorAction`)** as the primary administrative home screen *(Production MVP)*;
2. **Mixed goods-and-services fulfillment plans (`FulfillmentPlan`, `FulfillmentSegment`)** within a single order *(Production MVP)*;
3. **Deposit, milestone, balance, and refund allocations (`PaymentPlan`, `PaymentAllocation`)** rather than a single binary `PAID`/`UNPAID` flag *(Production MVP)*;
4. **Completion evidence (`CompletionEvidence`)** attached to fulfillment segments (before/after photos, checklists, serial numbers, timestamps) *(Production MVP)*;
5. **Resumable guest journeys (`Journey`, `ContinuationLink`)** across web, Telegram, and WhatsApp without forcing customer password accounts *(Subsequent Pack Phase)*;
6. **Operator-approved conversion of conversations into structured drafts** (`Quote Draft`, `Cart Draft`, `Booking Draft`, `Payment Request`, `Order Amendment Proposal`) *(Subsequent Pack Phase)*;
7. **Immutable, auditable order change requests (`ChangeRequest`)** with price, capacity, and payment delta tracking *(Subsequent Pack Phase)*;
8. **Post-sale service cases (`ServiceCase`, `WarrantyCoverage`)** linked directly to the original commercial snapshot *(Subsequent Pack Phase)*;
9. **Operational data-quality diagnostics (`DataQualityIssue`)** and **quarantined, reversible staged data imports (`ImportBatch`, `ImportRow`)** *(Subsequent Pack Phase)*;
10. **Optional Engineering Lab Profile (`LM Studio` + `OmniRoute` AI Gateway)** demonstrating enterprise-grade local LLM deployment, privacy-aware routing, observability, golden-dataset benchmarking, and local outage drills over a private VPN contour *(Non-Blocking Portfolio Workstream)*.

### 1.3. Explicit Out-of-Scope & Excluded Capabilities

To prevent scope explosion into a multi-year ERP clone and preserve the Sprint B commercial boundary ($4,900 flat / 14 days, Track 2 frozen), Feature 003 **explicitly excludes**:
- Double-entry accounting and General Ledger (`general_ledger`);
- Built-in tax calculation rules for specific countries or jurisdictions;
- Payroll, HR, and employee compensation calculation (`payroll`);
- Procurement and purchase-order automation (`procurement`);
- Manufacturing, bill of materials, and MRP (`manufacturing`);
- Multi-warehouse routing and bin/aisle management (`warehouse_management_system`);
- Multi-vendor marketplace and split vendor payouts (`marketplace`);
- Loyalty points, gift cards, and recurring subscription billing engines;
- Complex carrier rate-shopping engines;
- **Customer** password accounts, public self-service registration, and customer profile portals (note: staff/operator authentication uses invite-only/`OWNER`-provisioned session-based `StaffMember` accounts via a maintained auth library);
- Custom/dynamic tenant-defined RBAC role/permission builders;
- **Public multi-tenant SaaS control plane, shared-database row-level `tenantId` multi-tenancy, and multi-schema tenancy (`multi_tenant_saas`)** — each deployment and PostgreSQL database serves exactly one client business (`Q4 Option A`);
- **Multi-branch, multi-warehouse, or multi-legal-entity tenant hierarchies in the MVP** (may be introduced later as an optional capability pack);
- **Multi-node Kubernetes / HA clustering and continuous WAL PITR** in the Production MVP (`Q5 Option B` locks a single-VPS baseline);
- Generic no-code runtime schema builders or arbitrary JS/SQL execution in config;
- Unrestricted AI agent or remote MCP write/mutation tools (`unrestricted_agent_writes`).

### 1.4. Forensic OSS Pattern Borrowing & Path-Level License Gate

Feature 003 borrows proven domain patterns and clean-room contracts from mature open-source projects without forking their runtimes or contaminating the MIT repository with copyleft/source-available licenses:

| Reference Project | License Profile | Patterns Borrowed (Clean-Room Design Reference) | Explicitly Rejected |
| :--- | :--- | :--- | :--- |
| **Medusa** | MIT (core) / Proprietary (Enterprise RBAC & SSO) | Bounded commerce module separation collapsed to `Offering`, `Price`, `Capacity`, `DraftOrder`, `Order`, `Payment`, `Fulfillment`, `Party`, `Message` | Forking Medusa runtime into Track 1; proprietary Enterprise Materials |
| **Spree Commerce** | BSD-3-Clause (core) / MIT (storefront) | Line items as immutable commercial snapshots; explicit adjustment model; independent `order`, `payment`, and `fulfillment` states; customer snapshot on order; typed API discipline | Marketplace, multi-region tax/shipping matrices, Ruby runtime |
| **Directus** | MSCL 1.0 (Source-Available, competing-use limit) | Field-level presentation permissions; role/policy separation; saved operator views; unified permission vocabulary across UI, API, and read-only MCP | Direct DB CRUD write-path; production schema editing; copying MSCL code |
| **Twenty CRM** | AGPLv3 (core) / MIT (selected sub-packages) | `Party` (`PERSON` vs `ORGANIZATION`), unified activity timeline, contact-to-organization associations, team notes and follow-up tasks | Copying AGPLv3 core code; complex custom object builder; email sync in v1 |
| **Invoice Ninja** | Elastic License 2.0 (no managed/hosted service) | `QUOTE → ACCEPTED → INVOICE` lifecycle, numbering series, partial payments, credit notes instead of destructive deletes, PDF render snapshots | Copying ELv2 source code or templates |
| **Dolibarr** | GPLv3+ | Capability pack toggles, gradual module enablement via configuration, single-entry data flow across quote → order → document → payment | Copying GPL code; ERP accounting, HR, and procurement breadth |
| **Apache OFBiz** | Apache-2.0 | Strict separation of commercial `Order`, fulfillment execution, and external accounting/compliance records | Java entity engine, manufacturing, general ledger |
| **Open-Source Schedulers** | Various | `ServiceOffering`, `Resource`, `StaffMember`, `WorkingSchedule`, `AvailabilityException`, `BufferBefore`/`BufferAfter`, cancellation/no-show policies | Visual-only calendar checks without PostgreSQL GiST exclusion constraints |

**Mandatory OSS Reuse Registry Gate**: Any external code or adapted snippet introduced during implementation MUST be recorded in a versioned attribution manifest with `source_project`, `source_path`, `source_commit`, `license`, `reuse_type` (`code | adapted_code | design_reference`), `notice_required`, and `modifications_documented`. Code reuse without an exact path, commit SHA, and permissive license (`MIT`, `BSD-3-Clause`, `Apache-2.0`) is strictly prohibited.

---

## Clarifications

### Session 2026-10-21

- Q1: What is the mandatory production scope of Feature 003 within the Sprint B ($4,900 / 14 days) boundary? → A: **Option B — Narrow Production MVP Kernel (`Party`, `Offering`, `CapacityPort`/`InventoryMovement`, `Order`/`OrderLine` snapshots, `PaymentPlan`/`PaymentAllocation`, `FulfillmentPlan`/`FulfillmentSegment`, `OperatorAction`, and 4-stage Expand/Contract migration from `001`/`002`); all remaining capability packs (`Quote Pack`, `Documents & Compliance Pack`, `ChangeRequest`, `ServiceCase`, `ImportBatch`, `Agent Read Pack`) and the `Engineering AI Lab` (`P-AI-001`–`P-AI-008`) are structured as subsequent independent implementation phases.**
- Q2: Which staff/operator role model is mandatory in the Production MVP? → A: **Option B — Three fixed roles (`OWNER`, `OPERATOR`, `PERFORMER`) enforced via static policy gates without a custom RBAC builder:**
  - `OWNER`: deployment & capability configuration, staff access management, GDPR purges, financial/margin overrides, and unrestricted refund/compliance resolution;
  - `OPERATOR`: orders, parties, catalog/schedules, `OperatorAction` work queue resolution, and standard policy-bounded refunds;
  - `PERFORMER`: only assigned `FulfillmentSegment` items, personal/resource `WorkingSchedule` view, and `CompletionEvidence` submission.
- Q3: How do staff members authenticate into administrative interfaces in the Production MVP? → A: **Option B — Individual staff accounts (`StaffMember`) and server-side sessions (`StaffSession`) via a maintained authentication library (`FR-325b`):**
  - No public self-registration; only `OWNER` creates or invites staff members;
  - Each staff member is assigned exactly one role (`OWNER`, `OPERATOR`, or `PERFORMER`);
  - Server-side sessions can be revoked individually (`StaffSession` revocation / `StaffMember.active = false`);
  - Every administrative command and Staff Bot action records an explicit individual `actorId` (`StaffMember.id`) and `actorRole`;
  - `ADMIN_TOKEN` remains strictly an emergency break-glass credential with dedicated high-severity audit logging (`BREAK_GLASS_ADMIN_TOKEN_USED`).
- Q4: Does a single deployment serve one client business or multiple tenants? → A: **Option A — One client business per deployment and dedicated PostgreSQL database (`FR-325c`, `INV-013`).** No `tenantId` in domain tables, no cross-client authorization, separate secrets/backups/restore/customization manifest per client, and no multi-tenant control plane in MVP. Possible multi-branch support is deferred to a future capability pack rather than modeled as tenants.
- Q5: What operational baseline is mandatory for the Production MVP? → A: **Option B — Single-VPS Production Baseline (`NFR-303`, `NFR-304`):**
  - **Availability**: `99.0% uptime` on a single-VPS deployment (`REPLICA_COUNT=1`, no Kubernetes or multi-node HA required);
  - **Recovery Objectives**: **RTO $\le 60$ minutes** (container restart + dump restore drill) and **RPO $\le 24$ hours** (automated `pg_dump` + Restic backup without continuous WAL PITR);
  - **Concurrency & Memory Ceiling**: **100 concurrent requests** with main application container **`app RSS <= 500 MB`**;
  - **Lab Decoupling**: Optional `Engineering AI Lab`, `LM Studio`, `OmniRoute`, monitoring backends, and VPN workstation are excluded from the `500 MB` application container budget and never impact `commerce-core` availability.

---

## 2. User Scenarios & Testing _(mandatory)_

### User Story 1 — Selling Physical Goods with Auditable Inventory Movements (Priority: P1 — Production MVP)

An individual entrepreneur or small merchant sells physical goods (`OfferingKind.PRODUCT`) with SKU variants from stock. When a customer orders a product and payment (or pay-on-site commitment) is accepted, inventory is reserved and committed exclusively through immutable `InventoryMovement` ledger entries (`RESERVE`, `COMMIT`, `RELEASE`, `ADJUSTMENT`, `RETURN`), and low-stock or out-of-stock conditions after payment automatically create an `OperatorAction` without rolling back accepted funds.

**Why this priority**: Core revenue path for merchants selling physical goods alongside or independently of services (`US1` in Production MVP kernel).

**Independent Test**: Create a `PRODUCT` offering with initial stock `+5` via `InventoryMovement`. Place an order for quantity `2`. Verify `InventoryBalance` reflects `available = 3, reserved = 2`, commit on fulfillment transitions `onHand = 3, reserved = 0`, and simulate a concurrent payment on zero stock to verify `PAID_REQUIRES_RESOLUTION` + `OperatorAction` creation.

**Acceptance Scenarios**:
1. **Given** an active `PRODUCT` offering variant with `onHand = 5, reserved = 0`, **When** a customer places an order for quantity `2`, **Then** an `InventoryMovement` of type `RESERVE` is recorded in the same transaction, `available` becomes `3`, and `OrderLine` stores an immutable snapshot of `offeringNameSnapshot`, `unitAmountMinor`, `currency`, and tax fields.
2. **Given** two customers simultaneously paying for the last unit (`available = 1`), **When** the second payment webhook arrives after stock reaches `0`, **Then** the payment is recorded in `PaymentEvent` (`INV-002`), the order transitions to `PAID_REQUIRES_RESOLUTION`, and a high-severity `OperatorAction` (`OUT_OF_STOCK_AFTER_PAYMENT`) is enqueued for operator resolution.

---

### User Story 2 — Single & Multi-Service Booking with Staff, Resource & Buffer Capacity (Priority: P1 — Production MVP)

A service professional or studio accepts single or multi-service bookings (`OfferingKind.SERVICE`). The system evaluates `WorkingSchedule`, `AvailabilityException`, service `BufferBefore`/`BufferAfter`, and resource capacity (`StaffMember`, `Resource`), locking contiguous windows in PostgreSQL via resource-scoped advisory locks and the `slot_resource_no_overlap` GiST exclusion constraint.

**Why this priority**: Preserves and generalizes the core service-booking revenue stream from `001`/`002` into the unified `Offering` + `Capacity` contract (`US2` & `US3` in Production MVP kernel).

**Independent Test**: Configure a `SERVICE` offering (60 min + 15 min `bufferAfter`) and a `SERVICE` add-on (30 min). Query available windows via `checkCapacity`, reserve a contiguous 105-minute interval via `reserveCapacity`, and verify that any overlapping request on the same `resourceId` is rejected with HTTP 409 (`23P01`).

**Acceptance Scenarios**:
1. **Given** a customer basket with two compatible services totaling 90 minutes plus a 15-minute post-service buffer, **When** `checkCapacity` evaluates candidate 30-minute grid points, **Then** only start times with 105 minutes of uninterrupted working availability (excluding breaks, exceptions, and `HELD`/`BOOKED` reservations) are returned.
2. **Given** an active `Reservation` on `resourceId = "master_1"` for `14:00–15:45`, **When** a concurrent transaction attempts to reserve `15:30–16:30` on `"master_1"`, **Then** the database GiST constraint rejects the overlap and the API returns HTTP 409 without corrupting state.

---

### User Story 3 — Mixed Goods-and-Services Order & Segmented Fulfillment Plan (Priority: P1 — Production MVP)

A customer purchases a composite solution in a single order—for example, an air conditioner (`PRODUCT`) + local delivery (`DELIVERY`) + on-site installation appointment (`SERVICE` / `APPOINTMENT`), or a training course (`DIGITAL`) + 1-on-1 consultation (`SERVICE`). Payment is tracked at the order level via `PaymentPlan`, while execution is decomposed into a `FulfillmentPlan` with independent `FulfillmentSegment` records (`INVENTORY`, `APPOINTMENT`, `DIGITAL`, `DELIVERY`, `MANUAL_MILESTONE`) and per-segment `CompletionEvidence`.

**Why this priority**: Bridges the gap between pure e-commerce and pure booking systems—part of the mandatory Production MVP kernel.

**Independent Test**: Create an order containing 1 `PRODUCT` item and 1 `SERVICE` item (or a `BUNDLE` offering). Verify that a single `Order` is created with an `OrderLine` snapshot for each item and a `FulfillmentPlan` containing two segments: an `INVENTORY`/`DELIVERY` segment and an `APPOINTMENT` segment, each progressing independently to completion with attached `CompletionEvidence`.

**Acceptance Scenarios**:
1. **Given** an order containing both a physical product and a scheduled installation service, **When** the order is accepted, **Then** the system atomically reserves product inventory and holds the installation time slot, creating a `FulfillmentPlan` with separate `INVENTORY` and `APPOINTMENT` segments.
2. **Given** the delivery segment is completed on Tuesday and the technician (`StaffRole.PERFORMER`) finishes installation on Wednesday, **When** the authenticated technician uploads before/after photos and a serial number as `CompletionEvidence` on their assigned `APPOINTMENT` segment, **Then** the `FulfillmentPlan` transitions to `COMPLETED`, `AuditEvent` records the technician's `actorId`, and the order transitions to `FULFILLED`.

---

### User Story 4 — Deposit, Milestone & Balance Payment Plans with Explicit Allocations (Priority: P1 — Production MVP)

Instead of a binary `PAID`/`UNPAID` state, a business configures a `PaymentPlan` on an order (e.g., 30% prepayment deposit to confirm booking + 70% balance upon completion, or 3 project milestones). Every incoming `PaymentEvent` is allocated to a specific `PaymentMilestone` via `PaymentAllocation` (`US5`).

**Why this priority**: Prevents reconciliation chaos on partial prepayments, on-site balance collection, and partial refunds—part of the mandatory Production MVP kernel.

**Independent Test**: Create an order for `100,000` minor units with a 30% deposit milestone (`30,000`) and 70% completion milestone (`70,000`). Capture `30,000` online; verify the deposit milestone is `PAID`, reservation transitions to `BOOKED`, and `CashCommitmentView` shows `30,000` collected and `70,000` due at fulfillment.

**Acceptance Scenarios**:
1. **Given** an order with a `PaymentPlan` requiring a `30%` deposit before reservation confirmation and `70%` upon service completion, **When** the customer pays the `30%` deposit via an enabled `PaymentProvider`, **Then** a `PaymentAllocation` links the payment to Milestone 1, Milestone 1 becomes `PAID`, the slot reservation becomes `BOOKED`, and the order payment status reflects `PARTIALLY_PAID` with the remaining balance scheduled for Milestone 2.
2. **Given** a partially paid order that is amended or partially refunded, **When** a `RefundOperation` is executed, **Then** the refund is explicitly allocated against the corresponding `PaymentAllocation` without mutating historical `PaymentEvent` records.

---

### User Story 5 — Exception-Driven Operator Work Queue, Session Auth & Role-Bounded Resolution (Priority: P1 — Production MVP)

When the business owner (`OWNER`) or operator (`OPERATOR`) signs into the administrative interface via their individual server-side session (or interacts via their linked Staff Bot identity), the primary view is not a list of raw database tables, but a prioritized, exception-driven work queue of `OperatorAction` items (`unconfirmed appointment tomorrow`, `payment received but slot overbooked`, `stock depleted after payment`, `refund SLA due`, `recycled phone manual review`), while field staff (`PERFORMER`) see only their assigned `FulfillmentSegment` tasks and `CompletionEvidence` actions.

**Why this priority**: Solves the #1 constraint of micro-business owners—limited operational attention—while enforcing individual `actorId` attribution, revocable server-side sessions, and least-privilege separation between `OWNER`, `OPERATOR`, and `PERFORMER`.

**Independent Test**: Authenticate as `OWNER`, invite an `OPERATOR` and a `PERFORMER`, verify each logs in with an individual server-side session (`StaffSession`). Trigger an overbooked late payment and verify `OPERATOR` resolves it with `actorId` recorded in `AuditEvent`. Verify `PERFORMER` receives HTTP 403 (`INSUFFICIENT_STAFF_ROLE`) on refund commands, and verify revoking the `OPERATOR` session immediately invalidates subsequent requests with HTTP 401.

**Acceptance Scenarios**:
1. **Given** any failed, ambiguous, overdue, or manually resolvable business transition, **When** the transition commits, **Then** the system creates or updates a durable `OperatorAction` with `reason`, `severity`, `affectedAggregate`, `recommendedNextAction`, `availableSafeActions`, `dueAt`, and audit trail.
2. **Given** an open `OperatorAction` in the work queue, **When** an authenticated `OPERATOR` or `OWNER` executes one of its `availableSafeActions`, **Then** the underlying application service command runs transactionally and marks the `OperatorAction` as `RESOLVED` with the individual `actorId` (`StaffMember.id`), `StaffRole`, and timestamp.
3. **Given** an active `StaffMember` whose employment ends or whose device is compromised, **When** an `OWNER` revokes their sessions or sets `active = false`, **Then** all active `StaffSession` records and linked Staff Bot callbacks for that `StaffMember` are immediately rejected without rotating credentials for other staff members.

---

### User Story 6 — Capacity-Aware Custom Quotes, Margin Guard & Quote-to-Order Conversion (Priority: P2 — Subsequent Phase Pack)

A business prepares an individualized commercial proposal (`Quote`) with versioned line snapshots (`QuoteLine`), validity expiration (`expiresAt`), quote mode (`INFORMATIONAL`, `PRICE_LOCKED`, `CAPACITY_HELD`, `DEPOSIT_BACKED`), and optional internal `MarginGuard` cost estimates. When the customer accepts the quote, the application re-validates price, capacity, and compliance prerequisites and converts the accepted quote version snapshot into an immutable `Order` (`US4`, `INV-005`).

**Why this priority**: High-value subsequent capability pack (`Phase C`) for B2B/B2C custom work and bespoke services negotiated before checkout.

**Independent Test**: Create `Quote` v1, revise it to v2 with a discount, trigger `MarginGuard` check when estimated contribution margin falls below threshold, approve as `OWNER`, and accept v2 as customer. Verify that the resulting `Order` matches `Quote` v2 snapshots verbatim and that v1 cannot be accepted.

**Acceptance Scenarios**:
1. **Given** a draft `Quote` where expected direct costs (`material + staff + delivery + fee estimates`) leave a contribution margin below the configured client policy floor, **When** an `OPERATOR` attempts to send the quote, **Then** `MarginGuard` blocks automatic dispatch and creates an approval gate until an `OWNER` approves the margin override.
2. **Given** an active `PRICE_LOCKED` quote (version 2) without a capacity hold, **When** the customer clicks accept, **Then** the application service re-verifies current inventory/slot capacity and tax/compliance quotes; if available, it atomically creates an `Order` from the version 2 snapshot and marks the quote `ACCEPTED`.

---

### User Story 7 — Unified Party Timeline, Conversation-to-Draft & Resumable Guest Journeys (Priority: P2 — Subsequent Phase Pack)

A customer interacts with the business across multiple channels (website, Telegram, WhatsApp). The system resolves their identifiers (`PartyIdentifier`, `ContactPoint`, `ChannelIdentity`) to a single `Party` (`PERSON` or `ORGANIZATION`) with a unified `PartyTimelineView` (`US6` in Production MVP). In the subsequent `Relationship Pack` extension (`Phase E`), an `OPERATOR` converts a chat message into a validated `Booking Draft` or `Quote Draft` and sends a single revocable `ContinuationLink` (`JourneyToken`), allowing the guest customer to resume in a browser or TMA without creating a password account.

**Why this priority**: Core `Party` + `PartyTimelineView` ships in Production MVP; conversation-to-draft and cross-channel `ContinuationLink` ship as a subsequent modular pack.

**Independent Test**: Resolve a customer's Telegram and phone identifiers to one `Party`, verify `PartyTimelineView` aggregates orders and messages, and (when conversation-to-draft is enabled) generate a `ContinuationLink` from a chat inquiry and complete checkout in a browser session.

**Acceptance Scenarios**:
1. **Given** a customer message requesting specific offerings and a preferred time window, **When** the conversation-to-draft service parses the intent, **Then** application services validate actual catalog prices and resource capacity and present a draft to the `OPERATOR` for approval (AI never sets prices or locks capacity autonomously).
2. **Given** an operator-approved draft, **When** the customer opens the short-lived `ContinuationLink` in another channel/browser, **Then** the guest journey resumes the exact draft state without exposing internal UUIDs or requiring password login.

---

### User Story 8 — Immutable Order Change Requests, Cancellations & Reversals (Priority: P2 — Subsequent Phase Pack)

When a customer or operator needs to modify an accepted order—reschedule an appointment, swap a service or product variant, change quantity, or cancel—the system creates a structured `ChangeRequest` comparing `OriginalSnapshot` and `ProposedSnapshot`, calculates `PriceDifference`, `CapacityDifference`, and `PaymentAdjustment`, releases only the capacity actually relinquished (`US7`), and records financial adjustments via explicit credit/refund records (`US8`, `INV-001`, `INV-007`).

**Why this priority**: Protects commercial and financial integrity during complex post-acceptance order amendments (`Phase D/E` pack).

**Independent Test**: Accept an order for Service A (`$100`, 60 min) + Product B (`$50`, qty 1). Submit a `ChangeRequest` to cancel Product B while keeping Service A. Verify that Product B's stock is released via a compensating `InventoryMovement`, Service A's slot reservation remains `BOOKED`, the original `OrderLine` history remains auditable, and a `RefundOperation` / `CREDIT_NOTE` reference for `$50` is created.

**Acceptance Scenarios**:
1. **Given** a mixed order with both reserved inventory and a booked service slot, **When** only the product line is cancelled via an approved `ChangeRequest`, **Then** only the product inventory is released via `InventoryMovement` while the service `Reservation` remains intact (`US7`).
2. **Given** an issued commercial document (`INVOICE` or `RECEIPT`) on an order that is subsequently refunded, **When** the refund is processed, **Then** the original document and `PaymentEvent` remain immutable and a compensating `CREDIT_NOTE` / `RefundOperation` record is linked (`US8`, `INV-007`).

---

### User Story 9 — Jurisdiction-Neutral Compliance Adapters & Client Customization Manifest (Priority: P2 — Subsequent Phase Pack)

A deployment engineer or `OWNER` configures the template for a specific client in any country using a Zod-validated customization manifest (`JurisdictionProfile`, `CurrencyMetadata`, `LocaleProfile`, `RetentionProfile`, `CapabilityPacks`). During checkout, payment capture, or fulfillment, the core invokes only the compliance ports enabled in the profile (`TaxQuoteProvider`, `FiscalReceiptProvider`, `ElectronicInvoiceProvider`, `ProductComplianceProvider`, `TransportDocumentProvider`). If a post-payment compliance call fails or times out, payment acceptance is preserved and an `OperatorAction` is created (`US9`, `INV-J01`–`INV-J08`).

**Why this priority**: Ensures the codebase is a reusable global template while isolating country-specific compliance adapters into `Phase F` packs.

**Independent Test**: Boot the application with two different client manifests: (1) a zero-compliance service studio in `USD` (`minorUnit = 2`), and (2) a retail/service merchant in `JPY` (`minorUnit = 0`) with a mocked `FiscalReceiptProvider`. Verify zero code changes are needed, amounts are stored in exact minor units, and a simulated fiscal provider outage after payment creates an `OperatorAction` without rolling back the `PAID` state.

**Acceptance Scenarios**:
1. **Given** a `JurisdictionProfile` with `taxQuoteProvider` enabled and `fiscalReceiptProvider` enabled, **When** a customer completes checkout and payment is captured, **Then** the pre-order tax quote is snapshotted on `OrderLine` (`taxAmountMinor`, `taxRateSnapshot`, `taxProviderReference`) and `fiscalReceiptProvider.registerSale()` is invoked asynchronously via the durable outbox.
2. **Given** `fiscalReceiptProvider.registerSale()` fails with a network or validation error after payment capture, **Then** the payment and order remain accepted (`INV-002`, `INV-J05`) and a durable `OperatorAction` (`COMPLIANCE_PROVIDER_FAILURE`) is created for operator retry or manual resolution.

---

### User Story 10 — Redacted Read Models, Order-Linked Post-Sale Cases & Safe Staged Imports (Priority: P3 — Subsequent Phase Pack)

Operators and optional read-only AI/MCP agents query bounded projections (`OrderSummaryView`, `PartyTimelineView`, `AvailabilityView`, `OperatorActionView`, `CatalogSearchView`, `CashCommitmentView`) that strip raw PII and never allow direct table writes (`US10`). In subsequent phases (`Phase E/G`), operators can open a warranty/post-sale `ServiceCase` linked to the original snapshot and `CompletionEvidence`, and `OWNER` actors can run a quarantined `ImportBatch` (`upload → parse → normalize → stage → detect duplicates → approve → commit`) with a `DataQualityIssue` health scan.

**Why this priority**: Core read models ship with Production MVP; `ServiceCase`, `ImportBatch`, `DataQualityIssue`, and read-only MCP spike ship in `Phase E/G`.

**Independent Test**: Stage a CSV import with 2 duplicate phone numbers and 1 service missing duration; verify `ImportBatch` flags the conflicts in quarantine without touching live `Party` or `Offering` tables until approved. Then query the read-only projection surface for `OrderSummaryView` and verify zero PII (`customerPhone`, `customerEmail`, `customerNotes`) is present.

**Acceptance Scenarios**:
1. **Given** the `Agent Read Pack` is enabled in configuration, **When** an AI agent or MCP client queries `OrderSummaryView` or `OperatorActionView`, **Then** it receives redacted operational summaries with zero raw PII and has zero registered mutation tools (`US10`, `INV-008`, `INV-010`).
2. **Given** a legacy CSV of contacts and catalog items uploaded via `ImportBatch`, **When** duplicate party identifiers or missing capacity policies are detected, **Then** the rows are held in staging with `ImportIssue` records and cannot corrupt production tables unless explicitly resolved and committed by an `OWNER`.

---

### User Story 11 — Portfolio Engineering Lab: Local LLM (`LM Studio`) + `OmniRoute` AI Gateway & Outage Drill (Priority: P3 — Non-Blocking Portfolio Workstream `Phase H`)

An engineer or evaluator runs the optional **Engineering Lab Profile** (`infrastructure/compose/ai-lab.compose.yml`) to demonstrate production-grade local AI infrastructure. The commerce application communicates exclusively through its internal `LanguageModelGateway` port (`generate`, `stream`, `health`) to an `OmniRoute` AI Gateway sidecar, which routes requests to a local `LM Studio` server (running quantized GGUF models over a private VPN/local interface) and allowlisted official cloud APIs according to named, versioned `AiDataClass` routing policies (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`).

**Why this priority**: Directly demonstrates end-to-end IT / AI Engineer capabilities as an independent portfolio workstream (`Phase H: P-AI-001`–`P-AI-008`) without blocking the Production MVP commerce delivery.

**Independent Test**: Start the app with `LanguageModelGateway` pointed at `OmniRoute` + `LM Studio`. Run the golden evaluation suite across local and cloud routes, then stop `LM Studio` to execute the recorded outage drill: verify that an `INTERNAL` cloud-eligible query falls back to the approved cloud provider while a `CONFIDENTIAL` local-only query fails closed (`AI_ROUTE_UNAVAILABLE_FAIL_CLOSED`) and records redacted application telemetry.

**Acceptance Scenarios**:
1. **Given** a request classified as `AiDataClass.CONFIDENTIAL` (e.g., conversation-to-draft extraction containing unredacted customer context), **When** the local `LM Studio` inference endpoint is offline, **Then** the routing policy refuses cloud fallback, fails closed immediately, creates an `OperatorAction` / fallback notice, and logs redacted metadata (`traceId`, `useCase`, `providerRoute`, `resultStatus = 'FAIL_CLOSED_LOCAL_UNAVAILABLE'`) with zero prompt/PII leakage.
2. **Given** the versioned golden dataset for knowledge QA and structured intent extraction, **When** the benchmark runner evaluates at least one local `LM Studio` model and one official cloud model via `OmniRoute`, **Then** it outputs a reproducible comparison report covering structured-output Zod validity, groundedness, prompt-injection refusal, latency (`p50`/`p95`, TTFT), tokens/sec, RAM/VRAM usage, and estimated cost.

---

### Edge Cases & Failure Modes

1. **Disabling a Capability Pack on a Live Store**:
   - *Scenario*: A merchant disables `quotes` or `services` in their manifest after historical quotes and service orders already exist.
   - *Resolution (`INV-011`)*: Capability disablement hides creation routes and UI entry points for new records, but read models (`OrderSummaryView`, `PartyTimelineView`) and historical order lookups remain 100% readable and auditable.
2. **Quote Accepted After Underlying Price or Capacity Changed**:
   - *Scenario*: A customer accepts an `INFORMATIONAL` quote 4 days later when the product is out of stock or the time slot was taken.
   - *Resolution*: Acceptance re-runs `checkCapacity` and `reserveCapacity` transactionally. If capacity is unavailable, the system does not create a broken order; it returns a structured capacity conflict and offers alternative slots or creates an `OperatorAction` for the operator to issue a revised quote version.
3. **Partial Cancellation of a Bundle or Mixed Order**:
   - *Scenario*: Customer cancels the installation appointment segment of a bundle after the physical product has already been delivered.
   - *Resolution*: `ChangeRequest` evaluates per-segment fulfillment state (`INVENTORY` = `COMPLETED`, `APPOINTMENT` = `SCHEDULED`), releases only the `APPOINTMENT` slot reservation, computes the service refund allocation according to the bundle/cancellation policy, and preserves the delivered product record.
4. **Zero-Decimal or Three-Decimal Currencies (`JPY`, `AMD`, `KWD`, `XTR`)**:
   - *Scenario*: A deployment uses `JPY` (`minorUnit = 0`) or `KWD` (`minorUnit = 3`) instead of `USD` (`minorUnit = 2`).
   - *Resolution*: All monetary calculations and formatting use `CurrencyMetadata.minorUnit`; the core never hardcodes `/ 100` or assumes 2 decimal places.
5. **Local Workstation VPN Disconnect During AI Extraction**:
   - *Scenario*: The VPS application host loses its private WireGuard/Tailscale VPN tunnel to the workstation running `OmniRoute` and `LM Studio`.
   - *Resolution*: `LanguageModelGateway` aborts on explicit request timeout ($\le 4\text{s}$ primary budget), respects `AbortSignal`, enforces `AiDataClass` fallback policy (failing closed for `CONFIDENTIAL` data), and never blocks core checkout, booking, or payment transactions.

---

## 3. Requirements _(mandatory)_

### 3.1. Functional Requirements (ISO/IEC/IEEE 29148:2018)

> **Scope Tier Legend (Option B)**:
> - **`[MVP-CORE]`**: Mandatory Production MVP slice for initial 003 release (`Phase A`, `Phase B`, `Phase D` core, `OperatorAction` & core read models).
> - **`[PHASE-PACK]`**: Subsequent modular capability pack phases (`Phase C`, `Phase E`, `Phase F`, `Phase G`) built on top of the MVP kernel.
> - **`[AI-LAB]`**: Independent non-blocking Portfolio AI Gateway & Local Inference Engineering Lab workstream (`Phase H: P-AI-001`–`P-AI-008`).

#### A. Unified Offering & Catalog Context (`Catalog`)
- **FR-301 (`[MVP-CORE]` Unified Offering Model)**: System MUST represent all sellable items through a unified `Offering` entity with `OfferingKind ∈ { PRODUCT, SERVICE, BUNDLE, DIGITAL, CUSTOM_QUOTE }`, `priceMode`, `taxCategoryId`, `active` flag, `variants` (`OfferingVariant`), and optional `servicePolicy` (`ServicePolicy`), preserving 100% backward compatibility with `001`/`002` `Item` records.
- **FR-302 (`[MVP-CORE]` Offering Variants & Commercial Attributes)**: System MUST support `OfferingVariant` records with SKU/barcode, option attributes, `PriceList` / `Price` in explicit `currency` and `unitAmountMinor` (`BigInt`), `MediaAsset`, `Category`, `SalesChannel` visibility, and `BundleComponent` composition.
- **FR-303 (`[MVP-CORE]` Currency Metadata Provider)**: System MUST resolve currency formatting and minor-unit scaling via a `CurrencyMetadata` provider (`code`, `minorUnit`) and MUST NOT hardcode `minorUnit = 2` or derive `transactionCurrency` from UI `locale`.

#### B. Unified Party & Relationship Context (`Party` & `Relationship Pack`)
- **FR-304 (`[MVP-CORE]` Single Party Abstraction)**: System MUST model customers, leads, and organizations through a single `Party` entity (`PartyKind ∈ { PERSON, ORGANIZATION }`) with linked `PartyIdentifier`, `ContactPoint`, `ChannelIdentity` (`TELEGRAM`, `WHATSAPP`, `WEB`, `EMAIL`, `PHONE`), `Consent`, `PartyTag`, and `PartyNote`—prohibiting separate disconnected `Lead`, `Customer`, and `TelegramContact` person tables.
- **FR-305 (`[MVP-CORE]` Unified Party Activity Timeline)**: System MUST project all party interactions (inbound/outbound messages, reservations, orders, payments, refunds, operator notes) into a chronological `PartyTimelineView` read model without duplicating transport messages stored in `InboxEvent`.
- **FR-306 (`[PHASE-PACK]` Operator Action Suggestions with Evidence)**: When the optional `Agent Action Suggestions` pack is enabled, the system MUST generate operator-facing `ActionSuggestion` records containing `evidence` (e.g., repeat purchase interval, open quote age, active consent status), `expectedOutcome`, `expiresAt`, and `requiresApproval = true`, and MUST NEVER execute suggested outreach or commercial mutations autonomously.

#### C. Dual Capacity Contract (`Capacity`: `Goods Pack` & `Services Pack`)
- **FR-307 (`[MVP-CORE]` Unified Capacity Application Contract)**: Inventory and service scheduling MUST use distinct persistence tables (`InventoryBalance`/`InventoryMovement` vs `Resource`/`StaffMember`/`WorkingSchedule`/`AvailabilityException`/`Reservation`) behind a unified application contract: `checkCapacity(request)`, `reserveCapacity(request)`, `commitCapacity(request)`, and `releaseCapacity(request)`.
- **FR-308 (`[MVP-CORE]` Immutable Inventory Movement Ledger)**: For `PRODUCT` offerings, stock quantities MUST be modified exclusively by appending `InventoryMovement` records (`INITIAL`, `RESERVE`, `COMMIT`, `RELEASE`, `ADJUSTMENT`, `RETURN`, `DAMAGE`) within a transaction that updates `InventoryBalance` (`onHand`, `reserved`, `available`) and optional `markingCode` references (`INV-003`).
- **FR-309 (`[MVP-CORE]` Service Capacity, Schedules, Exceptions & Buffers)**: For `SERVICE` offerings, capacity evaluation MUST enforce `WorkingSchedule`, date-specific `AvailabilityException` overrides, `BufferBefore` and `BufferAfter` intervals, `CancellationPolicy`, and `NoShowPolicy`, while protecting slot holds and bookings with `acquireResourceSlotLock` + PostgreSQL GiST `slot_resource_no_overlap` (`INV-004`).

#### D. Quotes, Orders, Snapshots & Change Requests (`Commercial Documents`)
- **FR-310 (`[PHASE-PACK]` Capacity-Aware Quote Lifecycle)**: When the `Quote Pack` (`Phase C`) is enabled, the system MUST support versioned `Quote` and `QuoteLine` entities with modes `INFORMATIONAL`, `PRICE_LOCKED`, `CAPACITY_HELD`, and `DEPOSIT_BACKED`, explicit `expiresAt`, and states `DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED | SUPERSEDED`.
- **FR-311 (`[PHASE-PACK]` Quote-to-Order Conversion & Re-Validation)**: Accepting a `Quote` MUST re-validate price, inventory/resource capacity, and active compliance providers inside a transaction and create an `Order` from the exact accepted `Quote` version snapshot (`INV-005`).
- **FR-312 (`[MVP-CORE]` Immutable OrderLine Commercial Snapshots)**: Every `OrderLine` (and `QuoteLine` when `Quote Pack` is enabled) MUST persist immutable snapshots of `offeringNameSnapshot`, `variantNameSnapshot`, `quantity` (`Decimal`), `unitAmountMinor` (`BigInt`), `currency`, `discountMinor`, `netAmountMinor`, `taxAmountMinor`, `grossAmountMinor`, `taxCategoryCode`, `taxRateSnapshot`, and `taxProviderReference` (`INV-001`).
- **FR-313 (`[PHASE-PACK]` Pre-Acceptance Margin Guard)**: When the optional `Margin Guard` pack (`Phase C`) is enabled, quotes and custom orders MUST evaluate estimated direct costs (`materialCostMinor`, `staffCostMinor`, `deliveryCostMinor`, `paymentFeeEstimateMinor`) against the client's minimum contribution margin policy and require explicit `OWNER` approval before dispatch if the estimate falls below policy.
- **FR-314 (`[PHASE-PACK]` Auditable Order Change Requests)**: Post-acceptance modifications (rescheduling, item/variant swap, quantity change, partial cancellation) in `Phase D/E` MUST be processed via an immutable `ChangeRequest` entity storing `originalSnapshot`, `proposedSnapshot`, `priceDifferenceMinor`, `capacityDifference`, `paymentAdjustment`, and `approvalState` rather than destructive in-place edits of accepted order lines.

#### E. Payment Plans, Allocations, Neutral Documents & Refunds (`Documents Pack`)
- **FR-315 (`[MVP-CORE]` Payment Plans, Milestones & Allocations)**: System MUST support `PaymentPlan` and `PaymentMilestone` records (`DEPOSIT`, `MILESTONE`, `BALANCE`, `ON_SITE`) and allocate every captured `PaymentEvent` and `RefundOperation` to specific obligations via `PaymentAllocation`, powering the `CashCommitmentView` read model (`paid`, `dueThisWeek`, `overdue`, `promisedRefunds`, `disputed`).
- **FR-316 (`[MVP-CORE]` Capability-Declared Payment Providers)**: Payment integrations MUST implement the neutral `PaymentProvider` interface (`createPayment`, `verifyWebhook`, `getPaymentStatus`, optional `refund`) and declare `PaymentProviderCapabilities` (`hostedCheckout`, `asynchronousConfirmation`, `partialPayment`, `partialRefund`, `fullRefund`, `webhookReplay`, `idempotencyKey`, `supportedCurrencies`). Checkout MUST select providers by capability and deployment configuration rather than hardcoded provider names.
- **FR-317 (`[PHASE-PACK]` Neutral Commercial Documents & Reversals)**: When `Documents Pack` is enabled, the system MUST model business documents via `CommercialDocument` (`CommercialDocumentKind ∈ { QUOTE, ORDER_CONFIRMATION, PRO_FORMA, PAYMENT_REQUEST, RECEIPT, INVOICE, CREDIT_NOTE, DELIVERY_NOTE, SERVICE_COMPLETION }`), `CommercialDocumentLine`, `DocumentRender` (PDF snapshot), and `ExternalDocumentReference`, correcting issued financial documents exclusively through compensating `CREDIT_NOTE` / reversal records (`INV-006`, `INV-007`).

#### F. Segmented Fulfillment, Evidence & Post-Sale (`Fulfillment` & `Post-Sale Pack`)
- **FR-318 (`[MVP-CORE]` Mixed Fulfillment Plans & Neutral Providers)**: Every order MUST be linked to a `FulfillmentPlan` containing one or more `FulfillmentSegment` records (`FulfillmentSegmentKind ∈ { INVENTORY, APPOINTMENT, DIGITAL, DELIVERY, MANUAL_MILESTONE }`) executed via neutral `FulfillmentProvider` modes (`PICKUP`, `LOCAL_DELIVERY`, `EXTERNAL_SHIPPING`, `SERVICE_ON_SITE`, `SERVICE_AT_CUSTOMER`, `REMOTE_SERVICE`, `DIGITAL_DELIVERY`, `MANUAL`).
- **FR-319 (`[MVP-CORE]` Segment Completion Evidence)**: Operators and field staff (`PERFORMER`) MUST be able to attach `CompletionEvidence` records (before/after media references, checklists, installed serial numbers, customer OTP/signature confirmation, start/end timestamps, performer ID) to individual `FulfillmentSegment` rows.
- **FR-320 (`[PHASE-PACK]` Order-Linked Warranty & Post-Sale Service Cases)**: When the `Warranty & Post-Sale` pack (`Phase E`) is enabled, operators MUST be able to open a `ServiceCase` (`RETURN_REQUEST`, `REPAIR_VISIT`, `REPLACEMENT`, `CUSTOMER_ISSUE`) directly from a fulfilled `Order` or `FulfillmentSegment`, preserving `WarrantyCoverage`, batch/variant snapshot, performer, and original `CompletionEvidence`.

#### G. Exception Queue, Conversation-to-Draft & Resumable Journeys (`Operations`)
- **FR-321 (`[MVP-CORE]` Exception-Driven OperatorAction Work Queue)**: Every failed, ambiguous, overdue, or manually resolvable business transition MUST create or update a durable `OperatorAction` record (`reason`, `severity`, `affectedAggregateType`, `affectedAggregateId`, `recommendedNextAction`, `availableSafeActions`, `owner`, `dueAt`, `resolution`, `auditHistory`), which serves as the primary administrative home queue.
- **FR-322 (`[PHASE-PACK]` Operator-Approved Conversation-to-Draft)**: In `Phase E`, the system MUST allow operators to convert customer conversation messages into structured drafts (`Quote Draft`, `Cart Draft`, `Booking Draft`, `Payment Request`, `Order Amendment Proposal`) where application services validate real catalog prices and capacity and require operator approval before customer confirmation.
- **FR-323 (`[PHASE-PACK]` Resumable Guest Journeys Across Channels)**: In `Phase E`, the system MUST issue short-lived, single-use or revocable, HMAC-signed `ContinuationLink` tokens (`Journey`, `JourneyToken`, `DraftReference`) that allow a guest customer to start a deal in Telegram/WhatsApp and resume checkout or slot selection in a web browser (or vice versa) without revealing internal database IDs or requiring password accounts.
- **FR-324 (`[PHASE-PACK]` Limited-Connectivity Operator Draft Mode)**: Mobile/field operators MUST be able to view the last cached read snapshot and queue non-financial drafts (notes, `CompletionEvidence`, draft quotes) locally for explicit server reconciliation upon reconnect; offline payment capture and offline final slot locking are strictly prohibited.

#### H. Staff Role Model, Session Auth, Tenancy Boundary, Capability Packs, Read Models, Data Quality & Staged Import (`Governance`)
- **FR-325 (`[MVP-CORE]` Compiled Capability Packs & Extension Contract)**: Capability packs (`Core`, `Goods`, `Services`, `Quote`, `Documents`, `Relationship`, `Messenger`, `Agent Read`, plus optional operational packs) MUST implement the typed `CapabilityModule` contract (`id`, `version`, `requiredCapabilities`, `registerRoutes`, `registerJobs`, `registerPolicies`, `registerReadModels`), compiled into the monolith and toggled via Zod-validated deployment configuration—prohibiting runtime dynamic plugin loading, arbitrary npm installs, or dynamic Prisma schema mutation.
- **FR-325a (`[MVP-CORE]` Fixed Three-Role Staff Authorization Model — Q2 Option B)**: System MUST enforce a fixed 3-role hierarchy (`StaffRole ∈ { OWNER, OPERATOR, PERFORMER }`) across HTTP admin commands and Telegram Staff Bot callbacks (`authorizeStaffCallback`) without a custom RBAC builder:
  1. **`OWNER`**: Full access to deployment/capability configuration, staff provisioning and role assignments, session revocation, GDPR purges (`/purge`), blacklist unblocks (`/unblock`), `MarginGuard` / compliance overrides, `ImportBatch` commits, and unrestricted refunds;
  2. **`OPERATOR`**: Access to orders, party records, catalog/schedule management, `OperatorAction` work queue resolution, Staff Bot booking approvals/rejections/reschedules/blacklisting, and standard refunds within policy;
  3. **`PERFORMER`**: Restricted strictly to viewing assigned `FulfillmentSegment` items and `WorkingSchedule` windows, marking assigned segments complete (`fulfill`), and submitting `CompletionEvidence`.
- **FR-325b (`[MVP-CORE]` Individual Staff Accounts, Server-Side Sessions & Break-Glass `ADMIN_TOKEN` — Q3 Option B)**: Staff authentication into administrative interfaces MUST use individual `StaffMember` accounts and server-side sessions (`StaffSession`) via a maintained authentication library:
  1. **No Self-Registration**: Public staff sign-up is disabled; only an authenticated `OWNER` (or initial deployment seed/bootstrap) can create or invite `StaffMember` accounts;
  2. **Single Role Assignment**: Every `StaffMember` has exactly one `StaffRole` (`OWNER`, `OPERATOR`, or `PERFORMER`);
  3. **Individual Session Revocation**: `OWNER` can revoke individual `StaffSession` records or deactivate a `StaffMember` (`active = false`) with immediate effect across web sessions and linked `telegramUserId` Staff Bot callbacks;
  4. **Mandatory `actorId` Audit Attribution**: Every administrative HTTP command and Staff Bot mutation MUST record the authenticated `actorId` (`StaffMember.id`) and `actorRole` (`StaffRole`) in `AuditEvent` and `OperatorAction.auditHistory`;
  5. **Emergency Break-Glass `ADMIN_TOKEN`**: The static `ADMIN_TOKEN` is retained strictly as an emergency break-glass recovery credential (`actorId = "BREAK_GLASS_ADMIN_TOKEN"`, `actorRole = OWNER`) and MUST emit a dedicated high-severity audit record (`BREAK_GLASS_ADMIN_TOKEN_USED`) on every invocation.
- **FR-325c (`[MVP-CORE]` Single-Tenant Dedicated-Database Deployment Boundary — Q4 Option A)**: Each application deployment and its PostgreSQL database MUST serve exactly one client business (`1 deployment = 1 client business = 1 PostgreSQL database`). All unique keys (`Offering.slug`, `StaffMember.email`, `StaffMember.telegramUserId`, `idempotencyKey`), GiST exclusion constraints, backups, GDPR purges, and 4-stage migrations operate at single-business database scope without shared-table `tenantId` columns or multi-schema routing. Branches, warehouses, and additional legal entities are not modeled as independent tenants in the Production MVP and are reserved for a future capability pack.
- **FR-326 (`[MVP-CORE]` Redacted Read Models & Zero Direct Table Writes)**: Admin UI, CRM views, reports, and the optional `Agent Read Pack` (read-only MCP in `Phase G`) MUST query only bounded projections (`OrderSummaryView`, `PartyTimelineView`, `AvailabilityView`, `OperatorActionView`, `CatalogSearchView`, `PaymentStatusView`, `CashCommitmentView`). Direct CRUD writes to transactional tables or MCP mutation tools are strictly prohibited (`INV-008`, `INV-010`).
- **FR-327 (`[PHASE-PACK]` Operational Data Quality Scanner & Quarantined Staged Import)**: In `Phase E`, the system MUST provide a `DataQualityIssue` diagnostic scanner (detecting duplicate contacts, offerings missing capacity policies/durations, broken provider mappings, unallocated payments, and stale operator actions) and a quarantined `ImportBatch` pipeline (`upload → parse → normalize → stage → detect duplicates/conflicts → approve mapping → commit batch with rollback reference`).

#### I. Jurisdiction Neutrality, Compliance Ports & Client Manifest (`Compliance`)
- **FR-328 (`[MVP-CORE]` Jurisdiction-Neutral Core & `[PHASE-PACK]` Narrow Compliance Ports)**: Core modules MUST NOT branch on hardcoded country codes or infer tax/fiscal rules from locale (`INV-J01`, `INV-J02`). All jurisdiction-specific integrations (`Phase F`) MUST plug into narrow, independently toggleable SPI ports: `TaxQuoteProvider`, `FiscalReceiptProvider`, `ElectronicInvoiceProvider`, `ProductComplianceProvider`, and `TransportDocumentProvider`, bound to a versioned `JurisdictionProfile` (`configJson` validated by Zod, zero executable JS/SQL).
- **FR-329 (`[PHASE-PACK]` Client Customization Manifest & Feature-Fit Wizard)**: Each deployment MUST be driven by a Zod-validated YAML/JSON client customization manifest (`deployment`, `business`, `presentation`, `capabilities`, `providers`, `policies`) producible via a non-legal deployment feature-fit questionnaire (`Phase F`) that outputs required adapters, missing-provider warnings, and an acceptance-test profile.
- **FR-330 (`[PHASE-PACK]` Client Compliance Readiness Gate)**: A deployment MUST remain flagged `NOT_COMPLIANCE_READY` until the client or its qualified legal/tax advisor explicitly signs off on the active `JurisdictionProfile`, tax treatment, document numbering, payment terms, privacy/consent notices, and retention periods (`INV-J06`, `INV-J07`).

#### J. Portfolio AI Gateway & Local Inference Engineering Lab (`Optional Lab Workstream — Phase H`)
- **FR-331 (`[AI-LAB]` `LanguageModelGateway` Application Port)**: The application MUST interact with LLMs exclusively through a provider-agnostic `LanguageModelGateway` interface (`generate(request, signal)`, `stream(request, signal)`, `health()`) using an OpenAI-compatible wire contract (`P-AI-001`), without importing `LM Studio` or `OmniRoute` SDK internals into domain services.
- **FR-332 (`[AI-LAB]` LM Studio Local Inference & OmniRoute AI Gateway Sidecar)**: The repository MUST include an optional Engineering Lab profile (`infrastructure/compose/ai-lab.compose.yml`) configuring local `LM Studio` inference (GGUF model lifecycle, structured JSON output, streaming, embeddings, timeouts, concurrency limits) behind an optional `OmniRoute` gateway sidecar (`P-AI-002`, `P-AI-003`) with a strict provider class allowlist (`allowedProviderClasses: ['local', 'official-api-key']`; `deniedProviderClasses: ['web-cookie', 'unofficial-proxy', 'unknown-provenance']`).
- **FR-333 (`[AI-LAB]` Privacy-Aware `AiDataClass` Routing & Fail-Closed Confidentiality)**: Every AI use case MUST declare a versioned routing policy and `AiDataClass ∈ { PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED }`. `CONFIDENTIAL` requests MUST route to `local` only and fail closed when no approved local runtime is healthy (never silently falling back to cloud), while `RESTRICTED` data is prohibited from AI processing.
- **FR-334 (`[AI-LAB]` Dual Redacted AI Telemetry, Golden Benchmark & Outage Drill)**: For every AI call, the application MUST record redacted operational telemetry (`traceId`, `useCase`, `providerRoute`, `modelAlias`, `promptVersion`, `latencyMs`, `timeToFirstTokenMs`, `inputTokens`, `outputTokens`, `fallbackCount`, `structuredOutputValid`, `retrievalHitCount`, `resultStatus`) with zero raw prompts, responses, or PII (`P-AI-004`), and ship a reproducible golden-dataset benchmark (`P-AI-005`, `P-AI-006`), a recorded local-model outage drill (`P-AI-007`), and private VPN workstation network documentation (`P-AI-008`).

---

### 3.2. Hard Domain & Jurisdiction Invariants (`NON-NEGOTIABLE`)

#### Core Transactional Invariants (`INV-001` – `INV-013`)
- **`INV-001`**: `OrderLine` commercial snapshots (`offeringNameSnapshot`, `unitAmountMinor`, `currency`, `taxAmountMinor`, `discountMinor`, `grossAmountMinor`) are immutable after order acceptance.
- **`INV-002`**: Payment acceptance (`PaymentEvent`) is never rolled back because inventory or service capacity became unavailable; capacity conflicts after payment transition the order to `PAID_REQUIRES_RESOLUTION` and create a durable `OperatorAction`.
- **`INV-003`**: Product inventory is changed only through immutable `InventoryMovement` records inside a database transaction.
- **`INV-004`**: Service capacity is changed only through `Reservation` transitions protected by the shared concurrency primitive (`acquireResourceSlotLock` + PostgreSQL GiST exclusion constraint `slot_resource_no_overlap`).
- **`INV-005`**: Quote acceptance creates an `Order` from a versioned, immutable `Quote` snapshot after re-verifying current capacity and compliance prerequisites.
- **`INV-006`**: Commercial document (`Invoice`/`Receipt`), fiscal/compliance result, payment (`PaymentPlan`/`PaymentEvent`), `Order`, and `FulfillmentPlan` have independent state machines.
- **`INV-007`**: Financial documents and payments are corrected exclusively through explicit reversal, `CREDIT_NOTE`, or `RefundOperation` records—never destructive edits or deletes.
- **`INV-008`**: No admin UI, CRM view, Directus-like sidecar adapter, or MCP tool writes directly to transactional domain tables; all mutations pass through typed application service commands.
- **`INV-009`**: Every external side effect (messaging, payment provider calls, compliance provider calls) has a durable outbox/inbox record (`InboxEvent`).
- **`INV-010`**: Raw PII (`customerPhone`, `customerEmail`, `customerNotes`, unmasked names, payment credentials) is absent from application logs, AI/MCP agent responses, analytics events, and idempotency keys.
- **`INV-011`**: Disabling any capability pack in configuration cannot make historical orders, payments, or commercial documents unreadable.
- **`INV-012`**: Jurisdiction and compliance adapters never silently guess tax rates, legal entity rules, or fiscal treatment; pre-checkout tax provider failure blocks checkout, while post-payment compliance failure creates a durable `OperatorAction`.
- **`INV-013`**: Each deployment instance and PostgreSQL database is physically isolated to a single client business (`Q4 Option A`); cross-tenant shared tables (`tenantId`) and multi-schema tenancy are prohibited in the core schema.

#### Jurisdiction Neutrality Invariants (`INV-J01` – `INV-J08`)
- **`INV-J01`**: No core module branches on a hardcoded country code (e.g., `AM`, `RU`, `US`, `AE`).
- **`INV-J02`**: No currency, tax rate, invoice sequence, retention period, or fiscal behavior is inferred from UI `locale`, phone country code, or shipping address alone.
- **`INV-J03`**: Every jurisdiction-specific behavior is owned by a named, versioned adapter or `JurisdictionProfile`.
- **`INV-J04`**: Disabling a compliance adapter does not delete or corrupt commercial transaction history.
- **`INV-J05`**: Compliance failure after an accepted payment creates a durable `OperatorAction` and never rewrites or rolls back the payment result.
- **`INV-J06`**: A deployment cannot be marked `COMPLIANCE_READY` for production until its active jurisdiction, tax, document, payment, privacy, and retention profiles are explicitly approved by the client.
- **`INV-J07`**: The template makes no legal, tax, or accounting compliance warranty by default; legal interpretation belongs to the client or its qualified advisor.
- **`INV-J08`**: Country packs contain configuration manifests and provider adapters only—never forks of the core domain model.

---

### 3.3. Non-Functional Requirements (NFR) _(ISO/IEC/IEEE 29148:2018)_

- **NFR-301 (Capacity & Read-Model Query Latency)**: `checkCapacity` for a mixed basket (up to 10 offerings across 7 days) and read-model queries (`OrderSummaryView`, `OperatorActionView`, `PartyTimelineView`) MUST complete in **< 50 ms (p95)** and **< 120 ms (p99)** under standard load.
- **NFR-302 (Transactional Command Latency & Webhook Ack)**: Application write commands (`reserveCapacity`, quote acceptance, `ChangeRequest`, `OperatorAction` resolution) and webhook acknowledgments MUST complete in **< 250 ms (p95)** and **< 1,500 ms (p99)**.
- **NFR-303 (Container Memory Ceiling & Concurrency Baseline — Q5 Option B)**: The production Next.js 15 modular monolith container (`REPLICA_COUNT=1`) MUST operate within **$\le 500\text{ MB RAM}$ (`app RSS <= 500 MB`)** peak RSS under **100 concurrent booking/checkout requests**, two active Telegram bots, `inboxPoller`, and enabled capability packs. Optional `Engineering AI Lab` components (`LM Studio`, `OmniRoute`, monitoring backends, and VPN workstation) are excluded from the `500 MB` main application container ceiling and MUST NOT impact `commerce-core` availability.
- **NFR-304 (Single-VPS Production Availability & Disaster Recovery Baseline — Q5 Option B)**: Mandatory production MVP operational baseline for each dedicated client deployment is **99.0% uptime** on a single VPS; **RTO $\le 60$ minutes** via container restart and automated dump restoration drill; and **RPO $\le 24$ hours** via scheduled `pg_dump` + Restic backup (no Kubernetes, multi-node HA cluster, or continuous WAL PITR required; more frequent host snapshot intervals such as 6 hours remain supported as optional deployment overrides).
- **NFR-305 (Zero-Downtime 4-Stage DDL Evolution)**: All schema migrations from `002` to `003` MUST execute in 4 decoupled stages (**Expand $\to$ Backfill $\to$ Validate/Cutover $\to$ Contract**) with `SET lock_timeout = '2s'`, `SET statement_timeout = '5s'`, `CHECK ... NOT VALID` + separate `VALIDATE CONSTRAINT`, and bounded batch backfills (`LIMIT 500 FOR UPDATE SKIP LOCKED`).
- **NFR-306 (AI Gateway & Local Inference Latency Budget)**: In the Engineering Lab profile, `LanguageModelGateway` requests MUST enforce explicit `AbortSignal` timeouts (**4,000 ms** primary route budget, **3,000 ms** fallback route budget, **8,000 ms** total ceiling) and bounded concurrency so slow local inference never exhausts Node.js event-loop or database connections.
- **NFR-307 (Golden Evaluation Quality Gate)**: No model or prompt version in the Engineering Lab may be promoted to default route unless it achieves **100% Zod structured-output validity**, **0% PII leakage**, **100% prompt-injection refusal on adversarial test cases**, and **$\ge 90\%$ field-extraction accuracy** on the versioned golden dataset.

---

### 3.4. Regulatory & Compliance Screening _(ISO/IEC/IEEE 12207 Phase 0)_

- **Jurisdictions**: **Jurisdiction-Neutral Template Core** (adaptable per deployment to GDPR, 152-ФЗ, CCPA, UAE PDPL, Armenia SRC, EU VAT, or client-specified regimes via `JurisdictionProfile` and `RetentionProfile`).
- **Data Classification**:
  - `PUBLIC`: Active catalog offerings, public prices, store hours, public knowledge base chunks.
  - `INTERNAL`: Redacted read models (`OrderSummaryView`, `OperatorActionView`, `CashCommitmentView`), aggregated telemetry.
  - `CONFIDENTIAL`: Unredacted `Party` contact points (`customerPhone`, `customerEmail`), `customerNotes`, conversation transcripts, `CompletionEvidence` media, `MarginGuard` internal cost estimates.
  - `RESTRICTED`: Payment provider secrets, webhook signing keys, `StaffMember.passwordHash`, `StaffSession` token hashes, break-glass `ADMIN_TOKEN`, raw payment card/wallet credentials (never stored in core DB; delegated to `PaymentProvider` hosted checkouts).
- **Client Compliance Readiness Gate**:
  - Every deployment starts in `NOT_COMPLIANCE_READY` state until the client or its qualified legal/tax counsel approves in writing: seller legal identity, applicable jurisdictions, tax treatment and provider, commercial/fiscal document numbering, payment/refund terms, privacy/consent basis, and retention/erasure schedules (`RetentionProfile`).
- **Kill Criteria (Falsifiability)**:
  1. If adding the `003` capability packs pushes the production app container steady/peak RSS above **500 MB RAM**, in-memory caches or heavy projections MUST be trimmed or moved to on-demand PostgreSQL views before merge.
  2. If any proposed feature requires double-entry accounting, multi-warehouse routing, shared-database multi-tenancy, or unfreezing Track 2 (`Medusa`), that scope is immediately rejected from `003`.
  3. If any external OSS code candidate lacks a permissive license (`MIT`, `BSD-3-Clause`, `Apache-2.0`) at the exact file path and commit SHA, code reuse is aborted in favor of clean-room implementation.

---

### 3.5. Security & Threat Mitigation (STRIDE) _(NIST SP 800-218 SSDF)_

| Threat Category | Attack Vector | Architectural Mitigation in Feature 003 |
| :--- | :--- | :--- |
| **Spoofing** | Shared static admin tokens, forged `ContinuationLink` guest tokens, forged webhook callbacks, or unauthorized workstation access to AI Gateway | Individual `StaffMember` accounts and server-side `StaffSession` cookies/tokens via a maintained auth library (`FR-325b`, no self-registration); `JourneyToken` and `MagicRescheduleLink` signed with HMAC-SHA256; `OmniRoute` + `LM Studio` bound to localhost/private WireGuard VPN subnet. |
| **Tampering** | Mutating historical order prices, altering issued invoices, or bypassing application invariants via admin/CRM/MCP direct DB writes | `INV-001` immutable `OrderLine` snapshots; `INV-007` reversal/credit-note-only corrections; `INV-008` strict ban on direct table writes from UI/Directus/MCP; CAS `scheduleVersion` guards on all state transitions. |
| **Repudiation** | Disputed order changes, manual margin overrides, unblocking blacklisted parties, or emergency `ADMIN_TOKEN` use | Every command emits an immutable `AuditEvent` and updates `OperatorAction.auditHistory` with individual `actorId` (`StaffMember.id`), `actorRole`, `reason`, and `timestamp`; emergency `ADMIN_TOKEN` calls emit a dedicated `BREAK_GLASS_ADMIN_TOKEN_USED` audit record (`FR-325b`). |
| **Information Disclosure** | Cross-client tenant leakage, or leaking customer PII/business data to cloud LLMs, MCP clients, logs, or unverified OmniRoute proxy providers | Physical single-tenant isolation (`1 deployment = 1 dedicated PostgreSQL DB`, `FR-325c` / `INV-013`); `AiDataClass.CONFIDENTIAL` enforces local-only inference and fails closed when local `LM Studio` is down; `deniedProviderClasses` blocks `web-cookie` and unofficial proxies; MCP reads only PII-redacted projections; recursive `logger.ts` denylist. |
| **Denial of Service** | Malformed CSV imports, combinatorial bundle/slot queries, or stalled local LLM inference hanging the web server | Staged `ImportBatch` row/size limits; basket cap ($\le 10$ items, $\le 480$ min); `LanguageModelGateway` hard timeout ($\le 8\text{s}$ total) + concurrency limiter; durable outbox rate shaping; AI Lab isolated from `500 MB` commerce-core container (`NFR-303`). |
| **Elevation of Privilege** | `PERFORMER` attempting financial refunds/config edits, terminated staff retaining access, AI agent executing autonomous mutations, or arbitrary JS in `JurisdictionProfile.configJson` | Fixed 3-role RBAC (`OWNER > OPERATOR > PERFORMER`) enforced on every command and Staff Bot callback (`FR-325a`); instant per-user `StaffSession` revocation (`FR-325b`); zero MCP mutation tools; `configJson` validated strictly via declarative Zod schemas. |

---

## 4. Key Entities, Bounded Contexts & Domain Contracts

### 4.1. Bounded Contexts Overview

1. **`A. Party Context` (`[MVP-CORE]`)**: `Party` (`PERSON | ORGANIZATION`), `PartyIdentifier`, `ContactPoint`, `ChannelIdentity`, `Consent`, `PartyNote`, `PartyTag`, `PartyActivity`.
2. **`B. Catalog Context` (`[MVP-CORE]`)**: `Offering` (`PRODUCT | SERVICE | BUNDLE | DIGITAL | CUSTOM_QUOTE`), `OfferingVariant`, `ServicePolicy`, `Category`, `MediaAsset`, `PriceList`, `Price`, `TaxCategory`, `BundleComponent`, `SalesChannel`, `CurrencyMetadata`.
3. **`C. Capacity & Staff Context` (`[MVP-CORE]`)**: `InventoryBalance`, `InventoryMovement`, `Resource`, `StaffMember` (`role: StaffRole ∈ { OWNER, OPERATOR, PERFORMER }`), `StaffSession`, `WorkingSchedule`, `AvailabilityException`, `CapacityRule`, `Reservation`.
4. **`D. Commercial Documents & Payments Context` (`[MVP-CORE]` Orders/PaymentPlans + `[PHASE-PACK]` Quotes/Documents/ChangeRequests)**: `Order`, `OrderLine`, `PaymentPlan`, `PaymentMilestone`, `PaymentEvent`, `PaymentAllocation`, `RefundOperation` (MVP); `Quote`, `QuoteLine`, `ChangeRequest`, `CommercialDocument`, `CommercialDocumentLine`, `DocumentRender`, `ExternalDocumentReference`, `NumberingProfile` (Subsequent Pack Phases).
5. **`E. Fulfillment & Post-Sale Context` (`[MVP-CORE]` FulfillmentPlan/Evidence + `[PHASE-PACK]` Warranty/ServiceCase)**: `FulfillmentPlan`, `FulfillmentSegment`, `ServiceAppointment`, `DigitalEntitlement`, `DeliveryReference`, `CompletionEvidence` (MVP); `WarrantyCoverage`, `ServiceCase` (Subsequent Pack Phase).
6. **`F. Communications & Journey Context` (`[MVP-CORE]` Inbox/Outbox + `[PHASE-PACK]` Guest Journey Links)**: `Conversation`, `Message`, `MessageTemplate`, `NotificationJob` (backed by existing `InboxEvent` / `TelegramRateState`), plus `Journey`, `JourneyToken`, `ContinuationLink` (`Phase E`).
7. **`G. Operations, Data Quality & Import Context` (`[MVP-CORE]` OperatorAction/Audit + `[PHASE-PACK]` DataQuality/ImportBatch)**: `OperatorAction`, `Approval`, `AuditEvent` (MVP); `ActionSuggestion`, `DataQualityIssue`, `ImportBatch`, `ImportRow`, `ImportIssue`, `ImportMapping` (`Phase E`).
8. **`H. Compliance Adapters & Profiles Context` (`[PHASE-PACK]` `Phase F`)**: `JurisdictionProfile`, `LegalEntityProfile`, `LocaleProfile`, `RetentionProfile`, `ConsentProfile`, `ComplianceOperationRequest`, `ComplianceOperationResult`.
9. **`I. Redacted Read Models Context` (`[MVP-CORE]` + `[PHASE-PACK]`)**: `OrderSummaryView`, `PartyTimelineView`, `AvailabilityView`, `OperatorActionView`, `CatalogSearchView`, `PaymentStatusView`, `CashCommitmentView`.
10. **`J. Portfolio AI Gateway & Lab Context` (`[AI-LAB]` `Phase H`)**: `LanguageModelGateway`, `AiRoutingPolicy`, `AiTelemetryRecord`, `GoldenDatasetCase`, `BenchmarkRunReport`.

---

### 4.2. Core Domain Models & Schema Contracts

```prisma
enum StaffRole {
  OWNER
  OPERATOR
  PERFORMER
}

enum OfferingKind {
  PRODUCT
  SERVICE
  BUNDLE
  DIGITAL
  CUSTOM_QUOTE
}

enum PriceMode {
  FIXED
  STARTING_FROM
  QUOTE_REQUIRED
}

enum PartyKind {
  PERSON
  ORGANIZATION
}

enum QuoteMode {
  INFORMATIONAL
  PRICE_LOCKED
  CAPACITY_HELD
  DEPOSIT_BACKED
}

enum QuoteStatus {
  DRAFT
  SENT
  ACCEPTED
  REJECTED
  EXPIRED
  SUPERSEDED
}

enum FulfillmentPlanStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  PARTIALLY_COMPLETED
  CANCELLED
  REQUIRES_ATTENTION
}

enum FulfillmentSegmentKind {
  INVENTORY
  APPOINTMENT
  DIGITAL
  DELIVERY
  MANUAL_MILESTONE
}

enum CommercialDocumentKind {
  QUOTE
  ORDER_CONFIRMATION
  PRO_FORMA
  PAYMENT_REQUEST
  RECEIPT
  INVOICE
  CREDIT_NOTE
  DELIVERY_NOTE
  SERVICE_COMPLETION
}

enum AiDataClass {
  PUBLIC
  INTERNAL
  CONFIDENTIAL
  RESTRICTED
}

model StaffMember {
  id             String         @id @default(uuid())
  email          String         @unique
  displayName    String
  passwordHash   String?
  role           StaffRole      @default(PERFORMER)
  telegramUserId String?        @unique
  resourceId     String?
  invitedById    String?
  active         Boolean        @default(true)
  sessions       StaffSession[]
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
}

model StaffSession {
  id            String      @id @default(uuid())
  staffMemberId String
  staffMember   StaffMember @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  tokenHash     String      @unique
  expiresAt     DateTime
  revokedAt     DateTime?
  createdAt     DateTime    @default(now())
}

model Offering {
  id            String            @id @default(uuid())
  slug          String            @unique
  kind          OfferingKind
  name          String
  description   String?
  active        Boolean           @default(true)
  taxCategoryId String?
  priceMode     PriceMode         @default(FIXED)
  variants      OfferingVariant[]
  servicePolicy ServicePolicy?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
}

model OrderLine {
  id                    String   @id @default(uuid())
  orderId               String
  offeringId            String?
  variantId             String?
  offeringNameSnapshot  String
  variantNameSnapshot   String?
  quantity              Decimal
  unitAmountMinor       BigInt
  currency              String
  discountMinor         BigInt   @default(0)
  netAmountMinor        BigInt?
  taxAmountMinor        BigInt?
  grossAmountMinor      BigInt
  taxCategoryCode       String?
  taxRateSnapshot       Decimal?
  taxProviderReference  String?
  durationMinSnapshot   Int?
}

model FulfillmentPlan {
  id        String                @id @default(uuid())
  orderId   String                @unique
  status    FulfillmentPlanStatus @default(PENDING)
  segments  FulfillmentSegment[]
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt
}

model JurisdictionProfile {
  id                          String   @id @default(uuid())
  code                        String   @unique
  countryCode                 String?
  subdivisionCode             String?
  legalEntityType             String?
  baseCurrency                String
  defaultLocale               String
  defaultTimeZone             String
  taxProviderId               String?
  fiscalReceiptProviderId     String?
  electronicInvoiceProviderId String?
  productComplianceProviderId String?
  transportProviderId         String?
  complianceReady             Boolean  @default(false)
  approvedBy                  String?
  approvedAt                  DateTime?
  configJson                  Json
  version                     Int      @default(1)
  active                      Boolean  @default(true)
  createdAt                   DateTime @default(now())
}
```

---

### 4.3. Application Service & Adapter SPI Contracts

```typescript
// 1. Unified Capacity Contract
export interface CapacityPort {
  checkCapacity(request: CapacityCheckRequest): Promise<CapacityCheckResult>;
  reserveCapacity(request: CapacityReserveRequest): Promise<CapacityReserveResult>;
  commitCapacity(request: CapacityCommitRequest): Promise<CapacityCommitResult>;
  releaseCapacity(request: CapacityReleaseRequest): Promise<CapacityReleaseResult>;
}

// 2. Narrow Jurisdiction-Neutral Compliance Ports
export interface TaxQuoteProvider {
  quote(input: TaxQuoteInput): Promise<TaxQuoteResult>;
}

export interface FiscalReceiptProvider {
  registerSale(input: FiscalSaleInput): Promise<ComplianceResult>;
  registerRefund(input: FiscalRefundInput): Promise<ComplianceResult>;
}

export interface ElectronicInvoiceProvider {
  issue(input: InvoiceIssueInput): Promise<ComplianceResult>;
  correct(input: InvoiceCorrectionInput): Promise<ComplianceResult>;
  cancel(input: InvoiceCancellationInput): Promise<ComplianceResult>;
}

export interface ProductComplianceProvider {
  validateItems(input: ProductComplianceInput): Promise<ComplianceResult>;
}

export interface TransportDocumentProvider {
  issue(input: TransportDocumentInput): Promise<ComplianceResult>;
}

// 3. Capability-Declared Payment & Fulfillment Providers
export type PaymentProviderCapabilities = {
  hostedCheckout: boolean;
  asynchronousConfirmation: boolean;
  partialPayment: boolean;
  partialRefund: boolean;
  fullRefund: boolean;
  webhookReplay: boolean;
  idempotencyKey: boolean;
  supportedCurrencies: string[];
};

export interface PaymentProvider {
  readonly id: string;
  readonly capabilities: PaymentProviderCapabilities;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyWebhook(input: RawWebhookInput): Promise<VerifiedPaymentEvent>;
  getPaymentStatus(reference: string): Promise<PaymentStatusResult>;
  refund?(input: RefundInput): Promise<RefundResult>;
}

export interface FulfillmentProvider {
  readonly id: string;
  quote?(input: FulfillmentQuoteInput): Promise<FulfillmentQuote>;
  create(input: CreateFulfillmentInput): Promise<FulfillmentResult>;
  cancel(input: CancelFulfillmentInput): Promise<FulfillmentResult>;
  track?(reference: string): Promise<TrackingResult>;
}

// 4. Compiled Capability Pack Contract
export interface CapabilityModule {
  id: string;
  version: string;
  requiredCapabilities: string[];
  registerRoutes(registry: RouteRegistry): void;
  registerJobs(registry: JobRegistry): void;
  registerPolicies(registry: PolicyRegistry): void;
  registerReadModels(registry: ReadModelRegistry): void;
}

// 5. Portfolio AI Gateway Port (LM Studio / OmniRoute / Cloud)
export interface LanguageModelGateway {
  generate(request: GenerateRequest, signal: AbortSignal): Promise<GenerateResult>;
  stream(request: GenerateRequest, signal: AbortSignal): AsyncIterable<GenerateChunk>;
  health(): Promise<GatewayHealth>;
}
```

---

### 4.4. Capability Packs Matrix & Delivery Tier Classification (Option B)

| Capability Pack | Delivery Tier (Option B) | Default State | Included Domain & Operational Slice |
| :--- | :--- | :--- | :--- |
| **`Core Pack`** | **Production MVP (`003.1`)** | **Always Enabled** | Single-tenant dedicated DB boundary (`Option A`), single-VPS baseline (`Option B`: 99.0% uptime, RTO 60m, RPO 24h, 100 concurrent reqs, RSS $\le 500\text{ MB}$), `Party`, `Offering`, `PriceSnapshot`, `StaffMember` (`OWNER | OPERATOR | PERFORMER`), `StaffSession`, `Order`, `OrderLine`, `PaymentPlan`, `PaymentAllocation`, `FulfillmentPlan`, `FulfillmentSegment`, `CompletionEvidence`, `OperatorAction`, `AuditEvent`, `DurableInboxOutbox`, 4-stage migration from `001`/`002` |
| **`Goods Pack`** | **Production MVP (`003.1`)** | Configurable (`true`) | `OfferingVariant`, `InventoryBalance`, `InventoryMovement`, stock reservation, low-stock `OperatorAction`, pickup/delivery modes, SKU/barcode, optional `markingCode` reference |
| **`Services Pack`** | **Production MVP (`003.1`)** | Configurable (`true`) | `StaffMember`, `Resource`, `WorkingSchedule`, `AvailabilityException`, `BufferBefore`/`BufferAfter`, multi-service cart, approval/reschedule, cancellation & no-show policies |
| **`Messenger Pack`** | **Production MVP (`003.1`)** | Configurable (`true`) | Telegram Client Bot + TMA, Telegram Staff Bot pager (`OWNER`/`OPERATOR`/`PERFORMER` role-gated actions mapped via `StaffMember.telegramUserId`), WhatsApp Cloud API approved templates, channel identities, opt-out/cooldown |
| **`Quote Pack`** | **Subsequent Phase (`Phase C`)** | Configurable (`false`) | Versioned `Quote` & `QuoteLine`, `INFORMATIONAL`/`PRICE_LOCKED`/`CAPACITY_HELD`/`DEPOSIT_BACKED` modes, quote-to-order conversion, optional `MarginGuard` |
| **`Documents & Compliance Pack`** | **Subsequent Phase (`Phase D/F`)** | Configurable (`false`) | `CommercialDocument`, `DocumentRender` PDF snapshot, `NumberingProfile`, `CREDIT_NOTE` reversals, `JurisdictionProfile`, and narrow compliance provider adapters |
| **`Relationship & Ops Extensions`** | **Subsequent Phase (`Phase E`)** | Configurable (`false`) | Conversation-to-draft, resumable `Journey` links, `ChangeRequest`, `Warranty & Post-Sale` (`ServiceCase`), `DataQualityIssue` scanner, quarantined `ImportBatch`, `ActionSuggestion`, limited-connectivity draft mode |
| **`Agent Read Pack`** | **Subsequent Spike (`Phase G`)** | **Disabled by Default** (`false`) | Read-only MCP & projection query surface (`CatalogSearchView`, `AvailabilityView`, `OrderSummaryView`, `OperatorActionView`, knowledge search); **zero mutation tools** |
| **`Engineering AI Lab`** | **Portfolio Workstream (`Phase H`)** | **Optional Lab Profile** (`false`) | `LanguageModelGateway`, local `LM Studio` inference profile, `OmniRoute` AI Gateway sidecar, `AiDataClass` routing policies, redacted OTel telemetry, golden-dataset benchmark & local outage drill (`P-AI-001`–`P-AI-008`, isolated from 500 MB commerce-core container) |

---

### 4.5. Mandatory Phased Implementation Order (Option B Partitioning)

Implementation MUST follow strict domain-first sequencing (never starting with cosmetic dashboards, Kanban boards, PDF designers, or MCP servers before transactional invariants exist):

#### Tier 1 — Mandatory Production MVP Scope (Sprint B Deliverable `003.1`)
- **Phase A (MVP Foundation, Single-Tenant Boundary, Staff Roles & Session Auth)**: Single-tenant dedicated-DB boundary (`FR-325c`), `Party` + `Offering` unification, fixed 3-role `StaffMember` model (`OWNER`, `OPERATOR`, `PERFORMER`) + server-side `StaffSession` authentication (maintained auth library, no self-registration, break-glass `ADMIN_TOKEN` audit), `CapabilityModule` registry, and 4-stage Expand $\to$ Backfill $\to$ Validate/Cutover $\to$ Contract migration from `001`/`002` `Item`, `Order`, `OrderItem`, `SlotReservation`, and `MessengerContact`.
- **Phase B (MVP Capacity)**: `InventoryMovement` ledger + `InventoryBalance` (`Goods Pack`) and unified `CapacityPort` wrapping service `Reservation`, `WorkingSchedule`, `AvailabilityException`, and `BufferBefore`/`BufferAfter` (`Services Pack`).
- **Phase D-Core (MVP Commercial & Fulfillment Core)**: Immutable `OrderLine` snapshots, `PaymentPlan` / `PaymentMilestone` / `PaymentAllocation`, mixed `FulfillmentPlan` / `FulfillmentSegment` with `CompletionEvidence`, `OperatorAction` work queue + core redacted read models (`OperatorActionView`, `OrderSummaryView`, `PartyTimelineView`, `AvailabilityView`, `CashCommitmentView`), and Single-VPS Operational Baseline verification (`NFR-303`, `NFR-304`: 100 concurrent requests, app RSS $\le 500\text{ MB}$, backup/restore drill within RTO $\le 60\text{ min}$ / RPO $\le 24\text{ h}$).

#### Tier 2 — Subsequent Independent Capability Pack Phases (`003.2+`)
- **Phase C (`Quote Pack`)**: Versioned `Quote` lifecycle, `MarginGuard`, and transactional quote-to-order conversion.
- **Phase D-Extended (`Documents & Change Requests`)**: `ChangeRequest` workflow, `CommercialDocument` / `DocumentRender` references, and `CREDIT_NOTE` reversals.
- **Phase E (`Relationship & Operations Pack`)**: Conversation-to-draft, resumable guest `Journey` / `ContinuationLink`, `ServiceCase` post-sale workflow, `DataQualityIssue` scanner, and staged `ImportBatch` quarantine.
- **Phase F (`Jurisdiction & Compliance Pack`)**: Jurisdiction-neutral compliance provider SPIs (`TaxQuoteProvider`, `FiscalReceiptProvider`, `ElectronicInvoiceProvider`, `ProductComplianceProvider`, `TransportDocumentProvider`), `JurisdictionProfile`, and Client Customization Manifest validator.
- **Phase G (`Agent Read Pack`)**: Disposable/read-only MCP spike consuming redacted read models (governed by Constitution Principle XI).

#### Tier 3 — Non-Blocking Portfolio Engineering Lab Workstream (`Phase H`)
- **Phase H (`P-AI-001` – `P-AI-008`)**: Portfolio AI Gateway (`LanguageModelGateway`), `LM Studio` local inference profile, `OmniRoute` sidecar configuration, redacted AI telemetry, golden-dataset benchmark, local-model outage drill, and private VPN workstation documentation.

---

## 5. Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001 (Production MVP Unified Lifecycle Completion)**: In the Production MVP slice (`003.1`), a merchant can take a customer (`Party`) through a mixed order (1 physical good `OfferingKind.PRODUCT` + 1 scheduled service `OfferingKind.SERVICE`), capture a 30% deposit via `PaymentPlan`/`PaymentAllocation`, track independent `INVENTORY` and `APPOINTMENT` segments in `FulfillmentPlan` with `PERFORMER`-submitted `CompletionEvidence`, and collect the 70% balance with zero manual re-entry across subsystems.
- **SC-002 (Single-VPS Concurrency, Memory & DR Baseline Verification)**: Under **100 concurrent** reservation and checkout requests against the same `resourceId` and the last unit of product stock, exactly 1 reservation succeeds per time window (`0` overlapping bookings), `InventoryBalance` matches the sum of `InventoryMovement` rows with **100% accuracy**, main application container peak memory stays **$\le 500\text{ MB}$ (`app RSS <= 500 MB`)**, and an automated backup/restore drill completes within **RTO $\le 60$ minutes** against a **$\le 24$-hour RPO** snapshot (`NFR-303`, `NFR-304`).
- **SC-003 (Exception Queue, Session Revocation & 3-Role Boundary Verification)**: **100%** of simulated operational exceptions surface in `OperatorActionView` within **2 seconds**, every administrative command records an individual `actorId` (`StaffMember.id`), revoking a `StaffSession` immediately returns HTTP 401 on subsequent calls, and automated RBAC tests confirm `PERFORMER` actors can update only assigned `FulfillmentSegment` / `CompletionEvidence` records while `OPERATOR` and `OWNER` permissions are strictly enforced.
- **SC-004 (Jurisdiction Neutrality & Single-Tenant Isolation Verification)**: Switching a deployment manifest between two distinct currencies (`USD` 2-decimal vs `JPY` 0-decimal), locales, and compliance profiles requires **0 lines of core code changes**, static/AST checks confirm **0 hardcoded country-code branches** in core domain modules, and schema verification confirms **100% single-tenant dedicated-DB isolation** (`0` shared-table `tenantId` leaks).
- **SC-005 (Read-Model & Agent Privacy Isolation)**: Automated security and redaction tests verify **0 bytes of raw customer PII** (`customerPhone`, `customerEmail`, `customerNotes`) or payment secrets appear in structured logs, AI telemetry records, or `Agent Read Pack` responses, and **0 mutation endpoints** are exposed on the read-only agent interface.
- **SC-006 (Portfolio AI Lab Reproducibility & Outage Resilience — Phase H)**: When the optional Engineering Lab workstream (`P-AI-001`–`P-AI-008`) is executed outside the `500 MB` commerce-core container budget, the benchmark produces a reproducible comparison between local `LM Studio` and cloud routes via `OmniRoute`, and the local-model outage drill proves that `CONFIDENTIAL` requests fail closed (**0 unauthorized cloud fallbacks**) while `commerce-core` availability remains **100% unaffected**.
