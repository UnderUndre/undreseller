# Booking-First Template Data Model (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Database Engine**: PostgreSQL 16 + `btree_gist` (Single-Tenant Dedicated Database per Client Deployment — `Q4 Option A`)  
**ORM**: Prisma 6.4.1 (`DATABASE_URL` pooled `connection_limit=10`, `DIRECT_URL` for guarded migrations)

---

## 1. Data Classification & Trust Boundaries

Every entity and field in `003` is classified under one of four sensitivity tiers (`Spec §3.4`):

| Data Class | Storage & Logging Rules | AI / MCP Exposure Policy | Representative Entities & Fields |
| :--- | :--- | :--- | :--- |
| **`PUBLIC`** | Plaintext in PostgreSQL; cacheable; safe in public API responses | Allowed on `local` and `official-api-key` routes | `Offering`, `OfferingVariant`, `Price`, `CurrencyMetadata`, `WorkingSchedule`, `KnowledgeChunk`, and `IN_CALL` address when public display is enabled |
| **`INTERNAL`** | Plaintext in PostgreSQL; structured logs allowed (redacted of PII) | Allowed via redacted read models (`OrderSummaryView`, `OperatorActionView`, `AvailabilityView`) | `InventoryBalance`, `InventoryMovement`, `Reservation`, `FulfillmentPlan`, `FulfillmentSegment`, `OperatorAction`, `AuditEvent` |
| **`CONFIDENTIAL`** | Plaintext/bounded in dedicated single-tenant PostgreSQL; **strictly forbidden** in logs, analytics, and idempotency keys (`INV-010`) | **Local-only (`LM Studio`)**; fails closed if local runtime is unavailable; **never** exposed in `Agent Read Pack` | Customer-provided `OUT_CALL` addresses, non-public `IN_CALL` address snapshots, `Party.displayName`, `ContactPoint.value` (`phone`, `email`), `PartyNote`, `Order.customerPhone`, `Order.customerEmail`, `Order.customerNotes`, `CompletionEvidence`, `MarginGuard` cost fields |
| **`RESTRICTED`** | Managed by the authentication library or stored only in host `.env`; one-time cancellation secrets are stored as SHA-256 hashes; raw payment credentials never touch core DB | **Prohibited** from all AI and read-model surfaces | Better Auth credential/session fields, `SlotReservation.cancellationTokenHash`, `JourneyToken.tokenHash`, `ADMIN_TOKEN`, webhook secrets |

---

## 2. Production MVP (`003.1`) Entities & Prisma Schema Contracts

### 2.1. Staff Authentication, Roles & Sessions (`[MVP-CORE]` — `FR-325a`, `FR-325b`)

Better Auth owns its generated identity, credential, account, and database-session tables. Generate those tables from the pinned library version using its supported Prisma integration; do not define a parallel `StaffSession` table or application-owned password/session fields. The application role remains in `StaffMember` and is never inferred from Better Auth metadata.

```prisma
enum StaffRole {
  OWNER
  OPERATOR
  PERFORMER
}

model StaffMember {
  id             String         @id @default(uuid())
  authUserId     String         @unique // Better Auth user ID
  displayName    String
  role           StaffRole      @default(PERFORMER)
  telegramUserId String?        @unique // Reserved for a later messaging integration
  resourceId     String?        @unique // Any bookable staff member can own a Resource, including OWNER
  resource       Resource?      @relation(fields: [resourceId], references: [id])
  professionalProfile ProfessionalProfile?
  invitedById    String?
  active         Boolean        @default(true)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([role, active])
}
```

### 2.2. Booking Customer Details (`[MVP-CORE]` — `FR-304`)

The first release stores only customer details required to confirm and manage a booking. Reuse the existing customer/booking tables where possible. The `Party`, cross-channel identity, notes, tags, and unified timeline models shown here are a later Relationship Pack and MUST NOT be added solely for `003.1`.

