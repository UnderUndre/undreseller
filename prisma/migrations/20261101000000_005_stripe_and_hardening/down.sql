-- 005 Down Migration (Additive rollback: drops newly added columns and enums where supported)
-- Note: PostgreSQL does NOT support dropping values from an ENUM type (`RefundOperationKind`).
-- The STRIPE value remains in RefundOperationKind as a safe, inert no-op.

ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "staffRejectNotifyMode";
DROP TYPE IF EXISTS "StaffRejectNotifyMode";

ALTER TABLE "account" DROP COLUMN IF EXISTS "passwordAlgo";

ALTER TABLE "session" DROP COLUMN IF EXISTS "epochCreated";

ALTER TABLE "user" DROP COLUMN IF EXISTS "sessionEpoch";
