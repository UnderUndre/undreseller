-- Down migration for 20261022000000_003_booking_template

SET statement_timeout = '5s';
SET lock_timeout = '2s';

DROP TABLE IF EXISTS "PortfolioItem" CASCADE;
DROP TABLE IF EXISTS "ProfessionalService" CASCADE;
DROP TABLE IF EXISTS "ProfessionalProfile" CASCADE;
DROP TABLE IF EXISTS "StaffMember" CASCADE;
DROP TABLE IF EXISTS "AvailabilityException" CASCADE;
DROP TABLE IF EXISTS "Resource" CASCADE;
DROP TABLE IF EXISTS "CurrencyMetadata" CASCADE;
DROP TABLE IF EXISTS "AuditEvent" CASCADE;
DROP TABLE IF EXISTS "verification" CASCADE;
DROP TABLE IF EXISTS "account" CASCADE;
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

DROP INDEX IF EXISTS "SlotReservation_cancellationTokenHash_key";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "cancellationTokenRevokedAt";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "cancellationTokenConsumedAt";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "cancellationTokenExpiresAt";
ALTER TABLE "SlotReservation" DROP COLUMN IF EXISTS "cancellationTokenHash";

DROP INDEX IF EXISTS "WeeklyHours_resourceId_weekday_idx";
DROP TYPE IF EXISTS "StaffRole";