```prisma
enum PartyKind {
  PERSON
  ORGANIZATION
}

enum ChannelKind {
  TELEGRAM
  WHATSAPP
  WEB
  EMAIL
  PHONE
}

model Party {
  id                  String            @id @default(uuid())
  kind                PartyKind         @default(PERSON)
  displayName         String            // Confidential
  organizationId      String?
  isBlocked           Boolean           @default(false)
  blockedReason       String?
  blockedAt           DateTime?
  blockedByStaffId    String?
  identifiers         PartyIdentifier[]
  contactPoints       ContactPoint[]
  channelIdentities   ChannelIdentity[]
  notes               PartyNote[]
  tags                PartyTag[]
  orders              Order[]
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  @@index([isBlocked])
}

model PartyIdentifier {
  id         String    @id @default(uuid())
  partyId    String
  party      Party     @relation(fields: [partyId], references: [id], onDelete: Cascade)
  scheme     String    // e.g., "TELEGRAM_USER_ID", "PHONE_E164", "TAX_ID", "LEGACY_MESSENGER_CONTACT_ID"
  value      String    // Confidential
  verifiedAt DateTime?
  createdAt  DateTime  @default(now())

  @@unique([scheme, value])
  @@index([partyId])
}

model ContactPoint {
  id                String    @id @default(uuid())
  partyId           String
  party             Party     @relation(fields: [partyId], references: [id], onDelete: Cascade)
  kind              ChannelKind
  value             String    // E.164 phone, email, or @username (Confidential)
  isPrimary         Boolean   @default(false)
  hasWhatsApp       Boolean   @default(false)
  hasTelegram       Boolean   @default(false)
  verifiedAt        DateTime?
  phoneRiskFlagged  Boolean   @default(false)
  phoneRiskExpiresAt DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([partyId, kind])
  @@index([value])
}

model ChannelIdentity {
  id              String      @id @default(uuid())
  partyId         String
  party           Party       @relation(fields: [partyId], references: [id], onDelete: Cascade)
  channel         ChannelKind
  externalUserId  String      // e.g., Telegram chat/user ID
  username        String?
  optedOut        Boolean     @default(false)
  lastInteraction DateTime?
  createdAt       DateTime    @default(now())

  @@unique([channel, externalUserId])
  @@index([partyId])
}

model PartyNote {
  id            String   @id @default(uuid())
  partyId       String
  party         Party    @relation(fields: [partyId], references: [id], onDelete: Cascade)
  authorStaffId String
  content       String   // Confidential
  createdAt     DateTime @default(now())

  @@index([partyId, createdAt])
}

model PartyTag {
  id        String   @id @default(uuid())
  partyId   String
  party     Party    @relation(fields: [partyId], references: [id], onDelete: Cascade)
  tag       String
  createdAt DateTime @default(now())

  @@unique([partyId, tag])
}
```

### 2.3. Service Listings & Currency Configuration (`[MVP-CORE]` — `FR-301`, `FR-303`, `FR-335`)

The existing business settings record gains `businessServiceAddress`, `businessServiceAddressPublic` (default `false`), and `outCallCoverageDescription`. Require a service address when any active service supports `IN_CALL`; expose it publicly only when the owner enables that setting. The coverage description is public and does not imply automatic geocoding or distance checks.

