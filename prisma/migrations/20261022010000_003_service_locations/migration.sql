-- Migration: 20261022010000_003_service_locations (Stage 1b Expand: Service Fulfillment Modes, Location Pricing & Booking Snapshots)
-- Compliance: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017 (Expand/Contract Zero-Downtime Migration)

SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- 1. Create ServiceFulfillmentMode Enum
CREATE TYPE "ServiceFulfillmentMode" AS ENUM ('IN_CALL', 'OUT_CALL');

-- 2. Additive columns on ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN "businessName" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "businessDescription" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "publicContactLinksJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ShopSettings" ADD COLUMN "defaultLocale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "ShopSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "ShopSettings" ADD COLUMN "currencyConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN "businessServiceAddress" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "businessServiceAddressPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN "outCallCoverageDescription" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "requireStaffApprovalForInCall" BOOLEAN NOT NULL DEFAULT false;

-- 3. Additive columns on Item
ALTER TABLE "Item" ADD COLUMN "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "bufferAfterMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "cancellationCutoffHours" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Item" ADD COLUMN "inCallEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Item" ADD COLUMN "outCallEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "outCallPriceMinor" INTEGER;
ALTER TABLE "Item" ADD COLUMN "outCallTravelFeeMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "outCallTravelBeforeMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "outCallTravelAfterMin" INTEGER NOT NULL DEFAULT 0;

-- 4. Additive columns on SlotReservation
ALTER TABLE "SlotReservation" ADD COLUMN "fulfillmentMode" "ServiceFulfillmentMode";
ALTER TABLE "SlotReservation" ADD COLUMN "servicePriceMinor" INTEGER;
ALTER TABLE "SlotReservation" ADD COLUMN "travelFeeMinor" INTEGER;
ALTER TABLE "SlotReservation" ADD COLUMN "serviceAddressSnapshot" TEXT;
ALTER TABLE "SlotReservation" ADD COLUMN "appointmentStartTime" TIMESTAMPTZ(3);
ALTER TABLE "SlotReservation" ADD COLUMN "appointmentEndTime" TIMESTAMPTZ(3);
ALTER TABLE "SlotReservation" ADD COLUMN "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SlotReservation" ADD COLUMN "bufferAfterMin" INTEGER NOT NULL DEFAULT 0;
