# Booking-First Template Data Model (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Database Engine**: PostgreSQL 16 + `btree_gist` (Single-Tenant Dedicated Database per Client Deployment — `Q4 Option A`; `btree_gist` extension is established in the `20261018000000_init` migration at `prisma/migrations/20261018000000_init/migration.sql` line 2: `CREATE EXTENSION IF NOT EXISTS btree_gist`, and `003.1` additive migrations depend on it)  
**ORM**: Prisma 6.4.1 (`DATABASE_URL` pooled `connection_limit=10`, `DIRECT_URL` for guarded migrations)

---

## 1. Data Classification & Trust Boundaries

Every entity and field in `003` is classified under one of four sensitivity tiers (`Spec §3.4`):

| Data Class | Storage & Logging Rules | AI / MCP Exposure Policy | Representative Entities & Fields |
| :--- | :--- | :--- | :--- |
| **`PUBLIC`** | Plaintext in PostgreSQL; cacheable; safe in public API responses | Allowed on `local` and `official-api-key` routes | Published `ShopSettings` branding/contact fields, active `Item` services (`003.1`) / `Offering` & `OfferingVariant` (`003.2+`), `ProfessionalProfile`, `PortfolioItem`, `CurrencyMetadata`, `WeeklyHours`, `KnowledgeChunk`, and `IN_CALL` address when public display is enabled |
| **`INTERNAL`** | Plaintext in PostgreSQL; structured logs allowed (redacted of PII) | Allowed via redacted read models (`OrderSummaryView`, `OperatorActionView`, `AvailabilityView`) | `Resource`, `AvailabilityException`, `SlotReservation` schedule intervals/buffers, `AuditEvent`, and later-pack `InventoryBalance`, `InventoryMovement`, `FulfillmentPlan`, `FulfillmentSegment`, `OperatorAction` |
| **`CONFIDENTIAL`** | Plaintext/bounded in dedicated single-tenant PostgreSQL; **strictly forbidden** in logs, analytics, and idempotency keys (`INV-010`) | **Local-only (`LM Studio`)**; fails closed if local runtime is unavailable; **never** exposed in `Agent Read Pack` | Customer-provided `OUT_CALL` addresses, non-public `IN_CALL` address snapshots (`SlotReservation.serviceAddressSnapshot`), `Order.customerName`, `Order.customerPhone`, `Order.customerEmail`, `Order.customerNotes`, and later-pack `Party.displayName`, `ContactPoint.value`, `PartyNote`, `CompletionEvidence`, `MarginGuard` cost fields |
| **`RESTRICTED`** | Managed by the authentication library or stored only in host `.env`; one-time cancellation secrets are stored as SHA-256 hashes; raw payment credentials never touch core DB | **Prohibited** from all AI and read-model surfaces | Better Auth credential/session fields, `SlotReservation.cancellationTokenHash`, `JourneyToken.tokenHash`, `ADMIN_TOKEN`, webhook secrets |

---

## 2. Production MVP (`003.1`) Entities & Prisma Schema Contracts

Release `003.1` retains the existing `ShopSettings`, `Item`, `WeeklyHours`, `SlotReservation`, `Order`, and `OrderItem` tables as the canonical store (`prisma/schema.prisma`). No broad `001`/`002` commerce-kernel table replacement (`Offering`, `OfferingVariant`, `OrderLine`, `Party`) occurs in `003.1`. All monetary minor-unit fields in `003.1` use `Int` consistent with `Item.priceMinor` and `Order.totalMinor`.

### 2.1. Staff Authentication, Roles, Sessions & Audit (`[MVP-CORE]` — `FR-325a`, `FR-325b`)

Better Auth owns its generated identity, credential, account, and database-session tables. Generate those tables from the pinned library version using its supported Prisma integration; do not define a parallel `StaffSession` table or application-owned password/session fields. The application role remains in `StaffMember` and is never inferred from Better Auth metadata. `AuditEvent` is included in `003.1` so every staff provisioning, session revocation, profile/service/booking mutation, and break-glass `ADMIN_TOKEN` call records immutable attribution.