```prisma
enum ServiceFulfillmentMode {
  IN_CALL
  OUT_CALL
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

model CurrencyMetadata {
  code      String   @id // ISO 4217 code or explicitly configured non-ISO code, e.g., XTR
  minorUnit Int      // ISO 4217 exponent for fiat currencies; configured scale for non-ISO units; PSP wire formats are adapter-specific
  symbol    String
  active    Boolean  @default(true)
  updatedAt DateTime @updatedAt
}

model Offering {
  id            String            @id @default(uuid())
  legacyItemId  String?           @unique // Optional link to an existing service record
  slug          String            @unique
  kind          OfferingKind      @default(SERVICE) // MVP publishes services; other kinds are later packs
  name          String
  description   String?
  active        Boolean           @default(true)
  taxCategoryId String?
  priceMode     PriceMode         @default(FIXED)
  variants      OfferingVariant[]
  servicePolicy ServicePolicy?
  professionalProfiles ProfessionalService[]
  bundleItems   BundleComponent[] @relation("ParentBundle")
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([kind, active])
}

model OfferingVariant {
  id                String              @id @default(uuid())
  offeringId        String
  offering          Offering            @relation(fields: [offeringId], references: [id], onDelete: Cascade)
  sku               String              @unique
  title             String
  attributesJson    Json                @default("{}")
  unitAmountMinor   BigInt
  currency          String // Copy the configured business currency; new template setup starts at USD and the owner confirms/changes it before live prices
  outCallPriceMinor BigInt? // Optional OUT_CALL service-price override, excluding travel fee
  outCallTravelFeeMinor BigInt @default(0) // Fixed per-booking travel fee in the same currency
  starsPrice        Int?
  active            Boolean             @default(true)
  inventoryBalance  InventoryBalance?
  inventoryMovements InventoryMovement[]
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@index([offeringId, active])
}

model ServicePolicy {
  id                  String   @id @default(uuid())
  offeringId          String   @unique
  offering            Offering @relation(fields: [offeringId], references: [id], onDelete: Cascade)
  durationMin         Int      // 1..480
  bufferBeforeMin     Int      @default(0)
  bufferAfterMin      Int      @default(0)
  cancellationCutoffHours Int  @default(3)
  inCallEnabled       Boolean  @default(true)
  outCallEnabled      Boolean  @default(false)
  outCallTravelBeforeMin Int    @default(0) // Applied only to OUT_CALL resource availability
  outCallTravelAfterMin  Int    @default(0)
}

// `OfferingVariant.unitAmountMinor` is the `IN_CALL` service price. For `OUT_CALL`,
// use `outCallPriceMinor` when set, otherwise use `unitAmountMinor`, then add
// `outCallTravelFeeMinor`. The fixed fee uses the business currency.

model ProfessionalProfile {
  id             String              @id @default(uuid())
  staffMemberId  String              @unique
  staffMember    StaffMember         @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  slug           String              @unique
  headline       String?
  biography      String?
  photoUrl       String?
  isPublished    Boolean             @default(false)
  services       ProfessionalService[]
  portfolioItems PortfolioItem[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
}

model ProfessionalService {
  professionalProfileId String
  professionalProfile   ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  offeringId            String
  offering              Offering            @relation(fields: [offeringId], references: [id], onDelete: Cascade)

  @@id([professionalProfileId, offeringId])
}

model PortfolioItem {
  id                     String              @id @default(uuid())
  professionalProfileId  String
  professionalProfile    ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  title                  String
  description            String?
  mediaUrl               String
  sortOrder              Int                 @default(0)
  isPublished            Boolean             @default(false)
  createdAt              DateTime            @default(now())
  updatedAt              DateTime            @updatedAt

  @@index([professionalProfileId, isPublished, sortOrder])
}

model BundleComponent {
  id                String   @id @default(uuid())
  bundleOfferingId  String
  bundleOffering    Offering @relation("ParentBundle", fields: [bundleOfferingId], references: [id], onDelete: Cascade)
  childOfferingId   String
  childVariantId    String?
  quantity          Decimal  @default(1)
}
```

`OfferingVariant.unitAmountMinor` is the `IN_CALL` service price. For `OUT_CALL`, use `outCallPriceMinor` when set, otherwise use `unitAmountMinor`, then add `outCallTravelFeeMinor`. The fee is fixed per booking and cannot use a currency different from the configured business currency.

### 2.4. Appointment Capacity (`[MVP-CORE]` — `FR-307`, `FR-309`)

Only `Resource`, working hours, date exceptions, service duration/buffers, and overlap-safe appointment reservations are required in `003.1`. The inventory models below belong to the later Goods Pack and MUST NOT block the booking release.

