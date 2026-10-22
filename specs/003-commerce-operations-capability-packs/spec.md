# Feature Specification: Service Booking & Professional Portfolio Template

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom  
> "Обувать пизду в лапти." — Народная мудрость о художественном пиздеже вместо ТЗ  
> "Why don't you explain this to me like I'm five." — Майкл Скотт (_The Office_)  
> "Well, I didn't realize you had documentation." — Бабуленька (_Young Sheldon_)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Directory**: `specs/003-commerce-operations-capability-packs`  
**Legacy Alias**: `003-small-business-operations-kernel`  
**Created**: 2026-10-21  
**Status**: Updated analysis PASS; two independent external reviews remain required before implementation
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering), ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.4**
**Input**: Evolve the existing booking template (`001` + `002`) into a reusable, configurable service website for individual professionals and small service businesses. The first release adds public business and professional pages, portfolio galleries, service listings, appointment booking, and fixed three-role staff access. Product sales and expanded commerce operations remain future capability packs.

---

## 1. Executive Summary & Architectural Direction

### 1.1. Executive Summary & Delivery Boundary (Booking-First Scope + Single-Business Deployment + Single-VPS Baseline)

Feature 003 turns the existing booking foundation (`001` + `002`) into a **reusable website and appointment-booking template for individual service professionals and small service businesses**. The initial customer journey is: view the business or professional page, review services and portfolio work, choose an available time, and book an appointment. Medium businesses are a later target after the template has been validated with solo professionals and small teams.

The **Sprint B commercial envelope is $4,900 / 14 calendar days**, with one primary process and an optional zero-or-one external API integration agreed before work starts. Release `003.1` contains only the booking-first slice:
- **Production MVP Scope (`Q1`, updated)**: Public business and professional pages, portfolio items, service listings, available appointment slots, booking creation and staff-managed booking operations;
- **Fixed 3-Role Staff Model (`Q2 Option B`)**: `OWNER`, `OPERATOR`, `PERFORMER`;
- **Session-Based Staff Authentication (`Q3 Option B`)**: Individual `StaffMember` records linked to Better Auth identities and revocable, database-backed sessions managed by the maintained library; `ADMIN_TOKEN` is restricted to audited emergency break-glass use;
- **Reusable Single-Business Deployment**: one client business per deployment and dedicated PostgreSQL database. Each professional receives a public profile URL within that business site; independent employee-owned domains and profile portability between employers are later capabilities;
- **Configurable Template**: business name, branding, locale, timezone, and currency are deployment configuration. Core booking and profile logic MUST NOT contain country- or currency-specific branches;
- **Single-VPS Production Operational Baseline (`Q5 Option B`)**: `99.0% uptime`, `RTO <= 60 minutes`, `RPO <= 24 hours`, `100 concurrent booking requests`, and `app container RSS <= 500 MB`.

Feature 003 is partitioned into explicit delivery tiers:

1. **Release 003.1 — Booking & Professional Pages**: public business and specialist pages; portfolio and service lists; one-service appointment booking; schedules, exceptions, and conflict-safe reservations; three fixed staff roles with individual sessions; configurable brand, locale, timezone, and currency; and production readiness for a single-business deployment.
2. **Releases 003.2+ — Commerce and Optional Capability Packs**: product catalogue and sales, inventory, mixed goods-and-service orders, online payment providers and payment plans, fulfillment evidence, exception queue, quotes, documents, compliance, relationship operations, and read-only agent integrations.
3. **Non-Blocking Engineering AI Lab (`Phase H`)**: `LanguageModelGateway`, local `LM Studio` inference, `OmniRoute` sidecar gateway, `AiDataClass` routing, benchmark, outage drill, and private VPN workstation topology.

The first release supports one clear customer journey:

```text
business or professional page
  → profile, portfolio, and service details
  → available appointment times
  → customer contact details and booking request
  → confirmed appointment and staff schedule
```

The initial release supports scheduled services and prevents overlapping bookings for the same professional and time slot. Product sales, digital goods, bundles, custom quotes, inventory, and payment orchestration remain future capabilities.

The runtime architecture remains a **single modular monolith** (`MODULAR_MONOLITH`, `REPLICA_COUNT=1`, $\le 500\text{ MB RAM}$ for the production application container) backed by one PostgreSQL database per client deployment (`EXISTING_POSTGRES_DOMAIN`, `SINGLE_TENANT_DEDICATED_DB`). Future capability packs may be added behind validated deployment configuration; a runtime plugin system is not part of the first release.

Transactional entities are **never** exposed as unrestricted CRUD collections. Booking, profile publication, and staff mutations pass through typed application commands within PostgreSQL transactions. Public pages expose only explicitly published business and professional content; customer contact details and booking records remain private.

### 1.2. Differentiating Value Proposition ("One Recoverable Customer Promise")

Independent specialists and small service teams need a simple public place to show their work and let customers book available times. Their profile, service list, and booking calendar should work together and be reusable across different businesses, locales, timezones, and currencies.

Feature 003 is differentiated by a short, complete path from a specialist's public portfolio to a submitted appointment booking. The first release provides:
1. **A public business page** with configurable branding and service information;
2. **A public professional profile URL** with biography, services, and portfolio items;
3. **Location-aware appointment booking** with `IN_CALL`/`OUT_CALL` options, mode-specific prices, a fixed outcall travel fee when configured, and conflict-safe slot reservation;
4. **Three fixed staff roles** with individual, revocable accounts and a clear division of access;
5. **Currency-, locale-, and timezone-configurable presentation** without country-specific branches in core booking logic.

Product sales, payment orchestration, fulfillment, after-sales operations, and the optional AI Engineering Lab build on this base in later releases.

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
- **Standalone employee-owned domains and portable professional profiles that move between unrelated business deployments** (the MVP gives each professional a profile URL under the business site);
- **Product checkout, inventory management, mixed product-and-service carts, online payment processing, deposit/balance plans, and payment-provider integrations** (subsequent commerce release);
- **Medium-business operating workflows** until the template has been validated with individual professionals and small service teams;
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

- Q1: What is the mandatory production scope of Feature 003 within the Sprint B ($4,900 / 14 days) boundary? → A: **Updated decision — Release `003.1` delivers a public business page, public professional profiles with portfolio items and service lists, appointment availability and booking, three fixed staff roles with individual sessions, configurable branding/locale/timezone/currency, and production readiness for one business deployment. Full product sales, inventory, mixed carts, online payment orchestration, and the broad commerce-kernel migration move to later releases. The delivery includes one primary process (appointment booking) and at most one client-selected external API integration.**
- Q2: Which staff/operator role model is mandatory in the Production MVP? → A: **Option B — Three fixed roles (`OWNER`, `OPERATOR`, `PERFORMER`) enforced via static policy gates without a custom RBAC builder:**
  - `OWNER`: business and deployment configuration, staff access management, and full control of services, schedules, profiles, and bookings; an owner may also be assigned a bookable resource and perform their own appointments;
  - `OPERATOR`: day-to-day management of services, schedules, professional pages, and bookings, without access to owner-only deployment or staff-security settings;
  - `PERFORMER`: own public profile and portfolio, own availability and assigned bookings, without access to other staff or owner-only settings.
