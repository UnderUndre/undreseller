-- 004 Release Readiness — Phase 1 Expand DOWN (drops only objects created by this migration)
-- Additive-only expand: safe drop. Enum ADD VALUE is irreversible-by-design —
-- values remain in ReservationStatus but are inert (harmless unused on rollback).

-- Foreign keys drop implicitly with tables, listed for clarity.
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT IF EXISTS "WaitlistEntry_serviceId_fkey";
ALTER TABLE "WaitlistOffer" DROP CONSTRAINT IF EXISTS "WaitlistOffer_waitlistEntryId_fkey";
ALTER TABLE "WaitlistOffer" DROP CONSTRAINT IF EXISTS "WaitlistOffer_slotReservationId_fkey";
ALTER TABLE "BookingFieldAnswer" DROP CONSTRAINT IF EXISTS "BookingFieldAnswer_slotReservationId_fkey";
ALTER TABLE "PaymentAllocationLink" DROP CONSTRAINT IF EXISTS "PaymentAllocationLink_orderId_fkey";

DROP TABLE IF EXISTS "UserPreference";
DROP TABLE IF EXISTS "PaymentAllocationLink";
DROP TABLE IF EXISTS "SlugRedirect";
DROP TABLE IF EXISTS "NotificationDeliveryLog";
DROP TABLE IF EXISTS "BookingFieldAnswer";
DROP TABLE IF EXISTS "CustomBookingField";
DROP TABLE IF EXISTS "WaitlistOffer";
DROP TABLE IF EXISTS "WaitlistEntry";

DROP TYPE IF EXISTS "NotificationDeliveryStatus";
DROP TYPE IF EXISTS "NotificationChannel";
DROP TYPE IF EXISTS "CustomFieldType";
DROP TYPE IF EXISTS "WaitlistOfferStatus";
DROP TYPE IF EXISTS "WaitlistEntryStatus";

DROP INDEX IF EXISTS "NotificationDeliveryLog_attemptAt_idx";
DROP INDEX IF EXISTS "CustomBookingField_archivedAt_idx";
DROP INDEX IF EXISTS "CustomBookingField_key_key";
DROP INDEX IF EXISTS "WaitlistOffer_status_sentAt_idx";
DROP INDEX IF EXISTS "WaitlistOffer_offerTokenHash_key";
DROP INDEX IF EXISTS "WaitlistEntry_status_windowStartAt_idx";
DROP INDEX IF EXISTS "WaitlistEntry_customerTgId_serviceId_windowStartAt_key";

-- Column reverts
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "enabledLocales";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "sortOrder";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "requiresFullPrepayment";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "holdFrozenAt";