```prisma
enum InventoryMovementKind {
  INITIAL
  RESERVE
  COMMIT
  RELEASE
  ADJUSTMENT
  RETURN
  DAMAGE
}

model InventoryBalance {
  variantId   String          @id
  variant     OfferingVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  onHand      Int             @default(0)
  reserved    Int             @default(0)
  available   Int             @default(0) // Invariant: available == onHand - reserved
  updatedAt   DateTime        @updatedAt
}

model InventoryMovement {
  id             String                @id @default(uuid())
  variantId      String
  variant        OfferingVariant       @relation(fields: [variantId], references: [id], onDelete: Restrict)
  orderId        String?
  kind           InventoryMovementKind
  quantityDelta  Int                   // Signed integer delta
  reason         String?
  markingCode    String?               // Optional serialization/marking code reference
  actorStaffId   String?
  idempotencyKey String                @unique
  createdAt      DateTime              @default(now())

  @@index([variantId, createdAt])
  @@index([orderId])
}

model Resource {
  id          String                  @id
  name        String
  kind        String                  @default("STAFF") // "STAFF" | "ROOM" | "EQUIPMENT"
  active      Boolean                 @default(true)
  staffMember StaffMember?
  exceptions  AvailabilityException[]
  createdAt   DateTime                @default(now())
}

model AvailabilityException {
  id          String   @id @default(uuid())
  resourceId  String
  resource    Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  date        String   // YYYY-MM-DD in shop timezone
  isClosed    Boolean  @default(false)
  startMin    Int?     // Override start minute from midnight
  endMin      Int?     // Override end minute from midnight
  reason      String?
  createdAt   DateTime @default(now())

  @@unique([resourceId, date])
}
```
`SlotReservation` from `002` remains the stored booking record and is not renamed in this release. Add the following nullable fields where absent. Existing rows remain null for mode, price, and address; do not infer these values from the current service or settings.

```prisma
// Schema delta on the existing SlotReservation model
cancellationTokenHash        String?   @unique // SHA-256 of a random 32-byte token; raw token is never stored
cancellationTokenExpiresAt   DateTime?
cancellationTokenConsumedAt  DateTime?
cancellationTokenRevokedAt   DateTime?
fulfillmentMode              ServiceFulfillmentMode?
servicePriceMinor            Int? // Immutable service-price snapshot in linked Order.currency
travelFeeMinor               Int? // Immutable travel-fee snapshot; zero for IN_CALL
serviceAddressSnapshot       String? // OUT_CALL customer address or IN_CALL address at booking time
```

New bookings must always set a mode, price snapshots, and service-address snapshot. `Order.totalMinor` must equal `servicePriceMinor + travelFeeMinor`, and `Order.currency` must equal the configured business currency. `serviceAddressSnapshot` contains the customer-provided address for `OUT_CALL` and the configured business service address for `IN_CALL`. The latter may appear on public pages only when the owner enables public display; otherwise, show it only to that booking's customer and authorized staff. `OUT_CALL` addresses remain confidential and are shown only to that booking's customer and authorized staff. Never include either address in logs, analytics, or public profile data. Since the first release has no automatic outcall coverage check, new `OUT_CALL` requests reuse the existing `Order.confirmationStatus = PENDING_STAFF_REVIEW` and `SlotReservation.status = HELD` flow; an authorized owner or operator confirms coverage or rejects the booking. Confirmation uses the existing `STAFF_APPROVED` / `BOOKED` states; rejection uses `Order.status = CANCELLED` with `cancellationReason = STAFF_REJECTED` and releases the reservation. Legacy reservations keep null mode, address, and price snapshots; do not add a new status enum for location review.

Map the retained reservation to the resource schedule with `resourceId`, `startTime`, `endTime`, `totalDurationMin`, `bufferBeforeMin`, `bufferAfterMin`, and the PostgreSQL GiST exclusion constraint `slot_resource_no_overlap`. Existing reservations and their customer/order history remain in place.

### 2.5. Commerce, Payment & Fulfillment Models (`[PHASE-PACK]` — `FR-312`, `FR-315`–`FR-319`)

The following commerce models describe later packs. They are not prerequisites for the booking-first release, which reuses the existing appointment and customer records.

