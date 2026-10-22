-- Down migration for 20261022010000_003_service_locations

SET statement_timeout = '5s';
SET lock_timeout = '2s';

ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "bufferAfterMin";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "bufferBeforeMin";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "appointmentEndTime";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "appointmentStartTime";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "serviceAddressSnapshot";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "travelFeeMinor";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "servicePriceMinor";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "fulfillmentMode";

ALTER TABLE "Item" DROP COLUMN IF EXISTS "outCallTravelAfterMin";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "outCallTravelBeforeMin";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "outCallTravelFeeMinor";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "outCallPriceMinor";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "outCallEnabled";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "inCallEnabled";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "cancellationCutoffHours";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "bufferAfterMin";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "bufferBeforeMin";

ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "requireStaffApprovalForInCall";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "outCallCoverageDescription";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "businessServiceAddressPublic";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "businessServiceAddress";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "currencyConfirmed";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "timeZone";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "defaultLocale";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "publicContactLinksJson";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "logoUrl";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "businessDescription";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "businessName";

DROP TYPE IF EXISTS "ServiceFulfillmentMode";
