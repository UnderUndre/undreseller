# Phase 1 Data Model & 4-Stage Expand/Contract Migration Specification (`003`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-21  
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Database Engine**: PostgreSQL 16 + `btree_gist` (Single-Tenant Dedicated Database per Client Deployment — `Q4 Option A`)  
**ORM**: Prisma 6.4.1 (`DATABASE_URL` pooled `connection_limit=10`, `DIRECT_URL` for guarded migrations)

---

## 1. Data Classification & Trust Boundaries

Every entity and field in `003` is classified under one of four sensitivity tiers (`Spec §3.4`):

| Data Class | Storage & Logging Rules | AI / MCP Exposure Policy | Representative Entities & Fields |
| :--- | :--- | :--- | :--- |
| **`PUBLIC`** | Plaintext in PostgreSQL; cacheable; safe in public API responses | Allowed on `local` and `official-api-key` routes | `Offering`, `OfferingVariant`, `Price`, `CurrencyMetadata`, `WorkingSchedule`, `KnowledgeChunk` |
| **`INTERNAL`** | Plaintext in PostgreSQL; structured logs allowed (redacted of PII) | Allowed via redacted read models (`OrderSummaryView`, `OperatorActionView`, `AvailabilityView`) | `InventoryBalance`, `InventoryMovement`, `Reservation`, `FulfillmentPlan`, `FulfillmentSegment`, `OperatorAction`, `AuditEvent` |
| **`CONFIDENTIAL`** | Plaintext/bounded in dedicated single-tenant PostgreSQL; **strictly forbidden** in logs, analytics, and idempotency keys (`INV-010`) | **Local-only (`LM Studio`)**; fails closed if local runtime is unavailable; **never** exposed in `Agent Read Pack` | `Party.displayName`, `ContactPoint.value` (`phone`, `email`), `PartyNote`, `Order.customerPhone`, `Order.customerEmail`, `Order.customerNotes`, `CompletionEvidence`, `MarginGuard` cost fields |
| **`RESTRICTED`** | Hashed (`scrypt` / `sha256`) or stored only in host `.env`; raw payment credentials never touch core DB | **Prohibited** from all AI and read-model surfaces | `StaffMember.passwordHash`, `StaffSession.tokenHash`, `JourneyToken.tokenHash`, `Order.rescheduleTokenHash`, `ADMIN_TOKEN`, webhook secrets |

---

## 2. Production MVP (`003.1`) Core Entities & Prisma Schema Contracts

### 2.1. Staff Authentication, Roles & Sessions (`[MVP-CORE]` — `FR-325a`, `FR-325b`)

```prisma
enum StaffRole {
  OWNER
  OPERATOR
  PERFORMER
}

model StaffMember {
  id             String         @id @default(uuid())
  email          String         @unique // Lowercase normalized; single-tenant DB unique
  displayName    String
  passwordHash   String?        // Restricted: scrypt hash (null until invite accepted)
  role           StaffRole      @default(PERFORMER)
  telegramUserId String?        @unique // Maps Telegram Staff Bot ctx.from.id -> StaffMember
  resourceId     String?        // Links PERFORMER to a schedulable Resource (e.g., "master_1")
  invitedById    String?
  active         Boolean        @default(true)
  sessions       StaffSession[]
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([role, active])
}

model StaffSession {
  id            String      @id @default(uuid())
  staffMemberId String
  staffMember   StaffMember @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  tokenHash     String      @unique // SHA-256 hash of opaque 32-byte session token
  userAgent     String?
  ipAddressHash String?
  expiresAt     DateTime
  revokedAt     DateTime?
  createdAt     DateTime    @default(now())

  @@index([staffMemberId, expiresAt])
}
```

### 2.2. Unified Party Context (`[MVP-CORE]` — `FR-304`, `FR-305`)

Replaces disconnected customer/contact silos while preserving backward compatibility with `MessengerContact` during the 4-stage transition:

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

### 2.3. Unified Catalog & Offering Context (`[MVP-CORE]` — `FR-301`–`FR-303`)