```prisma
enum PaymentPlanStatus {
  PENDING
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
}

enum PaymentMilestoneKind {
  DEPOSIT
  MILESTONE
  BALANCE
  ON_SITE
}

enum PaymentMilestoneStatus {
  PENDING
  PARTIALLY_PAID
  PAID
  WAIVED
  REFUNDED
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

enum FulfillmentSegmentStatus {
  PENDING
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  FAILED
}

model OrderLine {
  id                    String   @id @default(uuid())
  orderId               String
  order                 Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  legacyOrderItemId     String?  @unique
  offeringId            String?
  variantId             String?
  offeringKindSnapshot  OfferingKind @default(SERVICE)
  offeringNameSnapshot  String
  variantNameSnapshot   String?
  quantity              Decimal  @default(1)
  unitAmountMinor       BigInt
  currency              String
  discountMinor         BigInt   @default(0)
  netAmountMinor        BigInt
  taxAmountMinor        BigInt   @default(0)
  grossAmountMinor      BigInt
  taxCategoryCode       String?
  taxRateSnapshot       Decimal?
  taxProviderReference  String?
  durationMinSnapshot   Int?
  createdAt             DateTime @default(now())

  @@index([orderId])
}

model PaymentPlan {
  id              String             @id @default(uuid())
  orderId         String             @unique
  order           Order              @relation(fields: [orderId], references: [id], onDelete: Cascade)
  currency        String
  totalAmountMinor BigInt
  paidAmountMinor BigInt             @default(0)
  status          PaymentPlanStatus  @default(PENDING)
  milestones      PaymentMilestone[]
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
}

model PaymentMilestone {
  id              String                 @id @default(uuid())
  paymentPlanId   String
  paymentPlan     PaymentPlan            @relation(fields: [paymentPlanId], references: [id], onDelete: Cascade)
  sequence        Int                    @default(1)
  kind            PaymentMilestoneKind
  title           String
  amountMinor     BigInt
  paidAmountMinor BigInt                 @default(0)
  dueAt           DateTime?
  status          PaymentMilestoneStatus @default(PENDING)
  allocations     PaymentAllocation[]
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  @@index([paymentPlanId, sequence])
}

model PaymentAllocation {
  id                 String           @id @default(uuid())
  milestoneId        String
  milestone          PaymentMilestone @relation(fields: [milestoneId], references: [id], onDelete: Restrict)
  paymentEventId     String?
  refundOperationId  String?
  allocatedMinor     BigInt           // Positive for payment capture, negative/linked for refund allocation
  currency           String
  createdAt          DateTime         @default(now())

  @@index([milestoneId])
  @@index([paymentEventId])
  @@index([refundOperationId])
}

model FulfillmentPlan {
  id        String                @id @default(uuid())
  orderId   String                @unique
  order     Order                 @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status    FulfillmentPlanStatus @default(PENDING)
  segments  FulfillmentSegment[]
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt
}

model FulfillmentSegment {
  id                   String                   @id @default(uuid())
  fulfillmentPlanId    String
  fulfillmentPlan      FulfillmentPlan          @relation(fields: [fulfillmentPlanId], references: [id], onDelete: Cascade)
  orderLineId          String?
  kind                 FulfillmentSegmentKind
  providerMode         String                   @default("SERVICE_ON_SITE")
  status               FulfillmentSegmentStatus @default(PENDING)
  assignedStaffId      String?                  // Links to StaffMember (PERFORMER)
  reservationId        String?                  // Links to SlotReservation for APPOINTMENT segments
  inventoryMovementId  String?                  // Links to InventoryMovement for INVENTORY segments
  scheduledStartAt     DateTime?
  scheduledEndAt       DateTime?
  completedAt          DateTime?
  evidence             CompletionEvidence[]
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt

  @@index([fulfillmentPlanId])
  @@index([assignedStaffId, status])
}

model CompletionEvidence {
  id                   String             @id @default(uuid())
  fulfillmentSegmentId String
  fulfillmentSegment   FulfillmentSegment @relation(fields: [fulfillmentSegmentId], references: [id], onDelete: Cascade)
  performerStaffId     String             // Authenticated StaffMember.id
  notes                String?            // Confidential
  serialNumber         String?
  mediaUrlsJson        Json               @default("[]")
  checklistJson        Json               @default("{}")
  customerConfirmedAt  DateTime?
  createdAt            DateTime           @default(now())

  @@index([fulfillmentSegmentId])
}
```

### 2.6. Advanced Operations Queue & Audit (`[PHASE-PACK]` — `FR-321`)

