-- Down migration for Stage 3 Validate & Cutover
SET statement_timeout = '5s';
SET lock_timeout = '2s';

ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_resource_no_overlap;
DROP INDEX IF EXISTS "SlotReservation_resourceId_startTime_endTime_idx";
ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_reservation_duration_valid_chk;
ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_reservation_resource_id_not_null_chk;
