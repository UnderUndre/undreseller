-- Stage 3 (Validation & Cutover): Zero-mismatch & overlap preflight, CHECK ... NOT VALID, VALIDATE CONSTRAINT, and resource GiST exclusion
SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- 1. Preflight check: abort if any null/invalid rows remain or if active reservations overlap on the same resourceId (r1.id < r2.id)
DO $$
DECLARE
  unbackfilled_count INTEGER;
  collision_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unbackfilled_count
  FROM "SlotReservation"
  WHERE "resourceId" IS NULL
     OR "totalDurationMin" IS NULL
     OR "totalDurationMin" < 1
     OR "totalDurationMin" > 480;

  IF unbackfilled_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_ABORT: % SlotReservation rows have null/invalid resourceId or totalDurationMin', unbackfilled_count;
  END IF;

  SELECT COUNT(*) INTO collision_count
  FROM "SlotReservation" r1
  JOIN "SlotReservation" r2
    ON r1."resourceId" = r2."resourceId"
   AND r1."id" < r2."id"
   AND r1."status" IN ('HELD', 'BOOKED')
   AND r2."status" IN ('HELD', 'BOOKED')
   AND tstzrange(r1."startTime", r1."endTime") && tstzrange(r2."startTime", r2."endTime");

  IF collision_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_COLLISION_ABORT: % overlapping active reservations detected on same resourceId (r1.id < r2.id)', collision_count;
  END IF;
END $$;

-- 2. Add NOT VALID CHECK constraints first (fast metadata lock)
ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_reservation_resource_id_not_null_chk;
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT slot_reservation_resource_id_not_null_chk
  CHECK ("resourceId" IS NOT NULL) NOT VALID;

ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_reservation_duration_valid_chk;
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT slot_reservation_duration_valid_chk
  CHECK ("totalDurationMin" IS NOT NULL AND "totalDurationMin" BETWEEN 1 AND 480) NOT VALID;

-- 3. Validate constraints separately (SHARE UPDATE EXCLUSIVE lock, allows concurrent reads/writes)
ALTER TABLE "SlotReservation" VALIDATE CONSTRAINT slot_reservation_resource_id_not_null_chk;
ALTER TABLE "SlotReservation" VALIDATE CONSTRAINT slot_reservation_duration_valid_chk;

-- 4. Create supporting index and resource-level GiST exclusion constraint
CREATE INDEX IF NOT EXISTS "SlotReservation_resourceId_startTime_endTime_idx"
  ON "SlotReservation"("resourceId", "startTime", "endTime");

ALTER TABLE "SlotReservation" DROP CONSTRAINT IF EXISTS slot_resource_no_overlap;
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT slot_resource_no_overlap
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startTime", "endTime") WITH &&
  )
  WHERE ("status" IN ('HELD', 'BOOKED'));