- Q3: How do staff members authenticate into administrative interfaces in the Production MVP? → A: **Option B — Individual staff records linked to Better Auth identities, with database-backed sessions managed by the maintained authentication library (`FR-325b`):**
  - No public self-registration; only `OWNER` creates or invites staff members;
  - Each staff member is assigned exactly one role (`OWNER`, `OPERATOR`, or `PERFORMER`); an `OWNER` can be configured as a bookable professional through an assigned resource;
  - Better Auth owns password verification, session creation, cookie handling, expiry, and revocation; the application maps each authenticated identity to one active `StaffMember` and applies its own fixed role checks;
  - An `OWNER` can revoke a staff member's sessions or deactivate that member, immediately blocking later requests;
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

### User Story 1 — Selling Physical Goods with Auditable Inventory Movements (Priority: P2 — Commerce Pack `003.2+`)

An individual entrepreneur or small merchant sells physical goods (`OfferingKind.PRODUCT`) with SKU variants from stock. When a customer orders a product and payment (or pay-on-site commitment) is accepted, inventory is reserved and committed exclusively through immutable `InventoryMovement` ledger entries (`RESERVE`, `COMMIT`, `RELEASE`, `ADJUSTMENT`, `RETURN`), and low-stock or out-of-stock conditions after payment automatically create an `OperatorAction` without rolling back accepted funds.

**Why this priority**: Product sales are a valuable extension for service businesses that also sell goods, but they are not required to launch the appointment-booking template.

**Independent Test**: Create a `PRODUCT` offering with initial stock `+5` via `InventoryMovement`. Place an order for quantity `2`. Verify `InventoryBalance` reflects `available = 3, reserved = 2`, commit on fulfillment transitions `onHand = 3, reserved = 0`, and simulate a concurrent payment on zero stock to verify `PAID_REQUIRES_RESOLUTION` + `OperatorAction` creation.

**Acceptance Scenarios**:
1. **Given** an active `PRODUCT` offering variant with `onHand = 5, reserved = 0`, **When** a customer places an order for quantity `2`, **Then** an `InventoryMovement` of type `RESERVE` is recorded in the same transaction, `available` becomes `3`, and `OrderLine` stores an immutable snapshot of `offeringNameSnapshot`, `unitAmountMinor`, `currency`, and tax fields.
2. **Given** two customers simultaneously paying for the last unit (`available = 1`), **When** the second payment webhook arrives after stock reaches `0`, **Then** the payment is recorded in `PaymentEvent` (`INV-002`), the order transitions to `PAID_REQUIRES_RESOLUTION`, and a high-severity `OperatorAction` (`OUT_OF_STOCK_AFTER_PAYMENT`) is enqueued for operator resolution.

---

### User Story 2 — Appointment Booking with Location & Resource Capacity (Priority: P1 — Production MVP)

A customer visits a business or professional page, chooses one service, chooses an enabled location mode—`IN_CALL` (customer visits the specialist) or `OUT_CALL` (specialist visits the customer)—and selects an available time. The page shows the applicable service price and any separate travel fee before submission. For `OUT_CALL`, the customer provides the service address. The system evaluates `WorkingSchedule`, `AvailabilityException`, service buffers, outcall travel buffers, and resource capacity (`StaffMember`, `Resource`), protecting reservations in PostgreSQL with the `slot_resource_no_overlap` GiST exclusion constraint. Multi-service baskets and automatic distance-based travel pricing are deferred.

**Why this priority**: Appointment booking is the single primary business process of the first release and the central value of the template for independent professionals and small service businesses.

**Independent Test**: Publish one professional profile and one `SERVICE` offering enabled for both modes. Verify the public page shows its `IN_CALL` and `OUT_CALL` prices and separate travel fee; create one booking in each mode, confirm the outcall address and price breakdown are stored with the booking, and verify configured outcall travel buffers prevent overlapping reservations. A concurrent overlapping request for the same `resourceId` must be rejected with HTTP 409 (`23P01`).

**Acceptance Scenarios**:
1. **Given** a published professional profile with one active service, **When** a customer views available times, **Then** only intervals that fit the service duration, configured buffers, working schedule, exceptions, and existing `HELD`/`BOOKED` reservations are returned.
2. **Given** an active `Reservation` on `resourceId = "master_1"` for `14:00–15:45`, **When** a concurrent transaction attempts to reserve `15:30–16:30` on `"master_1"`, **Then** the database GiST constraint rejects the overlap and the API returns HTTP 409 without corrupting state.
3. **Given** a service enabled for both `IN_CALL` and `OUT_CALL`, **When** a customer selects one mode, **Then** the booking uses that mode's displayed price, requires a service address only for `OUT_CALL`, and preserves the selected mode and price breakdown even if service prices are changed later.
4. **Given** an outcall booking whose configured travel buffer overlaps another appointment, **When** availability is queried or a concurrent booking is submitted, **Then** the conflicting interval is unavailable for the same resource.
5. **Given** a service that supports `OUT_CALL` and an address that cannot be checked automatically, **When** the customer submits a booking request, **Then** the booking remains pending until an owner or operator confirms the address is within coverage; rejecting it cancels the request and releases the slot.
6. **Given** an owner has not made the `IN_CALL` address public, **When** a customer books that service, **Then** the exact address is provided to that customer after booking but remains absent from public pages and unauthorized staff views.

### User Story 12 — Public Professional Pages & Portfolio (Priority: P1 — Production MVP)

An individual professional or small service business publishes a branded business page and a separate public page for each active professional. A professional page has its own URL under the business site, a profile, portfolio items, services, and a direct path to appointment booking. A `PERFORMER` can edit their own profile and portfolio; an `OWNER` or `OPERATOR` controls publication and business-level content. Public pages expose only published profile content and never expose customer records or private booking details.

**Why this priority**: A public profile with a portfolio gives an independent specialist a useful web presence and gives a customer the information needed to choose and book a professional.

**Independent Test**: Publish two professional profiles with distinct slugs, services, and portfolio items. Verify each public URL shows only its own published content and routes booking requests to that professional's resource; verify draft or deactivated profiles are not publicly visible.

**Acceptance Scenarios**:
1. **Given** an active `PERFORMER` with a published profile and portfolio items, **When** a visitor opens `/professionals/{slug}`, **Then** the page shows that professional's public profile, published portfolio, services, prices, and available booking action.
2. **Given** a `PERFORMER` edits their own profile, **When** they attempt to edit another professional's profile or publish business-level content, **Then** the system returns HTTP 403 and records no change.
3. **Given** a professional becomes inactive or their profile is unpublished, **When** a visitor opens the public URL, **Then** the page is unavailable and no customer or appointment details are returned.

