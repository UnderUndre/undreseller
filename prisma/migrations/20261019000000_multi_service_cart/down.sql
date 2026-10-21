-- Safe Rollback (down.sql) for Stage 1..4 of 002-service-cart-and-staff-bot
SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- 1. Restore legacy slot_no_overlap constraint if dropped, before dropping resource constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'slot_no_overlap'
  ) THEN
    ALTER TABLE "SlotReservation"
      ADD CONSTRAINT slot_no_overlap
      EXCLUDE USING gist (
        "itemId" WITH =,
        tstzrange("startTime", "endTime") WITH &&
      )
      WHERE ("status" IN ('HELD', 'BOOKED') AND "itemId" IS NOT NULL);
  END IF;
END $$;

ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_resource_no_overlap;
ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_reservation_resource_id_not_null_chk;
ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_reservation_duration_valid_chk;

-- 2. Drop auxiliary tables
DROP TABLE IF EXISTS "SlotReservationQuarantine";
DROP TABLE IF EXISTS "MigrationBackfillCheckpoint";
DROP TABLE IF EXISTS "TelegramRateState";
DROP TABLE IF EXISTS "RefundOperation";

-- 3. Revert InboxEvent columns
DROP INDEX IF EXISTS "InboxEvent_botProfile_chatId_status_idx";
DROP INDEX IF EXISTS "InboxEvent_status_priority_nextAttemptAt_idx";
DROP INDEX IF EXISTS "InboxEvent_dedupeKey_key";

ALTER TABLE "InboxEvent"
  DROP COLUMN IF EXISTS "reconciliationState",
  DROP COLUMN IF EXISTS "nextAttemptAt",
  DROP COLUMN IF EXISTS "leaseExpiresAt",
  DROP COLUMN IF EXISTS "dedupeKey",
  DROP COLUMN IF EXISTS "priority",
  DROP COLUMN IF EXISTS "chatId",
  DROP COLUMN IF EXISTS "botProfile";

-- 4. Revert MessengerContact columns
DROP INDEX IF EXISTS "MessengerContact_customerId_idx";
ALTER TABLE "MessengerContact"
  DROP COLUMN IF EXISTS "unblockedAt",
  DROP COLUMN IF EXISTS "unblockReason",
  DROP COLUMN IF EXISTS "unblockedBy",
  DROP COLUMN IF EXISTS "requiresManualReview",
  DROP COLUMN IF EXISTS "otpAttempts",
  DROP COLUMN IF EXISTS "otpExpiresAt",
  DROP COLUMN IF EXISTS "otpCodeHash",
  DROP COLUMN IF EXISTS "phoneRiskExpiresAt",
  DROP COLUMN IF EXISTS "phoneVerificationMethod",
  DROP COLUMN IF EXISTS "phoneVerifiedAt",
  DROP COLUMN IF EXISTS "customerId";

-- 5. Revert OrderItem snapshot columns
ALTER TABLE "OrderItem"
  DROP COLUMN IF EXISTS "durationMin",
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "titleSnapshot";

-- 6. Revert Order columns
ALTER TABLE "Order"
  DROP COLUMN IF EXISTS "staffChatId",
  DROP COLUMN IF EXISTS "staffMessageId",
  DROP COLUMN IF EXISTS "reminderSentAt",
  DROP COLUMN IF EXISTS "invoiceExpiresAt",
  DROP COLUMN IF EXISTS "rescheduleTokenConsumedAt",
  DROP COLUMN IF EXISTS "rescheduleTokenHash",
  DROP COLUMN IF EXISTS "scheduleVersion",
  DROP COLUMN IF EXISTS "autoCancelOnNoConfirmation",
  DROP COLUMN IF EXISTS "refundStatus",
  DROP COLUMN IF EXISTS "cancellationReason",
  DROP COLUMN IF EXISTS "confirmationStatus",
  DROP COLUMN IF EXISTS "paymentType",
  DROP COLUMN IF EXISTS "customerNotes";

-- 7. Revert SlotReservation columns
DROP INDEX IF EXISTS "SlotReservation_resourceId_startTime_endTime_idx";
ALTER TABLE "SlotReservation"
  DROP COLUMN IF EXISTS "totalDurationMin",
  DROP COLUMN IF EXISTS "resourceId";

-- 8. Revert WeeklyHours & ShopSettings columns
ALTER TABLE "WeeklyHours" DROP COLUMN IF EXISTS "resourceId";

ALTER TABLE "ShopSettings"
  DROP COLUMN IF EXISTS "authorizedStaffUserIds",
  DROP COLUMN IF EXISTS "staffDestinationChatId",
  DROP COLUMN IF EXISTS "enabledExternalIntegration",
  DROP COLUMN IF EXISTS "prepaymentTiming",
  DROP COLUMN IF EXISTS "allowPayOnSite",
  DROP COLUMN IF EXISTS "autoCancelForNewClients",
  DROP COLUMN IF EXISTS "autoCancelDeadlineHours",
  DROP COLUMN IF EXISTS "confirmationNoticeHours",
  DROP COLUMN IF EXISTS "slotGridStepMin";

-- 9. Drop new enum types
DROP TYPE IF EXISTS "RefundOperationStatus";
DROP TYPE IF EXISTS "RefundOperationKind";
DROP TYPE IF EXISTS "RefundStatus";
DROP TYPE IF EXISTS "CancellationReason";
DROP TYPE IF EXISTS "ConfirmationStatus";
DROP TYPE IF EXISTS "ExternalIntegration";
DROP TYPE IF EXISTS "PrepaymentTiming";
DROP TYPE IF EXISTS "PaymentType";