```prisma
enum StaffRole {
  OWNER
  OPERATOR
  PERFORMER
}

model StaffMember {
  id                  String               @id @default(uuid())
  authUserId          String               @unique // Better Auth user ID
  displayName         String
  role                StaffRole            @default(PERFORMER)
  telegramUserId      String?              @unique // Reserved for a later messaging integration
  resourceId          String?              @unique // Any bookable staff member can own a Resource, including OWNER
  resource            Resource?            @relation(fields: [resourceId], references: [id])
  professionalProfile ProfessionalProfile?
  invitedById         String?
  active              Boolean              @default(true)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  @@index([role, active])
}

model AuditEvent {
  id            String    @id @default(uuid())
  action        String    // e.g., "STAFF_MEMBER_PROVISIONED", "STAFF_SESSIONS_REVOKED", "BREAK_GLASS_ADMIN_TOKEN_USED", "BOOKING_STATUS_UPDATED"
  actorId       String    // StaffMember.id, "BREAK_GLASS_ADMIN_TOKEN", or "CUSTOMER_CANCELLATION_LINK"
  actorRole     StaffRole?
  aggregateType String    // "STAFF_MEMBER" | "SHOP_SETTINGS" | "PROFESSIONAL_PROFILE" | "SERVICE" | "BOOKING"
  aggregateId   String
  reason        String?   // PII-redacted before persistence (INV-010); staff must not write raw customer PII (phone/email/address) here
  metadataJson  Json      @default("{}") // Strictly PII-redacted (INV-010, INV-014)
  createdAt     DateTime  @default(now())

  @@index([aggregateType, aggregateId, createdAt])
  @@index([actorId, createdAt])
}
```

### 2.2. Booking Customer Details (`[MVP-CORE]` — `FR-304`)

Release `003.1` stores customer details needed to confirm and manage an appointment directly on the existing `Order` record (`customerName`, `customerPhone`, `customerEmail`, `customerNotes`, `customerTgUsername`, `hasWhatsApp`, `hasTelegram`) and uses existing `MessengerContact` blacklist checks where applicable. It requires neither a customer password nor a messaging account. Cross-channel `Party` resolution (`Party`, `PartyIdentifier`, `ContactPoint`, `ChannelIdentity`, `PartyNote`, `PartyTag`) belongs to the later Relationship Pack (`§2.5`) and MUST NOT be added in `003.1`.

### 2.3. Business Settings, Currency Metadata, Service Listings & Professional Profiles (`[MVP-CORE]` — `FR-301`, `FR-303`, `FR-335`, `FR-336`, `FR-338`, `FR-339`)

In `003.1`, the existing `ShopSettings` singleton (`id = 1`) and `Item` (`itemType = SERVICE`) models are extended additively (`T005`, `T070`), while `CurrencyMetadata`, `ProfessionalProfile`, `ProfessionalService`, and `PortfolioItem` are added as new tables.

- **Business Settings (`ShopSettings` additive delta)**:
  - Gains `businessName`, `businessDescription`, `logoUrl`, `publicContactLinksJson`, `defaultLocale` (default `"en"`), `timeZone` (default `"UTC"`), `currencyConfirmed` (default `false`), `businessServiceAddress`, `businessServiceAddressPublic` (default `false`), `outCallCoverageDescription`, and `requireStaffApprovalForInCall` (default `false`).
  - A new installation starts with `currency = "USD"` and `currencyConfirmed = false`; the `OWNER` must confirm or change the currency before publishing live services (`FR-335`).
  - Publishing any active service with `inCallEnabled = true` requires a non-empty `ShopSettings.businessServiceAddress`. That address is returned on public pages only when `businessServiceAddressPublic = true`.