---

### User Story 3 — Mixed Goods-and-Services Order & Segmented Fulfillment Plan (Priority: P2 — Commerce Pack `003.2+`)

A customer purchases a composite solution in a single order—for example, an air conditioner (`PRODUCT`) + local delivery (`DELIVERY`) + on-site installation appointment (`SERVICE` / `APPOINTMENT`), or a training course (`DIGITAL`) + 1-on-1 consultation (`SERVICE`). Payment is tracked at the order level via `PaymentPlan`, while execution is decomposed into a `FulfillmentPlan` with independent `FulfillmentSegment` records (`INVENTORY`, `APPOINTMENT`, `DIGITAL`, `DELIVERY`, `MANUAL_MILESTONE`) and per-segment `CompletionEvidence`.

**Why this priority**: It may serve businesses that sell products alongside appointments, after the booking-first template is validated.

**Independent Test**: Create an order containing 1 `PRODUCT` item and 1 `SERVICE` item (or a `BUNDLE` offering). Verify that a single `Order` is created with an `OrderLine` snapshot for each item and a `FulfillmentPlan` containing two segments: an `INVENTORY`/`DELIVERY` segment and an `APPOINTMENT` segment, each progressing independently to completion with attached `CompletionEvidence`.

**Acceptance Scenarios**:
1. **Given** an order containing both a physical product and a scheduled installation service, **When** the order is accepted, **Then** the system atomically reserves product inventory and holds the installation time slot, creating a `FulfillmentPlan` with separate `INVENTORY` and `APPOINTMENT` segments.
2. **Given** the delivery segment is completed on Tuesday and the technician (`StaffRole.PERFORMER`) finishes installation on Wednesday, **When** the authenticated technician uploads before/after photos and a serial number as `CompletionEvidence` on their assigned `APPOINTMENT` segment, **Then** the `FulfillmentPlan` transitions to `COMPLETED`, `AuditEvent` records the technician's `actorId`, and the order transitions to `FULFILLED`.

---

### User Story 4 — Deposit, Milestone & Balance Payment Plans with Explicit Allocations (Priority: P2 — Commerce Pack `003.2+`)

Instead of a binary `PAID`/`UNPAID` state, a business configures a `PaymentPlan` on an order (e.g., 30% prepayment deposit to confirm booking + 70% balance upon completion, or 3 project milestones). Every incoming `PaymentEvent` is allocated to a specific `PaymentMilestone` via `PaymentAllocation` (`US5`).

**Why this priority**: Deposits and online payment plans add provider, refund, and accounting work that can be scoped after the core booking flow is in use.

**Independent Test**: Create an order for `100,000` minor units with a 30% deposit milestone (`30,000`) and 70% completion milestone (`70,000`). Capture `30,000` online; verify the deposit milestone is `PAID`, reservation transitions to `BOOKED`, and `CashCommitmentView` shows `30,000` collected and `70,000` due at fulfillment.

**Acceptance Scenarios**:
1. **Given** an order with a `PaymentPlan` requiring a `30%` deposit before reservation confirmation and `70%` upon service completion, **When** the customer pays the `30%` deposit via an enabled `PaymentProvider`, **Then** a `PaymentAllocation` links the payment to Milestone 1, Milestone 1 becomes `PAID`, the slot reservation becomes `BOOKED`, and the order payment status reflects `PARTIALLY_PAID` with the remaining balance scheduled for Milestone 2.
2. **Given** a partially paid order that is amended or partially refunded, **When** a `RefundOperation` is executed, **Then** the refund is explicitly allocated against the corresponding `PaymentAllocation` without mutating historical `PaymentEvent` records.

---

### User Story 5 — Staff Access, Profile Management & Role-Bounded Booking Operations (Priority: P1 — Production MVP)

The `OWNER`, `OPERATOR`, and `PERFORMER` sign in with individual revocable sessions. The owner manages the business and may also take appointments using an assigned resource; the operator manages bookings and business content; each performer manages their own public profile and sees only their own schedule and bookings. The first release provides a focused booking workspace; the generalized `OperatorAction` queue and commerce exception handling are deferred.

**Why this priority**: Individual accounts and clear role boundaries are required for businesses with several professionals and for each professional to maintain their own public profile safely.

**Independent Test**: Authenticate as `OWNER`, provision an `OPERATOR` and a `PERFORMER`, verify Better Auth issues each an individual server-side session linked to the correct `StaffMember`. Verify the operator can manage bookings, the performer can view only their own bookings and edit their own profile, the owner can manage all staff and can take appointments when assigned a bookable resource, and revoking a session through Better Auth immediately invalidates subsequent requests with HTTP 401.

**Acceptance Scenarios**:
1. **Given** a public booking for an active professional, **When** the operator confirms, reschedules, or cancels it, **Then** the appointment and resource schedule update transactionally and the action records the staff `actorId`.
2. **Given** a `PERFORMER` with an active account, **When** they access the staff workspace, **Then** they can view only their own profile, availability, and assigned bookings and cannot change another staff member's data or business-wide settings.
3. **Given** an active `StaffMember` whose employment ends or whose device is compromised, **When** an `OWNER` revokes that identity's sessions through Better Auth or sets `active = false`, **Then** its sessions are immediately rejected without rotating credentials for other staff members.

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

A customer interacts with the business across multiple channels (website, Telegram, WhatsApp). When the later Relationship Pack is enabled, the system resolves those identifiers (`PartyIdentifier`, `ContactPoint`, `ChannelIdentity`) to a single `Party` (`PERSON` or `ORGANIZATION`) and can show a unified `PartyTimelineView`. An `OPERATOR` may then convert a chat message into a validated `Booking Draft` or `Quote Draft` and send a revocable `ContinuationLink` (`JourneyToken`) so the guest can continue in a browser without creating a password account.

**Why this priority**: Cross-channel history and chat-based booking drafts can reduce manual work after the basic public booking flow is validated.

**Independent Test**: After enabling the pack, resolve a customer's web and messaging identifiers, inspect the combined activity view, and continue a staff-approved booking draft in a browser session.

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

**Independent Test**: Load currency metadata from a maintained, versioned ISO 4217 registry and test representative minor-unit scales `0`, `2`, and `3` (for example, JPY, USD, and KWD). Verify each amount is stored using its configured minor-unit scale, payment-provider wire-scale differences are translated only by the provider adapter, and a simulated fiscal provider outage after payment creates an `OperatorAction` without rolling back the `PAID` state.

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
4. **Currencies and Units with Different Minor-Unit Rules (`JPY`, `KWD`, `XTR`)**:
   - *Scenario*: A deployment uses ISO 4217 currencies with different exponents, such as `JPY` (`minorUnit = 0`), `USD` (`minorUnit = 2`), or `KWD` (`minorUnit = 3`); non-ISO units such as `XTR` get an explicit application-defined scale.
   - *Resolution*: Canonical monetary values use `CurrencyMetadata.minorUnit`; the core never hardcodes `/ 100` or assumes 2 decimal places. A payment provider's different wire encoding is translated at its adapter and does not alter canonical stored amounts.
