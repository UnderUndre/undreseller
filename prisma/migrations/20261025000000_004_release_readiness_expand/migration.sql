-- 004 Release Readiness — Phase 1 Expand (additive only, Constitution X)
SET statement_timeout = '5s';
SET lock_timeout = '2s';
-- All changes nullable/defaulted so pre-004 code keeps running unchanged.

-- ===== 1. Enum expansion (004 US1 FSM two-track) =====
-- NOTE: ADD VALUE is expand-safe but irreversible-by-design; deployed BEFORE any
-- code writes these values. Spec-level CONFIRMED maps to existing BOOKED (antigravity F1).
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'UNDERPAID';
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'STAFF_REJECTED';

-- ===== 2. Column expansion =====
-- SlotReservation: confirming-freeze (US1, hard ceiling 24h -> FR-432)
ALTER TABLE "SlotReservation" ADD COLUMN IF NOT EXISTS "holdFrozenAt" TIMESTAMPTZ(3);

-- Item: per-service prepayment toggle (FR-407), soft delete (FR-436), arrow reorder (US9)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "requiresFullPrepayment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- ShopSettings: enabledLocales (defaultLocale & slotGridStepMin already exist from 003)
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "enabledLocales" TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[];

-- ===== 3. New tables (data-model 1.3-1.9) =====

-- Enums first (PostgreSQL requires type existence before table DDL)
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'FULFILLED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "WaitlistOfferStatus" AS ENUM ('SENT', 'CLAIMED', 'TAKEN', 'EXPIRED');
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'SINGLE_SELECT', 'CHECKBOX');
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('ACCEPTED', 'FAILED');

-- US5: waitlist auto-fill entries (PII: customerTgId/customerContact)
CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "customerTgId" TEXT NOT NULL,
    "customerContact" TEXT,
    "serviceId" TEXT,
    "professionalProfileId" TEXT,
    "windowStartAt" TIMESTAMPTZ(3) NOT NULL,
    "windowEndAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_customerTgId_serviceId_windowStartAt_key" ON "WaitlistEntry"("customerTgId", "serviceId", "windowStartAt");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_status_windowStartAt_idx" ON "WaitlistEntry"("status", "windowStartAt");


-- US5: offers with hashed claim tokens; atomic claim via standard booking path
CREATE TABLE IF NOT EXISTS "WaitlistOffer" (
    "id" TEXT NOT NULL,
    "waitlistEntryId" TEXT NOT NULL,
    "slotReservationId" TEXT,
    "offerTokenHash" TEXT NOT NULL,
    "status" "WaitlistOfferStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMPTZ(3),
    CONSTRAINT "WaitlistOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistOffer_offerTokenHash_key" ON "WaitlistOffer"("offerTokenHash");
CREATE INDEX IF NOT EXISTS "WaitlistOffer_status_sentAt_idx" ON "WaitlistOffer"("status", "sentAt");


-- US6: custom booking field definitions (archive-only lifecycle, FR-423)
CREATE TABLE IF NOT EXISTS "CustomBookingField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" JSONB,
    "boundItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomBookingField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomBookingField_key_key" ON "CustomBookingField"("key");
CREATE INDEX IF NOT EXISTS "CustomBookingField_archivedAt_idx" ON "CustomBookingField"("archivedAt");


-- US6: answers with immutable definition snapshots (PII; purged with booking retention)
CREATE TABLE IF NOT EXISTS "BookingFieldAnswer" (
    "id" TEXT NOT NULL,
    "slotReservationId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,
    "typeSnapshot" "CustomFieldType" NOT NULL,
    "valueText" TEXT,
    "valueNumber" INTEGER,
    "valueBool" BOOLEAN,
    CONSTRAINT "BookingFieldAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BookingFieldAnswer_slotReservationId_fieldId_key" ON "BookingFieldAnswer"("slotReservationId", "fieldId");

-- US2: notification delivery log (target = salted hash, never raw PII; 90-day retention)
CREATE TABLE IF NOT EXISTS "NotificationDeliveryLog" (
    "id" TEXT NOT NULL,
    "bookingRefId" TEXT,
    "orderId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "targetHash" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "providerRef" TEXT,
    "errorCode" TEXT,
    "attemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latencyMs" INTEGER,
    CONSTRAINT "NotificationDeliveryLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotificationDeliveryLog_attemptAt_idx" ON "NotificationDeliveryLog"("attemptAt");


-- US9: slug redirects for renamed professional profiles (FR-437)
CREATE TABLE IF NOT EXISTS "SlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);

-- data-model 1.2: explicit payment-provider ledger link (pre-structure for 003.2 PaymentAllocation)
CREATE TABLE IF NOT EXISTS "PaymentAllocationLink" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "allocationKind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocationLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAllocationLink_provider_providerPaymentId_key" ON "PaymentAllocationLink"("provider", "providerPaymentId");

-- US3: customer language preference (FR-412)
CREATE TABLE IF NOT EXISTS "UserPreference" (
    "tgId" TEXT NOT NULL,
    "languageOverride" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("tgId")
);

-- ===== 4. Foreign keys =====
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_slotReservationId_fkey" FOREIGN KEY ("slotReservationId") REFERENCES "SlotReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingFieldAnswer" ADD CONSTRAINT "BookingFieldAnswer_slotReservationId_fkey" FOREIGN KEY ("slotReservationId") REFERENCES "SlotReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocationLink" ADD CONSTRAINT "PaymentAllocationLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