- **Service Listings (`Item` additive delta for `itemType = SERVICE`)**:
  - `Item.priceMinor` (`Int`) is the standard `IN_CALL` service price (and the fallback `OUT_CALL` service price when `outCallPriceMinor` is null) in `ShopSettings.currency`.
  - Gains `inCallEnabled` (default `true`), `outCallEnabled` (default `false`), `outCallPriceMinor` (`Int?`), `outCallTravelFeeMinor` (`Int @default(0)`), `bufferBeforeMin` (`Int @default(0)`), `bufferAfterMin` (`Int @default(0)`), `outCallTravelBeforeMin` (`Int @default(0)`), `outCallTravelAfterMin` (`Int @default(0)`), and `cancellationCutoffHours` (`Int @default(3)`).
  - For `OUT_CALL`, the effective service price is `outCallPriceMinor ?? priceMinor`, plus `outCallTravelFeeMinor`, all in `ShopSettings.currency`.

```prisma
enum ServiceFulfillmentMode {
  IN_CALL
  OUT_CALL
}

model CurrencyMetadata {
  code      String   @id // ISO 4217 code or explicitly configured non-ISO code, e.g., XTR
  minorUnit Int      // ISO 4217 exponent for fiat currencies (e.g., JPY=0, USD=2, AMD=2, KWD=3); configured scale for non-ISO units
  symbol    String
  active    Boolean  @default(true)
  updatedAt DateTime @updatedAt
}

// Additive schema delta on existing ShopSettings (id = 1)
// businessName                  String?
// businessDescription           String?
// logoUrl                       String?
// publicContactLinksJson        Json     @default("{}")
// defaultLocale                 String   @default("en")
// timeZone                      String   @default("UTC")
// currencyConfirmed             Boolean  @default(false)
// businessServiceAddress        String?
// businessServiceAddressPublic  Boolean  @default(false)
// outCallCoverageDescription    String?
// requireStaffApprovalForInCall Boolean  @default(false)

// Additive schema delta on existing Item (canonical service model in 003.1)
// bufferBeforeMin               Int      @default(0)
// bufferAfterMin                Int      @default(0)
// cancellationCutoffHours       Int      @default(3)
// inCallEnabled                 Boolean  @default(true)
// outCallEnabled                Boolean  @default(false)
// outCallPriceMinor             Int?     // Optional OUT_CALL service-price override (minor units, ShopSettings.currency)
// outCallTravelFeeMinor         Int      @default(0) // Fixed per-booking travel fee (minor units, ShopSettings.currency)
// outCallTravelBeforeMin        Int      @default(0) // Added to bufferBeforeMin only for OUT_CALL
// outCallTravelAfterMin         Int      @default(0) // Added to bufferAfterMin only for OUT_CALL
// professionalServices          ProfessionalService[]

model ProfessionalProfile {
  id             String                @id @default(uuid())
  staffMemberId  String                @unique
  staffMember    StaffMember           @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  slug           String                @unique
  headline       String?
  biography      String?
  photoUrl       String?
  isPublished    Boolean               @default(false)
  services       ProfessionalService[]
  portfolioItems PortfolioItem[]
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  @@index([isPublished, slug])
}

model ProfessionalService {
  professionalProfileId String
  professionalProfile   ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  itemId                String
  item                  Item                @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@id([professionalProfileId, itemId])
  @@index([itemId])
}

model PortfolioItem {
  id                    String              @id @default(uuid())
  professionalProfileId String
  professionalProfile   ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  title                 String
  description           String?
  mediaUrl              String
  sortOrder             Int                 @default(0)
  isPublished           Boolean             @default(false)
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  @@index([professionalProfileId, isPublished, sortOrder])
}
```

### 2.4. Appointment Capacity, Schedules & Buffer-Aware Reservations (`[MVP-CORE]` — `FR-307`, `FR-309`, `FR-337`–`FR-339`, `INV-004`, `INV-014`, `INV-015`)

Only `Resource`, `WeeklyHours` (with `@@index([resourceId, weekday])`), `AvailabilityException`, service durations/buffers, and overlap-safe `SlotReservation` records are required in `003.1`.

```prisma
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
  date        String   // YYYY-MM-DD in ShopSettings.timeZone
  isClosed    Boolean  @default(false)
  startMin    Int?     // Override start minute from local midnight in ShopSettings.timeZone
  endMin      Int?     // Override end minute from local midnight in ShopSettings.timeZone
  reason      String?
  createdAt   DateTime @default(now())

  @@unique([resourceId, date])
}
```