5. **Local Workstation VPN Disconnect During AI Extraction**:
   - *Scenario*: The VPS application host loses its private WireGuard/Tailscale VPN tunnel to the workstation running `OmniRoute` and `LM Studio`.
   - *Resolution*: `LanguageModelGateway` aborts on explicit request timeout ($\le 4\text{s}$ primary budget), respects `AbortSignal`, enforces `AiDataClass` fallback policy (failing closed for `CONFIDENTIAL` data), and never blocks core checkout, booking, or payment transactions.

---

## 3. Requirements _(mandatory)_

### 3.1. Functional Requirements (ISO/IEC/IEEE 29148:2018)

> **Scope Tier Legend (Updated 2026-10-22)**:
> - **`[MVP-CORE]`**: Reusable single-business template for a public business page, professional profile and portfolio pages, service listings, appointment booking, three fixed staff roles, and basic deployment configuration.
> - **`[PHASE-PACK]`**: Product sales, inventory, mixed carts, online payment processing, advanced operations, messaging channels, compliance adapters, and broader commerce migration.
> - **`[AI-LAB]`**: Independent non-blocking Portfolio AI Gateway & Local Inference Engineering Lab workstream (`Phase H: P-AI-001`–`P-AI-008`).

#### A. Unified Offering & Catalog Context (`Catalog`)
- **FR-301 (`[MVP-CORE]` Service Listing)**: System MUST let an authorized business staff member create, update, publish, unpublish, and order service listings with a name, description, duration, supported location modes, the applicable mode prices and active status. Product, bundle, digital, and custom-quote listings belong to later capability packs.
- **FR-302 (`[PHASE-PACK]` Product Catalog & Variants)**: When the Goods Pack is enabled, the system MUST support product variants, SKU/barcode, inventory, price lists, media, categories, and bundle composition.
- **FR-303 (`[MVP-CORE]` Currency Metadata Provider)**: System MUST resolve canonical amount scaling from a maintained, versioned ISO 4217 registry for fiat currencies and explicit configuration for non-ISO units such as `XTR`. It MUST NOT hardcode a supported-currency list or `minorUnit = 2`, assume missing metadata, or derive `transactionCurrency` from UI `locale`; unknown currency codes fail closed until configured. Payment-provider wire formats MUST be converted at the provider adapter and MUST NOT change canonical stored amounts.

#### B. Unified Party & Relationship Context (`Party` & `Relationship Pack`)
- **FR-304 (`[MVP-CORE]` Booking Customer Details)**: A booking MUST store the customer details needed to confirm and manage that appointment, using the existing customer model where possible. It MUST NOT require a messaging account or customer password.
- **FR-305 (`[PHASE-PACK]` Unified Party Activity Timeline)**: When the Relationship Pack is enabled, the system MUST project cross-channel customer interactions, bookings, orders, payments, and operator notes into a bounded activity view.
- **FR-306 (`[PHASE-PACK]` Operator Action Suggestions with Evidence)**: When the optional `Agent Action Suggestions` pack is enabled, the system MUST generate operator-facing `ActionSuggestion` records containing `evidence` (e.g., repeat purchase interval, open quote age, active consent status), `expectedOutcome`, `expiresAt`, and `requiresApproval = true`, and MUST NEVER execute suggested outreach or commercial mutations autonomously.

#### C. Dual Capacity Contract (`Capacity`: `Goods Pack` & `Services Pack`)
- **FR-307 (`[MVP-CORE]` Appointment Capacity)**: The booking flow MUST show only appointment slots allowed by the selected service duration, the assigned professional's availability, the business timezone, and existing reservations. Concurrent requests MUST NOT create overlapping bookings for the same resource.
- **FR-308 (`[PHASE-PACK]` Immutable Inventory Movement Ledger)**: Product stock MUST be changed only through append-only inventory movement records when the Goods Pack is enabled (`INV-003`).
- **FR-309 (`[MVP-CORE]` Service Schedules & Booking Rules)**: Staff MUST be able to configure working hours, days off, service duration, and optional before/after buffers. The system MUST reject unavailable and overlapping appointment slots.

#### D. Quotes, Orders, Snapshots & Change Requests (`Commercial Documents`)
- **FR-310 (`[PHASE-PACK]` Capacity-Aware Quote Lifecycle)**: When the `Quote Pack` (`Phase C`) is enabled, the system MUST support versioned `Quote` and `QuoteLine` entities with modes `INFORMATIONAL`, `PRICE_LOCKED`, `CAPACITY_HELD`, and `DEPOSIT_BACKED`, explicit `expiresAt`, and states `DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED | SUPERSEDED`.
- **FR-311 (`[PHASE-PACK]` Quote-to-Order Conversion & Re-Validation)**: Accepting a `Quote` MUST re-validate price, inventory/resource capacity, and active compliance providers inside a transaction and create an `Order` from the exact accepted `Quote` version snapshot (`INV-005`).
- **FR-312 (`[PHASE-PACK]` Immutable OrderLine Commercial Snapshots)**: When checkout is enabled, every `OrderLine` MUST persist immutable commercial snapshots (`INV-001`).
- **FR-313 (`[PHASE-PACK]` Pre-Acceptance Margin Guard)**: When the optional `Margin Guard` pack (`Phase C`) is enabled, quotes and custom orders MUST evaluate estimated direct costs (`materialCostMinor`, `staffCostMinor`, `deliveryCostMinor`, `paymentFeeEstimateMinor`) against the client's minimum contribution margin policy and require explicit `OWNER` approval before dispatch if the estimate falls below policy.
- **FR-314 (`[PHASE-PACK]` Auditable Order Change Requests)**: Post-acceptance modifications (rescheduling, item/variant swap, quantity change, partial cancellation) in `Phase D/E` MUST be processed via an immutable `ChangeRequest` entity storing `originalSnapshot`, `proposedSnapshot`, `priceDifferenceMinor`, `capacityDifference`, `paymentAdjustment`, and `approvalState` rather than destructive in-place edits of accepted order lines.