```prisma
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
  code      String   @id // e.g., "USD", "AMD", "JPY", "KWD", "XTR"
  minorUnit Int      // e.g., 2 for USD, 0 for JPY/XTR, 3 for KWD
  symbol    String
  active    Boolean  @default(true)
  updatedAt DateTime @updatedAt
}

model Offering {
  id            String            @id @default(uuid())
  legacyItemId  String?           @unique // Links 1:1 to legacy Item.id during Expand/Contract
  slug          String            @unique
  kind          OfferingKind
  name          String
  description   String?
  active        Boolean           @default(true)
  taxCategoryId String?
  priceMode     PriceMode         @default(FIXED)
  variants      OfferingVariant[]
  servicePolicy ServicePolicy?
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
  currency          String              @default("USD")
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
  defaultResourceId   String   @default("default_master")
  cancellationCutoffHours Int  @default(3)
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

### 2.4. Dual Capacity Context (`Goods Pack` + `Services Pack` — `[MVP-CORE]` `FR-307`–`FR-309`)

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
  id          String                  @id // e.g., "default_master", "room_1"
  name        String
  kind        String                  @default("STAFF") // "STAFF" | "ROOM" | "EQUIPMENT"
  active      Boolean                 @default(true)
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
*(Note: Service `SlotReservation` from `002` is retained and mapped to `Reservation` with `resourceId`, `startTime`, `endTime`, `totalDurationMin`, `bufferBeforeMin`, `bufferAfterMin`, and the PostgreSQL GiST exclusion constraint `slot_resource_no_overlap`.)*

### 2.5. OrderLine Snapshots, Payment Plans & Segmented Fulfillment (`[MVP-CORE]` — `FR-312`, `FR-315`, `FR-318`, `FR-319`)

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

### 2.6. Exception-Driven `OperatorAction` Queue & Immutable `AuditEvent` (`[MVP-CORE]` — `FR-321`, `FR-325b`)

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

## 4. Four-Stage Expand/Contract Migration Strategy (`002` $\to$ `003.1`)

All migrations obey Constitution Principle X (`SET lock_timeout = '2s'`, `SET statement_timeout = '5s'`, max 5 retries in `scripts/migrate.ts`, and `SET NOT NULL` strictly separated from batch backfill):

### Stage 1: Expand (`prisma/migrations/20261022000000_003_kernel_expand/migration.sql`)
- Create new tables (`StaffMember`, `StaffSession`, `Party`, `PartyIdentifier`, `ContactPoint`, `ChannelIdentity`, `PartyNote`, `PartyTag`, `CurrencyMetadata`, `Offering`, `OfferingVariant`, `ServicePolicy`, `BundleComponent`, `InventoryBalance`, `InventoryMovement`, `Resource`, `AvailabilityException`, `OrderLine`, `PaymentPlan`, `PaymentMilestone`, `PaymentAllocation`, `FulfillmentPlan`, `FulfillmentSegment`, `CompletionEvidence`, `OperatorAction`, `AuditEvent`).
- Add nullable foreign keys on `Order` (`partyId String?`) and `SlotReservation` (`bufferBeforeMin Int @default(0)`, `bufferAfterMin Int @default(0)`).
- **Zero destructive DDL**: Existing `Item`, `Order`, `OrderItem`, `SlotReservation`, `PaymentEvent`, `RefundOperation`, and `MessengerContact` columns and constraints remain untouched.
- **Dual-Write Activation**: Application services write to both `Item`/`OrderItem`/`MessengerContact` and `Offering`/`OrderLine`/`Party` + `PaymentPlan` + `FulfillmentPlan`.

### Stage 2: Bounded Backfill (`scripts/backfill-003-kernel.ts`)
- Idempotent batch worker (`LIMIT 500 FOR UPDATE SKIP LOCKED`) populates:
  1. `CurrencyMetadata` (`USD` `minorUnit = 2`, `XTR` `minorUnit = 0`, `AMD` `minorUnit = 0`, `JPY` `minorUnit = 0`);
  2. `Resource` (`default_master`) and bootstrap `OWNER` `StaffMember` from `ShopSettings.authorizedStaffUserIds`;
  3. `Offering` + default `OfferingVariant` + `ServicePolicy` / `InventoryBalance` (`INITIAL` movement) from every existing `Item`;
  4. `Party` + `PartyIdentifier` + `ContactPoint` + `ChannelIdentity` from `MessengerContact` and historical `Order` customer fields, setting `Order.partyId`;
  5. `OrderLine`, `PaymentPlan` (`PaymentMilestone` + `PaymentAllocation` from `PaymentEvent`/`RefundOperation`), and `FulfillmentPlan` (`FulfillmentSegment`) from every historical `Order` and `OrderItem`;
  6. `OperatorAction` rows for any open `PAID_REQUIRES_RESOLUTION` or `MANUAL_REVIEW` orders.

### Stage 3: Validate & Cutover (`prisma/migrations/20261022020000_003_kernel_validate_cutover/migration.sql`)
- Add `CHECK ("partyId" IS NOT NULL) NOT VALID` on `Order` (when backfill remainder reaches `0`) and run `VALIDATE CONSTRAINT` in a separate transaction.
- Switch read models (`CatalogSearchView`, `AvailabilityView`, `OrderSummaryView`, `PartyTimelineView`, `OperatorActionView`, `CashCommitmentView`) to read from `Offering`, `Party`, `OrderLine`, `PaymentPlan`, `FulfillmentPlan`, and `OperatorAction`.

### Stage 4: Contract (`prisma/migrations/20261022030000_003_kernel_contract/migration.sql`)
- Executed in the Polish phase after observation window confirms zero read-switch errors:
  - Promote validated foreign keys/constraints, retire temporary dual-write shims while keeping legacy tables/views readable (`INV-011`).
- **Down-Migration (`down.sql`)**: Every migration folder includes an idempotent `down.sql` script that reverses read-switch flags and drops only newly introduced additive tables/constraints if rolled back prior to Contract.