`SlotReservation` from `002` remains the stored booking record and is not renamed in `003.1`. Add the following nullable/defaulted fields. Existing rows keep `null` for mode, price snapshots, address snapshot, and `appointmentStartTime`/`appointmentEndTime`; do not infer these values for historical rows.

```prisma
// Additive schema delta on the existing SlotReservation model
cancellationTokenHash        String?                 @unique // SHA-256 of a random 32-byte token; raw token is never stored
cancellationTokenExpiresAt   DateTime?               @db.Timestamptz(3)
cancellationTokenConsumedAt  DateTime?               @db.Timestamptz(3)
cancellationTokenRevokedAt   DateTime?               @db.Timestamptz(3)
fulfillmentMode              ServiceFulfillmentMode?
servicePriceMinor            Int?                    // Immutable service-price snapshot in linked Order.currency
travelFeeMinor               Int?                    // Immutable travel-fee snapshot; 0 for IN_CALL
serviceAddressSnapshot       String?                 // OUT_CALL customer address or IN_CALL business address at booking time
appointmentStartTime         DateTime?               @db.Timestamptz(3) // Customer-facing appointment start (startsAt)
appointmentEndTime           DateTime?               @db.Timestamptz(3) // Customer-facing appointment end (startsAt + durationMin)
bufferBeforeMin              Int                     @default(0) // Effective before-buffer applied (bufferBeforeMin + outCallTravelBeforeMin for OUT_CALL)
bufferAfterMin               Int                     @default(0) // Effective after-buffer applied (bufferAfterMin + outCallTravelAfterMin for OUT_CALL)
```

- **Buffer & GiST Exclusion Semantics (`INV-004`, `FR-309`, `FR-338`)**:
  - For `IN_CALL`, `effectiveBufferBeforeMin = Item.bufferBeforeMin` and `effectiveBufferAfterMin = Item.bufferAfterMin`.
  - For `OUT_CALL`, `effectiveBufferBeforeMin = Item.bufferBeforeMin + Item.outCallTravelBeforeMin` and `effectiveBufferAfterMin = Item.bufferAfterMin + Item.outCallTravelAfterMin`.
  - On every new booking, `appointmentStartTime = startsAt` and `appointmentEndTime = startsAt + Item.durationMin`, while `SlotReservation.startTime = appointmentStartTime - effectiveBufferBeforeMin` and `SlotReservation.endTime = appointmentEndTime + effectiveBufferAfterMin` (`totalDurationMin = Item.durationMin + effectiveBufferBeforeMin + effectiveBufferAfterMin`).
  - Consequently, the existing PostgreSQL GiST exclusion constraint `slot_resource_no_overlap` on `("resourceId" WITH =, tstzrange("startTime", "endTime") WITH &&) WHERE ("status" IN ('HELD', 'BOOKED'))` hardware-enforces both service buffers and outcall travel buffers without requiring a custom range function. API responses (`StaffBookingView`, `createBooking`) expose `appointmentStartTime ?? startTime` and `appointmentEndTime ?? endTime` as the customer-facing `startsAt`/`endsAt`.
