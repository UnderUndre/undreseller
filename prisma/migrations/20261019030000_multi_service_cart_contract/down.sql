-- Down migration for Stage 4 Contract
SET statement_timeout = '5s';
SET lock_timeout = '2s';

ALTER TABLE "SlotReservation"
  ADD CONSTRAINT slot_reservation_resource_id_not_null_chk
  CHECK ("resourceId" IS NOT NULL) NOT VALID;
ALTER TABLE "SlotReservation" VALIDATE CONSTRAINT slot_reservation_resource_id_not_null_chk;

ALTER TABLE "SlotReservation"
  ALTER COLUMN "resourceId" DROP NOT NULL,
  ALTER COLUMN "totalDurationMin" DROP NOT NULL;

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
