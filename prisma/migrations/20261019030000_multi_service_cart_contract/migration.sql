-- Stage 4 (Contract): SET NOT NULL leveraging validated CHECK constraints, drop temporary CHECK and legacy slot_no_overlap
SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- 1. Promote resourceId and totalDurationMin to NOT NULL without full-table scan (backed by validated CHECK constraints from Stage 3)
ALTER TABLE "SlotReservation"
  ALTER COLUMN "resourceId" SET DEFAULT 'default_master',
  ALTER COLUMN "resourceId" SET NOT NULL,
  ALTER COLUMN "totalDurationMin" SET NOT NULL;

-- 2. Remove temporary nullability CHECK constraint (keep duration bounds check 1..480)
ALTER TABLE "SlotReservation"
  DROP CONSTRAINT IF EXISTS slot_reservation_resource_id_not_null_chk;

-- 3. Drop legacy single-item exclusion constraint
ALTER TABLE "SlotReservation"
  DROP CONSTRAINT IF EXISTS slot_no_overlap;