- **Initial Booking Status & Hold Expiry Semantics (`FR-337`, `FR-338`, `INV-015`)**:
  - New bookings must always set `fulfillmentMode`, `servicePriceMinor`, `travelFeeMinor`, `serviceAddressSnapshot`, `appointmentStartTime`, `appointmentEndTime`, `bufferBeforeMin`, and `bufferAfterMin`. `Order.totalMinor` must equal `servicePriceMinor + travelFeeMinor`, and `Order.currency` must equal `ShopSettings.currency`.
  - Because `003.1` has no automatic outcall coverage check, new `OUT_CALL` requests always start with `Order.confirmationStatus = PENDING_STAFF_REVIEW`, `SlotReservation.status = HELD`, and `holdExpiresAt = null` (or the appointment start time, never the 15-minute online-checkout payment timer).
  - New `IN_CALL` requests start as `CONFIRMED` (`Order.confirmationStatus = STAFF_APPROVED`, `SlotReservation.status = BOOKED`, `holdExpiresAt = null`) when `ShopSettings.requireStaffApprovalForInCall = false`, or `PENDING_STAFF_REVIEW` / `HELD` (`holdExpiresAt = null`) when `requireStaffApprovalForInCall = true`.
  - Availability and conflict queries (`lib/booking/windows.ts`, `lib/booking/lock.ts`) MUST treat a `HELD` reservation as active whenever `holdExpiresAt IS NULL OR holdExpiresAt > now`, matching the GiST constraint and preventing double-booking of `OUT_CALL` requests awaiting staff coverage review.
  - When an `OWNER` or `OPERATOR` confirms an `OUT_CALL` request, `Order.confirmationStatus` transitions to `STAFF_APPROVED` and `SlotReservation.status` transitions to `BOOKED`. When rejected, `Order.status` transitions to `CANCELLED` (`cancellationReason = STAFF_REJECTED`), `SlotReservation.status` transitions to `RELEASED`, and `cancellationTokenRevokedAt` is set.

---

## 3. Subsequent Phase Pack Entities (`[PHASE-PACK]` & `[AI-LAB]` — `003.2+`)

The following models describe later capability packs (`003.2+`). They are **not** migrated or required in `003.1`.

### 3.1. Relationship Pack (`Phase E` — `FR-305`, `FR-306`, `FR-321`–`FR-324`)

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
  id                String            @id @default(uuid())
  kind              PartyKind         @default(PERSON)
  displayName       String            // Confidential
  organizationId    String?
  isBlocked         Boolean           @default(false)
  blockedReason     String?
  blockedAt         DateTime?
  blockedByStaffId  String?
  identifiers       PartyIdentifier[]
  contactPoints     ContactPoint[]
  channelIdentities ChannelIdentity[]
  notes             PartyNote[]
  tags              PartyTag[]
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

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
  id                 String      @id @default(uuid())
  partyId            String
  party              Party       @relation(fields: [partyId], references: [id], onDelete: Cascade)
  kind               ChannelKind
  value              String      // E.164 phone, email, or @username (Confidential)
  isPrimary          Boolean     @default(false)
  hasWhatsApp        Boolean     @default(false)
  hasTelegram        Boolean     @default(false)
  verifiedAt         DateTime?
  phoneRiskFlagged   Boolean     @default(false)
  phoneRiskExpiresAt DateTime?
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

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

### 3.2. Goods, Catalog & Inventory Pack (`003.2+` — `FR-302`, `FR-308`)

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

enum InventoryMovementKind {
  INITIAL
  RESERVE
  COMMIT
  RELEASE
  ADJUSTMENT
  RETURN
  DAMAGE
}

model Offering {
  id            String            @id @default(uuid())
  legacyItemId  String?           @unique // Optional link to an existing Item record when 003.2+ is enabled
  slug          String            @unique
  kind          OfferingKind      @default(PRODUCT)
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
  id                    String              @id @default(uuid())
  offeringId            String
  offering              Offering            @relation(fields: [offeringId], references: [id], onDelete: Cascade)
  sku                   String              @unique
  title                 String
  attributesJson        Json                @default("{}")
  unitAmountMinor       BigInt
  currency              String
  outCallPriceMinor     BigInt?
  outCallTravelFeeMinor BigInt              @default(0)
  starsPrice            Int?
  active                Boolean             @default(true)
  inventoryBalance      InventoryBalance?
  inventoryMovements    InventoryMovement[]
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  @@index([offeringId, active])
}

model ServicePolicy {
  id                      String   @id @default(uuid())
  offeringId              String   @unique
  offering                Offering @relation(fields: [offeringId], references: [id], onDelete: Cascade)
  durationMin             Int      // 1..480
  bufferBeforeMin         Int      @default(0)
  bufferAfterMin          Int      @default(0)
  cancellationCutoffHours Int      @default(3)
  inCallEnabled           Boolean  @default(true)
  outCallEnabled          Boolean  @default(false)
  outCallTravelBeforeMin  Int      @default(0)
  outCallTravelAfterMin   Int      @default(0)
}

