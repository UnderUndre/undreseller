-- Stage 1 (Expand): Additive nullable schema and backward-compatible dual-write support
-- Principle X: Never place full-table backfill or SET NOT NULL in the Expand migration.
SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- 1. Extend Enums (Additive)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID_REQUIRES_RESOLUTION';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_EXPIRED';

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAY_ON_SITE';

ALTER TYPE "InboxEventKind" ADD VALUE IF NOT EXISTS 'TELEGRAM_OUTBOUND';
ALTER TYPE "InboxEventKind" ADD VALUE IF NOT EXISTS 'STAFF_BOT_OUTBOUND';

-- 2. Create New Enums
DO $$ BEGIN
  CREATE TYPE "PaymentType" AS ENUM ('PAY_ON_SITE', 'PREPAYMENT_ONLINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PrepaymentTiming" AS ENUM ('IMMEDIATE', 'AFTER_STAFF_APPROVAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExternalIntegration" AS ENUM ('NONE', 'TELEGRAM_BUNDLE', 'WHATSAPP', 'NOWPAYMENTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConfirmationStatus" AS ENUM ('PENDING_STAFF_REVIEW', 'STAFF_APPROVED', 'CLIENT_CONFIRMED', 'RESCHEDULE_OFFERED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CancellationReason" AS ENUM ('CLIENT_DECLINED', 'STAFF_REJECTED', 'PAYMENT_EXPIRED', 'CLIENT_BLOCKED', 'AUTO_CANCELLED_NO_CONFIRMATION', 'ADMIN_CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'REFUND_REQUESTED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RefundOperationKind" AS ENUM ('TELEGRAM_STARS_REFUND', 'CRYPTO_REIMBURSEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RefundOperationStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. ShopSettings additive columns
ALTER TABLE "ShopSettings"
  ADD COLUMN IF NOT EXISTS "slotGridStepMin" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "confirmationNoticeHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "autoCancelDeadlineHours" INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "autoCancelForNewClients" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowPayOnSite" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "prepaymentTiming" "PrepaymentTiming" NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN IF NOT EXISTS "enabledExternalIntegration" "ExternalIntegration" NOT NULL DEFAULT 'TELEGRAM_BUNDLE',
  ADD COLUMN IF NOT EXISTS "staffDestinationChatId" TEXT,
  ADD COLUMN IF NOT EXISTS "authorizedStaffUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 4. WeeklyHours additive resourceId
ALTER TABLE "WeeklyHours"
  ADD COLUMN IF NOT EXISTS "resourceId" TEXT NOT NULL DEFAULT 'default_master';

-- 5. SlotReservation Expand: make itemId nullable, add nullable resourceId & totalDurationMin (no backfill/NOT NULL here)
ALTER TABLE "SlotReservation"
  ALTER COLUMN "itemId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "resourceId" TEXT DEFAULT 'default_master',
  ADD COLUMN IF NOT EXISTS "totalDurationMin" INTEGER;

-- Adjust foreign key on SlotReservation.itemId to allow NULL on delete/multi-item cart
ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS "SlotReservation_itemId_fkey";
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT "SlotReservation_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Order additive columns
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "customerNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentType" "PaymentType" NOT NULL DEFAULT 'PAY_ON_SITE',
  ADD COLUMN IF NOT EXISTS "confirmationStatus" "ConfirmationStatus" NOT NULL DEFAULT 'PENDING_STAFF_REVIEW',
  ADD COLUMN IF NOT EXISTS "cancellationReason" "CancellationReason",
  ADD COLUMN IF NOT EXISTS "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "autoCancelOnNoConfirmation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "scheduleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "rescheduleTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "rescheduleTokenConsumedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "invoiceExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "staffMessageId" INTEGER,
  ADD COLUMN IF NOT EXISTS "staffChatId" TEXT;

-- 7. OrderItem immutable snapshot columns
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "titleSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "durationMin" INTEGER;

-- 8. MessengerContact phone verification, OTP & risk fields
ALTER TABLE "MessengerContact"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "phoneVerificationMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneRiskExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "otpCodeHash" TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "otpAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "unblockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "unblockReason" TEXT,
  ADD COLUMN IF NOT EXISTS "unblockedAt" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "MessengerContact_customerId_idx" ON "MessengerContact"("customerId");

-- 9. InboxEvent durable Telegram dispatcher fields
ALTER TABLE "InboxEvent"
  ADD COLUMN IF NOT EXISTS "botProfile" TEXT,
  ADD COLUMN IF NOT EXISTS "chatId" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "reconciliationState" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "InboxEvent_dedupeKey_key" ON "InboxEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "InboxEvent_status_priority_nextAttemptAt_idx" ON "InboxEvent"("status", "priority", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "InboxEvent_botProfile_chatId_status_idx" ON "InboxEvent"("botProfile", "chatId", "status");

-- 10. Create RefundOperation table (PaymentEvent remains immutable)
CREATE TABLE IF NOT EXISTS "RefundOperation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "RefundOperationKind" NOT NULL,
    "status" "RefundOperationStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "providerRef" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "asset" TEXT,
    "network" TEXT,
    "destination" TEXT,
    "networkFeeMinor" INTEGER,
    "txid" TEXT,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "errorMessage" TEXT,
    "reconciledAt" TIMESTAMPTZ(3),
    "slaDueAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefundOperation_idempotencyKey_key" ON "RefundOperation"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RefundOperation_orderId_status_idx" ON "RefundOperation"("orderId", "status");

DO $$ BEGIN
  ALTER TABLE "RefundOperation"
    ADD CONSTRAINT "RefundOperation_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. Create TelegramRateState table for shared 429 cooldown and per-chat shaping
CREATE TABLE IF NOT EXISTS "TelegramRateState" (
    "id" TEXT NOT NULL,
    "botProfile" TEXT NOT NULL,
    "chatId" TEXT,
    "cooldownUntil" TIMESTAMPTZ(3),
    "windowStart" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramRateState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TelegramRateState_botProfile_chatId_idx" ON "TelegramRateState"("botProfile", "chatId");

-- 12. Create BackfillCheckpoint & Quarantine tables for Stage 2 observability
CREATE TABLE IF NOT EXISTS "MigrationBackfillCheckpoint" (
    "migrationName" TEXT NOT NULL,
    "lastProcessedId" TEXT,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "quarantinedRows" INTEGER NOT NULL DEFAULT 0,
    "shadowMismatchCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationBackfillCheckpoint_pkey" PRIMARY KEY ("migrationName")
);

CREATE TABLE IF NOT EXISTS "SlotReservationQuarantine" (
    "reservationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rawStartTime" TIMESTAMPTZ(3),
    "rawEndTime" TIMESTAMPTZ(3),
    "computedMinutes" NUMERIC,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotReservationQuarantine_pkey" PRIMARY KEY ("reservationId")
);
