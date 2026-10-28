-- 005 Expand Migration: Stripe, Argon2 account hashing, Session Epochs, Staff Reject Notify Mode, RefundOperationKind.STRIPE
-- Standard: Constitution X (Zero-Downtime Expand/Contract)

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "sessionEpoch" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "epochCreated" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "passwordAlgo" TEXT;

DO $$ BEGIN
    CREATE TYPE "StaffRejectNotifyMode" AS ENUM ('NOTIFY_CUSTOMER', 'SILENT', 'STAFF_ONLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "staffRejectNotifyMode" "StaffRejectNotifyMode" NOT NULL DEFAULT 'NOTIFY_CUSTOMER';

-- F1: Add STRIPE to RefundOperationKind enum (PostgreSQL requires ALTER TYPE ADD VALUE)
ALTER TYPE "RefundOperationKind" ADD VALUE IF NOT EXISTS 'STRIPE';