#### E. Payment Plans, Allocations, Neutral Documents & Refunds (`Documents Pack`)
- **FR-315 (`[PHASE-PACK]` Payment Plans & Allocations)**: When online payments are enabled, the system MUST allocate captured payments and refunds to explicit payment obligations.
- **FR-316 (`[PHASE-PACK]` Payment Provider Contract)**: Payment integrations MUST use a provider-neutral interface and select providers from deployment configuration; no payment provider is required for the booking-first release.
- **FR-317 (`[PHASE-PACK]` Neutral Commercial Documents & Reversals)**: When `Documents Pack` is enabled, the system MUST model business documents via `CommercialDocument` (`CommercialDocumentKind ∈ { QUOTE, ORDER_CONFIRMATION, PRO_FORMA, PAYMENT_REQUEST, RECEIPT, INVOICE, CREDIT_NOTE, DELIVERY_NOTE, SERVICE_COMPLETION }`), `CommercialDocumentLine`, `DocumentRender` (PDF snapshot), and `ExternalDocumentReference`, correcting issued financial documents exclusively through compensating `CREDIT_NOTE` / reversal records (`INV-006`, `INV-007`).

#### F. Segmented Fulfillment, Evidence & Post-Sale (`Fulfillment` & `Post-Sale Pack`)
- **FR-318 (`[PHASE-PACK]` Segmented Fulfillment)**: When goods or additional fulfillment modes are enabled, orders MUST support separately tracked fulfillment segments.
- **FR-319 (`[PHASE-PACK]` Fulfillment Evidence)**: When the operations pack is enabled, authorized staff MUST be able to attach completion evidence to fulfillment segments.
- **FR-320 (`[PHASE-PACK]` Order-Linked Warranty & Post-Sale Service Cases)**: When the `Warranty & Post-Sale` pack (`Phase E`) is enabled, operators MUST be able to open a `ServiceCase` (`RETURN_REQUEST`, `REPAIR_VISIT`, `REPLACEMENT`, `CUSTOMER_ISSUE`) directly from a fulfilled `Order` or `FulfillmentSegment`, preserving `WarrantyCoverage`, batch/variant snapshot, performer, and original `CompletionEvidence`.

#### G. Exception Queue, Conversation-to-Draft & Resumable Journeys (`Operations`)
- **FR-321 (`[PHASE-PACK]` Exception-Driven Operations Queue)**: When the advanced operations pack is enabled, recoverable workflow exceptions MUST create durable, auditable operator actions.
- **FR-322 (`[PHASE-PACK]` Operator-Approved Conversation-to-Draft)**: In `Phase E`, the system MUST allow operators to convert customer conversation messages into structured drafts (`Quote Draft`, `Cart Draft`, `Booking Draft`, `Payment Request`, `Order Amendment Proposal`) where application services validate real catalog prices and capacity and require operator approval before customer confirmation.
- **FR-323 (`[PHASE-PACK]` Resumable Guest Journeys Across Channels)**: In `Phase E`, the system MUST issue short-lived, single-use or revocable, HMAC-signed `ContinuationLink` tokens (`Journey`, `JourneyToken`, `DraftReference`) that allow a guest customer to start a deal in Telegram/WhatsApp and resume checkout or slot selection in a web browser (or vice versa) without revealing internal database IDs or requiring password accounts.
- **FR-324 (`[PHASE-PACK]` Limited-Connectivity Operator Draft Mode)**: Mobile/field operators MUST be able to view the last cached read snapshot and queue non-financial drafts (notes, `CompletionEvidence`, draft quotes) locally for explicit server reconciliation upon reconnect; offline payment capture and offline final slot locking are strictly prohibited.

#### H. Staff Role Model, Session Auth, Tenancy Boundary, Capability Packs, Read Models, Data Quality & Staged Import (`Governance`)
- **FR-325 (`[PHASE-PACK]` Compiled Capability Packs & Extension Contract)**: Optional capability packs MUST use a typed, build-time extension contract and validated deployment configuration; the first release does not require a dynamic plugin system.
- **FR-325a (`[MVP-CORE]` Fixed Three-Role Staff Authorization Model — Q2 Option B)**: The system MUST enforce exactly three staff roles in the first release, without a custom role builder:
  1. **`OWNER`**: Controls business settings, staff access, services, public pages, and all bookings. An owner who is also a professional may be linked to a bookable resource and manage their own professional page;
  2. **`OPERATOR`**: Manages services, professional pages, schedules, and customer bookings within the permissions granted by the business;
  3. **`PERFORMER`**: Views and updates their own profile, portfolio, availability, and assigned bookings; cannot change business-wide settings, manage other staff, or access another professional's private booking details.
- **FR-325b (`[MVP-CORE]` Individual Staff Accounts, Server-Side Sessions & Break-Glass `ADMIN_TOKEN` — Q3 Option B)**: Staff authentication MUST use the maintained Better Auth library with PostgreSQL-backed identities and sessions. `StaffMember` stores the application's role and active status and links to exactly one Better Auth identity; the application MUST NOT implement password hashing, session-token generation, cookie handling, or session storage itself:
  1. **No Self-Registration**: Public staff sign-up is disabled; only an authenticated `OWNER` or the initial deployment bootstrap can provision a staff identity and its linked `StaffMember` record;
  2. **Single Role Assignment**: Every active `StaffMember` has exactly one application `StaffRole` (`OWNER`, `OPERATOR`, or `PERFORMER`); the role is not taken from a client-controlled request or a public profile;
  3. **Session Revocation**: `OWNER` can revoke sessions for a specific staff identity or deactivate that `StaffMember`; every staff request checks session validity and active staff status before authorization;
  4. **Mandatory `actorId` Audit Attribution**: Every administrative change MUST record the authenticated `actorId` (`StaffMember.id`) and `actorRole` (`StaffRole`) in the audit log;
  5. **Library Security Settings**: Configure database-backed sessions, secure HTTP-only cookies, a finite session lifetime, and login rate limiting through Better Auth; authentication secrets and session values MUST NOT appear in logs;
  6. **Emergency Break-Glass `ADMIN_TOKEN`**: The static `ADMIN_TOKEN` is retained strictly as an emergency break-glass recovery credential (`actorId = "BREAK_GLASS_ADMIN_TOKEN"`, `actorRole = OWNER`) and MUST emit a dedicated high-severity audit record (`BREAK_GLASS_ADMIN_TOKEN_USED`) on every invocation.
- **FR-325c (`[MVP-CORE]` Single-Business Deployment Boundary — Q4 Option A)**: Each installed template and its database MUST serve one client business. Client data, settings, backups, and secrets MUST remain isolated per installation; shared-database multi-tenancy is outside the first release.
- **FR-326 (`[MVP-CORE]` Privacy-Safe Staff Views)**: Staff pages and APIs MUST return only the profile, availability, service, and booking information needed by the requesting role. `PERFORMER` access MUST be restricted to their own profile and assigned bookings, including access to customer service addresses only for bookings assigned to them. `OUT_CALL` customer addresses and non-public `IN_CALL` addresses MUST NOT appear in public listings/responses, logs, analytics, or agent read models, except that a booking-scoped confirmation response MAY show the exact service address to the customer who just created that booking. Changes MUST pass through validated application commands, and logs MUST exclude raw customer contact details.
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