```prisma
enum OperatorActionSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum OperatorActionStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  DISMISSED
}

model OperatorAction {
  id                    String                 @id @default(uuid())
  dedupeKey             String                 @unique
  reason                String                 // e.g., "OUT_OF_STOCK_AFTER_PAYMENT", "OVERBOOKED_LATE_PAYMENT", "COMPLIANCE_PROVIDER_FAILURE", "MANUAL_PHONE_REVIEW"
  severity              OperatorActionSeverity @default(HIGH)
  status                OperatorActionStatus   @default(OPEN)
  affectedAggregateType String                 // "ORDER" | "PARTY" | "QUOTE" | "FULFILLMENT_SEGMENT"
  affectedAggregateId   String
  recommendedNextAction String
  availableSafeActions  Json                   @default("[]") // e.g., ["APPROVE_RESCHEDULE", "ISSUE_REFUND", "RETRY_COMPLIANCE"]
  ownerStaffId          String?
  dueAt                 DateTime?
  resolution            String?
  resolvedByStaffId     String?
  resolvedByRole        StaffRole?
  resolvedAt            DateTime?
  auditHistory          Json                   @default("[]")
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt

  @@index([status, severity, dueAt])
  @@index([affectedAggregateType, affectedAggregateId])
}

model AuditEvent {
  id            String    @id @default(uuid())
  action        String    // e.g., "STAFF_SESSION_REVOKED", "BREAK_GLASS_ADMIN_TOKEN_USED", "ORDER_APPROVED", "INVENTORY_ADJUSTED"
  actorId       String    // StaffMember.id or "BREAK_GLASS_ADMIN_TOKEN"
  actorRole     StaffRole
  aggregateType String
  aggregateId   String
  reason        String?
  metadataJson  Json      @default("{}") // Strictly PII-redacted (INV-010)
  createdAt     DateTime  @default(now())

  @@index([aggregateType, aggregateId, createdAt])
  @@index([actorId, createdAt])
}
```

---

## 3. Subsequent Phase Pack Entities (`[PHASE-PACK]` & `[AI-LAB]`)

- **`Phase C` (`Quote Pack` & `MarginGuard`)**: `Quote`, `QuoteLine` (versioned snapshots, `QuoteMode`, `QuoteStatus`, `marginCostEstimateJson`, `marginApprovedByStaffId`).
- **`Phase D-Extended` (`Documents & ChangeRequests`)**: `ChangeRequest` (`originalSnapshotJson`, `proposedSnapshotJson`, `priceDifferenceMinor`, `capacityDifferenceJson`), `CommercialDocument`, `CommercialDocumentLine`, `DocumentRender`, `ExternalDocumentReference`, `NumberingProfile`.
- **`Phase E` (`Relationship & Ops Extensions`)**: `Journey`, `JourneyToken` (`ContinuationLink`), `ServiceCase`, `WarrantyCoverage`, `DataQualityIssue`, `ImportBatch`, `ImportRow`, `ImportIssue`, `ActionSuggestion`.
- **`Phase F` (`Jurisdiction & Compliance Pack`)**: `JurisdictionProfile`, `ComplianceOperationRequest`, `ComplianceOperationResult`.
- **`Phase H` (`Engineering AI Lab`)**: `AiTelemetryRecord` (redacted operational metadata `traceId`, `useCase`, `providerRoute`, `modelAlias`, `latencyMs`, `resultStatus`).

---

## 4. Booking-First Migration Strategy

Release `003.1` uses additive migrations for the Better Auth schema, staff identity link, bookable resources/schedules where missing, professional profiles, portfolio items, service-to-professional associations, service location/pricing settings, booking mode/address/price snapshots, and booking cancellation hashes. It MUST preserve existing services, bookings, customers, and order history. Existing `Item` and `SlotReservation` records remain canonical; no broad `001`/`002` commerce-kernel conversion is part of this release.

1. **Expand**: Add new tables and nullable fields; keep the current and prior application versions compatible. Use non-blocking index creation where supported and bounded DDL timeouts.
2. **Dual-Write & Backfill**: Dual-write only when a legacy value is represented in a new field/table. Backfill only deterministic existing service-to-resource associations with an idempotent, rate-limited job and reconcile the result. New independent profile/auth/resource/cancellation data has no legacy equivalent; record dual-write/backfill as not applicable for those tables.
3. **Cutover**: Switch reads of migrated associations only after counts and values reconcile and telemetry shows no regression. New independent tables become active through the release configuration while existing booking reads remain available through acceptance.
4. **Contract**: Drop no old schema in `003.1`. Any later cleanup is a separate reviewed migration after the compatibility window.

Rollback before cutover returns the application to the prior compatible version and leaves additive schema/data intact. After cutover, return reads to the compatible path and preserve all records; only remove an added table if it is proven empty and unused. T012 verifies the rollback and data reconciliation against a restored database. The broader commerce-kernel migration remains a later, separately planned phase.