model BundleComponent {
  id               String   @id @default(uuid())
  bundleOfferingId String
  bundleOffering   Offering @relation("ParentBundle", fields: [bundleOfferingId], references: [id], onDelete: Cascade)
  childOfferingId  String
  childVariantId   String?
  quantity         Decimal  @default(1)
}

model InventoryBalance {
  variantId String          @id
  variant   OfferingVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  onHand    Int             @default(0)
  reserved  Int             @default(0)
  available Int             @default(0) // Invariant: available == onHand - reserved
  updatedAt DateTime        @updatedAt
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
```

### 3.3. Commerce, Payment & Fulfillment Models (`[PHASE-PACK]` — `FR-312`, `FR-315`–`FR-319`, `FR-321`)

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

model OrderLine {
  id                   String       @id @default(uuid())
  orderId              String
  order                Order        @relation(fields: [orderId], references: [id], onDelete: Cascade)
  legacyOrderItemId    String?      @unique
  offeringId           String?
  variantId            String?
  offeringKindSnapshot OfferingKind @default(SERVICE)
  offeringNameSnapshot String
  variantNameSnapshot  String?
  quantity             Decimal      @default(1)
  unitAmountMinor      BigInt
  currency             String
  discountMinor        BigInt       @default(0)
  netAmountMinor       BigInt
  taxAmountMinor       BigInt       @default(0)
  grossAmountMinor     BigInt
  taxCategoryCode      String?
  taxRateSnapshot      Decimal?
  taxProviderReference String?
  durationMinSnapshot  Int?
  createdAt            DateTime     @default(now())

  @@index([orderId])
}

model PaymentPlan {
  id               String             @id @default(uuid())
  orderId          String             @unique
  order            Order              @relation(fields: [orderId], references: [id], onDelete: Cascade)
  currency         String
  totalAmountMinor BigInt
  paidAmountMinor  BigInt             @default(0)
  status           PaymentPlanStatus  @default(PENDING)
  milestones       PaymentMilestone[]
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
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
  id                String           @id @default(uuid())
  milestoneId       String
  milestone         PaymentMilestone @relation(fields: [milestoneId], references: [id], onDelete: Restrict)
  paymentEventId    String?
  refundOperationId String?
  allocatedMinor    BigInt           // Positive for payment capture, negative/linked for refund allocation
  currency          String
  createdAt         DateTime         @default(now())

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
  id                  String                   @id @default(uuid())
  fulfillmentPlanId   String
  fulfillmentPlan     FulfillmentPlan          @relation(fields: [fulfillmentPlanId], references: [id], onDelete: Cascade)
  orderLineId         String?
  kind                FulfillmentSegmentKind
  providerMode        String                   @default("SERVICE_ON_SITE")
  status              FulfillmentSegmentStatus @default(PENDING)
  assignedStaffId     String?                  // Links to StaffMember (PERFORMER)
  reservationId       String?                  // Links to SlotReservation for APPOINTMENT segments
  inventoryMovementId String?                  // Links to InventoryMovement for INVENTORY segments
  scheduledStartAt    DateTime?
  scheduledEndAt      DateTime?
  completedAt         DateTime?
  evidence            CompletionEvidence[]
  createdAt           DateTime                 @default(now())
  updatedAt           DateTime                 @updatedAt

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

model OperatorAction {
  id                    String                 @id @default(uuid())
  dedupeKey             String                 @unique
  reason                String                 // e.g., "OUT_OF_STOCK_AFTER_PAYMENT", "OVERBOOKED_LATE_PAYMENT", "COMPLIANCE_PROVIDER_FAILURE", "MANUAL_PHONE_REVIEW"
  severity              OperatorActionSeverity @default(HIGH)
  status                OperatorActionStatus   @default(OPEN)
  affectedAggregateType String                 // "ORDER" | "PARTY" | "QUOTE" | "FULFILLMENT_SEGMENT"
  affectedAggregateId   String
  recommendedNextAction String
  availableSafeActions  Json                   @default("[]")
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
```

### 3.4. Other Subsequent Phase Pack Entities (`[PHASE-PACK]` & `[AI-LAB]`)

- **`Phase C` (`Quote Pack` & `MarginGuard`)**: `Quote`, `QuoteLine` (versioned snapshots, `QuoteMode`, `QuoteStatus`, `marginCostEstimateJson`, `marginApprovedByStaffId`).
- **`Phase D-Extended` (`Documents & ChangeRequests`)**: `ChangeRequest` (`originalSnapshotJson`, `proposedSnapshotJson`, `priceDifferenceMinor`, `capacityDifferenceJson`), `CommercialDocument`, `CommercialDocumentLine`, `DocumentRender`, `ExternalDocumentReference`, `NumberingProfile`.
- **`Phase E` (`Relationship & Ops Extensions`)**: `Journey`, `JourneyToken` (`ContinuationLink`), `ServiceCase`, `WarrantyCoverage`, `DataQualityIssue`, `ImportBatch`, `ImportRow`, `ImportIssue`, `ActionSuggestion`.
- **`Phase F` (`Jurisdiction & Compliance Pack`)**: `JurisdictionProfile`, `ComplianceOperationRequest`, `ComplianceOperationResult`.
- **`Phase H` (`Engineering AI Lab`)**: `AiTelemetryRecord` (redacted operational metadata `traceId`, `useCase`, `providerRoute`, `modelAlias`, `latencyMs`, `resultStatus`).

---

## 4. Booking-First Migration Strategy

Release `003.1` uses additive migrations (`20261022000000_003_booking_template` in `T005` and `20261022010000_003_service_locations` in `T070`) for the Better Auth schema, `StaffMember`, `AuditEvent`, `CurrencyMetadata`, `Resource`, `AvailabilityException`, `ProfessionalProfile`, `ProfessionalService`, `PortfolioItem`, additive business/location settings on `ShopSettings`, additive location/price/buffer fields on `Item`, and additive snapshot/buffer/cancellation-token fields on `SlotReservation`. It MUST preserve existing services, bookings, customers, and order history. The `btree_gist` extension (required for the `slot_resource_no_overlap` GiST exclusion constraint) is already established in the `20261018000000_init` migration; `003.1` additive migrations depend on it. Existing `Item` and `SlotReservation` records remain canonical; no broad `001`/`002` commerce-kernel conversion is part of this release.

1. **Expand**: Add new tables and nullable/defaulted fields; keep the current and prior application versions compatible. Use non-blocking index creation where supported and bounded DDL timeouts (`lock_timeout = '2s'`, `statement_timeout = '5s'`).
2. **Dual-Write & Backfill**: Ensure default `Resource` records exist for distinct `WeeklyHours.resourceId` and `SlotReservation.resourceId` values (`"default_master"`) and seed the ISO 4217 `CurrencyMetadata` table (including `USD` `minorUnit = 2`, `AMD` `minorUnit = 2`, `JPY` `minorUnit = 0`, `KWD` `minorUnit = 3`, and configured `XTR`). Backfill only deterministic existing service-to-resource associations with an idempotent, rate-limited job and reconcile the result (`T011`). Leave `fulfillmentMode`, `servicePriceMinor`, `travelFeeMinor`, `serviceAddressSnapshot`, `appointmentStartTime`, and `appointmentEndTime` null on historical reservations.
3. **Cutover**: Switch reads of migrated associations only after counts and values reconcile and telemetry shows no regression. New independent tables become active through the release configuration while existing booking reads remain available through acceptance.
4. **Contract**: Drop no old schema in `003.1`. Any later cleanup is a separate reviewed migration after the compatibility window.

Rollback before cutover returns the application to the prior compatible version and leaves additive schema/data intact. After cutover, return reads to the compatible path and preserve all records; only remove an added table if it is proven empty and unused. `T012` verifies the rollback and data reconciliation against a restored database. The broader commerce-kernel migration remains a later, separately planned phase.