#### K. Business & Professional Public Pages (`Public Template`)
- **FR-335 (`[MVP-CORE]` Business Page Configuration)**: An `OWNER` MUST be able to configure the business name, public description, logo or cover image, contact links, locale, timezone, one business currency, the service address used for `IN_CALL` appointments, and the business's `OUT_CALL` coverage description without changing application code. The owner MUST control whether the exact `IN_CALL` address is public or is shared only with the customer for their booking. A new template installation starts with `USD` as its editable setup value; the `OWNER` MUST confirm or change it to the business's actual currency before publishing live prices. The installation MUST support any configured ISO 4217 currency and explicitly configured non-ISO currency; currency MUST NOT be inferred from locale or drive country-specific branches in core logic.
- **FR-336 (`[MVP-CORE]` Professional Profile & Portfolio)**: Each business MUST be able to publish separate public pages for its professionals, with a stable URL under the business site, biography, photo, portfolio items, and that professional's active services. Public pages MUST not expose private customer or booking data. A `PERFORMER` may edit only their own public profile and portfolio; `OWNER` and `OPERATOR` may manage profiles within their business permissions.
- **FR-337 (`[MVP-CORE]` Appointment Booking Flow)**: A customer MUST be able to choose a service, choose an available professional or accept the business's default selection, select an enabled location mode, select an available slot, provide the required contact details and (for `OUT_CALL`) a service address, review the full price before submission, and submit or cancel a booking. Customer cancellation MUST require a valid, unexpired, single-use credential scoped to that booking and cancellation action; a booking ID alone MUST NOT authorize cancellation. The flow MUST work without a customer account, product cart, payment provider, or messaging integration.
- **FR-338 (`[MVP-CORE]` Service Location Modes)**: For each service, authorized staff MUST be able to enable `IN_CALL` (the customer visits the business's configured service address), `OUT_CALL` (the professional visits a customer-provided address), or both. The public booking flow MUST offer only enabled modes and MUST require a customer-provided service address only for `OUT_CALL`; for `IN_CALL`, the application uses the configured business service address and shares a non-public address with the customer only after the booking is created. It MUST show the configured outcall coverage description. Because the first release does not include maps, geocoding, or route checks, each `OUT_CALL` booking MUST remain pending until an `OWNER` or `OPERATOR` confirms the address is within the configured coverage area or rejects the request. The booking MUST apply configured outcall travel buffers to the same professional/resource availability. The first release MUST NOT require maps, geocoding, route optimization, or multiple business branches.
- **FR-339 (`[MVP-CORE]` Mode-Specific Price & Travel Fee)**: Each active service MUST have a price for every enabled mode. `OUT_CALL` MAY use a separate service-price override; if none is set, it uses the standard service price. An `OUT_CALL` booking MAY add a separate, non-negative fixed travel fee per appointment, shown as its own line. The total MUST equal the applicable service price plus the travel fee, use the configured business currency, and be shown before the customer submits the booking. The business MUST be able to set prices independently; the application MUST NOT assume or enforce that outcall is always more expensive. Distance, time, fuel, toll, or route-based fee calculation is outside the first release.

---

### 3.2. Hard Domain & Jurisdiction Invariants (`NON-NEGOTIABLE`)

#### Core Transactional Invariants (`INV-001` – `INV-015`)

For `003.1`, the active invariants are `INV-004` (no overlapping appointments), `INV-008` (validated application commands), `INV-010` (customer data privacy), and `INV-013` (one business per installation), plus the jurisdiction-neutral rules below. Invariants for orders, inventory, payments, refunds, compliance, and capability-pack history apply only when their later pack is enabled.
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
- **`INV-014`**: A public booking cancellation is authorized only by the booking's valid, unexpired, unused cancellation credential or by an authenticated staff session; the credential is action-scoped, stored only as a hash, rate-limited, and revoked after use or booking changes.
- **`INV-015`**: A new booking stores an immutable snapshot of its selected service, `IN_CALL`/`OUT_CALL` mode, service price, travel fee, and currency. The booking total equals the service price plus the travel fee; later catalog or settings changes never alter an existing booking's price. Historical reservations with no mode or price snapshot remain explicitly legacy/unknown and MUST NOT be assigned an inferred mode or address.

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

- **NFR-301 (Public Page & Availability Latency)**: Public business/professional pages and appointment availability queries MUST complete in **< 50 ms (p95)** and **< 120 ms (p99)** under the agreed standard load, excluding media delivery from the application server.
- **NFR-302 (Booking Command Latency)**: Booking create/cancel commands MUST complete in **< 250 ms (p95)** and **< 1,500 ms (p99)**, excluding external API latency.
- **Standard Load Profile for NFR-301/302**: Measure server-side handler time on a production-like single-VPS deployment with one business, 10 active professionals, 50 active services, 90 days of schedules/exceptions, and 5,000 existing reservations. Use 100 concurrent virtual clients for a 60-second warm-up followed by a 5-minute measurement window; each client repeatedly loads a public page, queries seven days of availability for both enabled location modes, and creates then cancels a booking on a distinct available slot, alternating `IN_CALL` and `OUT_CALL` where both are enabled. Use distinct outcall addresses from the configured test coverage area. Measure the 100-request same-slot contention case separately for integrity and memory; do not mix its expected conflict responses into normal booking latency. Exclude network transit, media delivery, and external-provider time. Record p95/p99 per operation, peak app RSS, and the test fixture/profile with the acceptance evidence.
- **NFR-303 (Container Memory Ceiling & Booking Concurrency — Q5 Option B)**: The production web application container (`REPLICA_COUNT=1`) MUST operate within **$\le 500\text{ MB RAM}$ (`app RSS <= 500 MB`)** peak RSS under **100 concurrent booking requests**. At most one client-selected external API integration is included; messaging bots and commerce packs are outside the first-release baseline.
- **NFR-304 (Single-VPS Production Availability & Disaster Recovery Baseline — Q5 Option B)**: Mandatory production MVP operational baseline for each dedicated client deployment is **99.0% uptime** on a single VPS; **RTO $\le 60$ minutes** via container restart and automated dump restoration drill; and **RPO $\le 24$ hours** via scheduled `pg_dump` + Restic backup (no Kubernetes, multi-node HA cluster, or continuous WAL PITR required; more frequent host snapshot intervals such as 6 hours remain supported as optional deployment overrides).
- **NFR-305 (Safe Additive Schema Evolution)**: First-release schema changes MUST be additive, preserve existing bookings and customer history, and have a reviewed recovery path. A broad commerce-kernel migration is outside `003.1` and requires its own reviewed plan.
- **NFR-306 (AI Gateway & Local Inference Latency Budget)**: In the Engineering Lab profile, `LanguageModelGateway` requests MUST enforce explicit `AbortSignal` timeouts (**4,000 ms** primary route budget, **3,000 ms** fallback route budget, **8,000 ms** total ceiling) and bounded concurrency so slow local inference never exhausts Node.js event-loop or database connections.
- **NFR-307 (Golden Evaluation Quality Gate)**: No model or prompt version in the Engineering Lab may be promoted to default route unless it achieves **100% Zod structured-output validity**, **0% PII leakage**, **100% prompt-injection refusal on adversarial test cases**, and **$\ge 90\%$ field-extraction accuracy** on the versioned golden dataset.

---

### 3.4. Regulatory & Compliance Screening _(ISO/IEC/IEEE 12207 Phase 0)_

- **Jurisdictions**: **Jurisdiction-Neutral Template Core** (adaptable per deployment to GDPR, 152-ФЗ, CCPA, UAE PDPL, Armenia SRC, EU VAT, or client-specified regimes via `JurisdictionProfile` and `RetentionProfile`).
- **Data Classification**:
  - `PUBLIC`: Active catalog offerings, public prices, store hours, an `IN_CALL` address only when the owner enables public display, and public knowledge base chunks.
  - `INTERNAL`: Redacted read models (`OrderSummaryView`, `OperatorActionView`, `CashCommitmentView`), aggregated telemetry.
  - `CONFIDENTIAL`: Customer-provided `OUT_CALL` service addresses, unredacted `Party` contact points (`customerPhone`, `customerEmail`), `customerNotes`, conversation transcripts, `CompletionEvidence` media, `MarginGuard` internal cost estimates, and a non-public `IN_CALL` address.
  - `RESTRICTED`: Payment provider secrets, webhook signing keys, Better Auth credentials and session data, break-glass `ADMIN_TOKEN`, raw payment card/wallet credentials (never stored in core DB; delegated to `PaymentProvider` hosted checkouts).
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
| **Spoofing** | Shared static admin tokens, forged `ContinuationLink` guest tokens, forged webhook callbacks, or unauthorized workstation access to AI Gateway | Better Auth identities and database-backed session cookies linked to active `StaffMember` records (`FR-325b`, no self-registration); `JourneyToken` and `MagicRescheduleLink` signed with HMAC-SHA256; `OmniRoute` + `LM Studio` bound to localhost/private WireGuard VPN subnet. |
| **Tampering** | Mutating historical order prices, altering issued invoices, or bypassing application invariants via admin/CRM/MCP direct DB writes | `INV-001` immutable `OrderLine` snapshots; `INV-007` reversal/credit-note-only corrections; `INV-008` strict ban on direct table writes from UI/Directus/MCP; CAS `scheduleVersion` guards on all state transitions. |
| **Repudiation** | Disputed order changes, manual margin overrides, unblocking blacklisted parties, or emergency `ADMIN_TOKEN` use | Every command emits an immutable `AuditEvent` and updates `OperatorAction.auditHistory` with individual `actorId` (`StaffMember.id`), `actorRole`, `reason`, and `timestamp`; emergency `ADMIN_TOKEN` calls emit a dedicated `BREAK_GLASS_ADMIN_TOKEN_USED` audit record (`FR-325b`). |
| **Information Disclosure** | Cross-client tenant leakage, leaking customer PII or an outcall address to public pages/logs/AI/MCP, or exposing a private business address | Physical single-tenant isolation (`1 deployment = 1 dedicated PostgreSQL DB`, `FR-325c` / `INV-013`); booking addresses are restricted to authorized staff for the relevant booking; business address publication follows the owner's visibility setting; `AiDataClass.CONFIDENTIAL` fails closed for local-only data; MCP reads only redacted projections; recursive `logger.ts` denylist. |
| **Denial of Service** | Malformed CSV imports, combinatorial bundle/slot queries, or stalled local LLM inference hanging the web server | Staged `ImportBatch` row/size limits; basket cap ($\le 10$ items, $\le 480$ min); `LanguageModelGateway` hard timeout ($\le 8\text{s}$ total) + concurrency limiter; durable outbox rate shaping; AI Lab isolated from `500 MB` commerce-core container (`NFR-303`). |
| **Elevation of Privilege** | `PERFORMER` attempting financial refunds/config edits, terminated staff retaining access, AI agent executing autonomous mutations, or arbitrary JS in `JurisdictionProfile.configJson` | Fixed 3-role RBAC (`OWNER > OPERATOR > PERFORMER`) enforced on every command and Staff Bot callback (`FR-325a`); per-identity Better Auth session revocation and active-staff checks (`FR-325b`); zero MCP mutation tools; `configJson` validated strictly via declarative Zod schemas. |

---

## 4. Key Entities, Bounded Contexts & Domain Contracts

### 4.1. Bounded Contexts Overview

**Release `003.1` needs only**:
1. **Business settings**: business name, branding, locale, timezone, configured currency, public contact links, service address and outcall coverage settings.
2. **Staff access**: Better Auth-managed identities and sessions linked to `StaffMember`, with exactly three application roles: `OWNER`, `OPERATOR`, `PERFORMER`.
3. **Professional pages**: `ProfessionalProfile`, `ProfessionalService`, and `PortfolioItem`, with publication and ownership checks.
4. **Service booking**: service listings, `IN_CALL`/`OUT_CALL` modes, mode-specific price and travel-fee snapshots, bookable staff/resources, working hours, exceptions, availability, and the existing appointment/reservation record.
5. **Privacy-safe views and audit**: public profile data, staff booking views, and attribution for administrative changes.

**Later packs may add**: `Party` and cross-channel identity, product inventory, mixed orders, payment plans and refunds, segmented fulfillment, advanced operator queues, messaging, compliance, imports, read-only agent access, and the optional AI Lab. These entities are not blockers for `003.1`.

---

### 4.2. Expanded Domain Model Reference (Includes Future Packs)

The following schema sketch is the long-term domain reference for Feature 003, not a list of tables required by the first release. The `003.1` schema changes are limited to the business/profile/service/booking/staff data described in `data_model.md` and additive updates to existing tables.

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
  authUserId     String         @unique // Better Auth user ID
  displayName    String
  role           StaffRole      @default(PERFORMER)
  telegramUserId String?        @unique
  resourceId     String?
  invitedById    String?
  active         Boolean        @default(true)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
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
| **`Core Pack`** | **Production MVP (`003.1`)** | **Always Enabled** | One-business installation, staff sessions and fixed three-role access, business page settings, locale/timezone/configured currency, service catalog, booking, privacy-safe staff views, and single-VPS production readiness |
| **`Professional Profile Pack`** | **Production MVP (`003.1`)** | **Always Enabled** | Public profile page for each professional under the business site, biography, portfolio items, associated services, publication controls, and profile-scoped editing permissions |
| **`Services Booking Pack`** | **Production MVP (`003.1`)** | **Always Enabled** | `Resource`, working hours, exceptions/days off, service duration and buffers, availability lookup, appointment create/cancel, and prevention of overlapping bookings |
| **`Goods Pack`** | **Subsequent Phase (`003.2+`)** | Configurable (`false`) | Product variants, SKU/barcode, `InventoryBalance`, `InventoryMovement`, stock reservation, low-stock operations, pickup/delivery modes, optional `markingCode` reference |
| **`Checkout & Payments Pack`** | **Subsequent Phase (`003.2+`)** | Configurable (`false`) | Product checkout, mixed goods-and-service baskets, online payment providers, payment plans, refunds, payment webhooks, and provider-specific currency conversion |
| **`Operations & Messenger Packs`** | **Subsequent Phase (`003.2+`)** | Configurable (`false`) | Advanced exception queue, Telegram/WhatsApp bots, automated notifications, conversation-to-draft, resumable journeys, and offline operations |
| **`Quote Pack`** | **Subsequent Phase (`Phase C`)** | Configurable (`false`) | Versioned `Quote` & `QuoteLine`, `INFORMATIONAL`/`PRICE_LOCKED`/`CAPACITY_HELD`/`DEPOSIT_BACKED` modes, quote-to-order conversion, optional `MarginGuard` |
| **`Documents & Compliance Pack`** | **Subsequent Phase (`Phase D/F`)** | Configurable (`false`) | `CommercialDocument`, `DocumentRender` PDF snapshot, `NumberingProfile`, `CREDIT_NOTE` reversals, `JurisdictionProfile`, and narrow compliance provider adapters |
| **`Relationship & Ops Extensions`** | **Subsequent Phase (`Phase E`)** | Configurable (`false`) | Conversation-to-draft, resumable `Journey` links, `ChangeRequest`, `Warranty & Post-Sale` (`ServiceCase`), `DataQualityIssue` scanner, quarantined `ImportBatch`, `ActionSuggestion`, limited-connectivity draft mode |
| **`Agent Read Pack`** | **Subsequent Spike (`Phase G`)** | **Disabled by Default** (`false`) | Read-only MCP & projection query surface (`CatalogSearchView`, `AvailabilityView`, `OrderSummaryView`, `OperatorActionView`, knowledge search); **zero mutation tools** |
| **`Engineering AI Lab`** | **Portfolio Workstream (`Phase H`)** | **Optional Lab Profile** (`false`) | `LanguageModelGateway`, local `LM Studio` inference profile, `OmniRoute` AI Gateway sidecar, `AiDataClass` routing policies, redacted OTel telemetry, golden-dataset benchmark & local outage drill (`P-AI-001`–`P-AI-008`, isolated from 500 MB commerce-core container) |

---

### 4.5. Mandatory Phased Implementation Order (Option B Partitioning)

Implementation MUST follow strict domain-first sequencing (never starting with cosmetic dashboards, Kanban boards, PDF designers, or MCP servers before transactional invariants exist):

#### Tier 1 — Mandatory Production MVP Scope (Sprint B Deliverable `003.1`)
- **Phase A (Reusable Template & Access)**: One-business deployment, business branding and locale/timezone/currency settings, fixed `OWNER`/`OPERATOR`/`PERFORMER` roles, individual staff access, and additive migrations needed for the public pages and booking flow.
- **Phase B (Professional Pages & Service Listings)**: Public business page, published professional profile pages and portfolios under the business site, service listings, and role-bounded profile editing.
- **Phase C (Appointment Booking)**: Customer service selection, professional selection, availability, booking creation/cancellation, schedule exceptions and buffers, and protection against overlapping bookings.
- **Production readiness**: Security and privacy checks, backup/restore drill, and the single-VPS baseline. The booking flow works without an external provider; each client may select at most one external API integration before work starts.

#### Tier 2 — Subsequent Independent Capability Pack Phases (`003.2+`)
- **Commerce Pack (`003.2+`)**: Goods catalog, inventory, product checkout, mixed carts, online payments, payment plans, refunds, quotes, and commercial documents.
- **Operations & Integrations Packs (`003.2+`)**: Advanced operator queue, Telegram/WhatsApp, conversation-to-draft, resumable journeys, offline operations, compliance providers, and imports.
- **Phase G (`Agent Read Pack`)**: Disposable/read-only MCP spike consuming redacted read models (governed by Constitution Principle XI).

#### Tier 3 — Non-Blocking Portfolio Engineering Lab Workstream (`Phase H`)
- **Phase H (`P-AI-001` – `P-AI-008`)**: Portfolio AI Gateway (`LanguageModelGateway`), `LM Studio` local inference profile, `OmniRoute` sidecar configuration, redacted AI telemetry, golden-dataset benchmark, local-model outage drill, and private VPN workstation documentation.

---

## 5. Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001 (Public Pages & Booking Journey)**: A business can publish its public page, publish a professional page with portfolio and services, and receive `IN_CALL` and/or `OUT_CALL` booking requests from the public site without requiring an account or payment provider; customers see the mode-specific service price and any travel fee before booking, outcall requests remain pending until coverage is confirmed, and each booking appears in the staff view with the correct professional, mode, time, price snapshot, and authorized location details.
- **SC-002 (Single-VPS Booking Concurrency, Memory & DR Baseline)**: Under **100 concurrent** booking requests for overlapping slots on the same resource, no more than one booking succeeds for each unavailable interval; the app remains within **500 MB RSS**, and a backup/restore drill meets **RTO ≤ 60 minutes** and **RPO ≤ 24 hours** (`NFR-303`, `NFR-304`).
- **SC-003 (Three-Role Boundary Verification)**: Session revocation immediately blocks subsequent requests; `PERFORMER` can edit only their own public profile and portfolio and can access only assigned bookings, `OPERATOR` can manage permitted service and booking operations, and `OWNER` can manage the business and staff settings.
- **SC-004 (Configuration Neutrality & Single-Business Isolation)**: Changing a deployment's configured currency, locale, and timezone—including currencies with different minor-unit scales and an explicitly configured non-ISO currency—requires **0 lines of core code changes**. Static checks find **0 hardcoded country-code branches** in core booking modules, and each installation stores only one business's data.
- **SC-005 (Privacy)**: Public pages expose no customer or appointment data; staff APIs enforce the role boundary and logs contain no raw customer contact details. The read-only agent interface is evaluated only if its later pack is enabled.
- **SC-006 (Portfolio AI Lab Reproducibility & Outage Resilience — Phase H)**: When the optional Engineering Lab workstream (`P-AI-001`–`P-AI-008`) is executed outside the `500 MB` commerce-core container budget, the benchmark produces a reproducible comparison between local `LM Studio` and cloud routes via `OmniRoute`, and the local-model outage drill proves that `CONFIDENTIAL` requests fail closed (**0 unauthorized cloud fallbacks**) while `commerce-core` availability remains **100% unaffected**.
