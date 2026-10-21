-- Stage 2 (Backfill): Resumable bounded batch backfill with quarantine and checkpointing
-- Principle X: Never combine full-table backfill with nullability tightening in one transaction.
SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- Quarantine any malformed reservations (non-positive, > 480 min, or non-whole-minute intervals)
INSERT INTO "SlotReservationQuarantine" ("reservationId", "reason", "rawStartTime", "rawEndTime", "computedMinutes")
SELECT
  r."id",
  CASE
    WHEN r."endTime" <= r."startTime" THEN 'NON_POSITIVE_INTERVAL'
    WHEN EXTRACT(EPOCH FROM (r."endTime" - r."startTime")) / 60.0 > 480 THEN 'EXCEEDS_MAX_DURATION_480M'
    WHEN MOD(EXTRACT(EPOCH FROM (r."endTime" - r."startTime"))::NUMERIC, 60) <> 0 THEN 'NON_WHOLE_MINUTE_INTERVAL'
    ELSE 'UNKNOWN_MALFORMED'
  END AS reason,
  r."startTime",
  r."endTime",
  EXTRACT(EPOCH FROM (r."endTime" - r."startTime")) / 60.0
FROM "SlotReservation" r
WHERE (r."totalDurationMin" IS NULL OR r."totalDurationMin" <= 0)
  AND (
    r."endTime" <= r."startTime"
    OR EXTRACT(EPOCH FROM (r."endTime" - r."startTime")) / 60.0 > 480
    OR MOD(EXTRACT(EPOCH FROM (r."endTime" - r."startTime"))::NUMERIC, 60) <> 0
  )
ON CONFLICT ("reservationId") DO NOTHING;

-- Bounded batch backfill of resourceId and totalDurationMin (normalizing quarantined rows to clamped whole minutes while recording quarantine)
WITH batch AS (
  SELECT "id"
  FROM "SlotReservation"
  WHERE "resourceId" IS NULL OR "totalDurationMin" IS NULL OR "totalDurationMin" <= 0
  ORDER BY "id" ASC
  LIMIT 500
  FOR UPDATE SKIP LOCKED
)
UPDATE "SlotReservation" r
SET
  "resourceId" = COALESCE(r."resourceId", 'default_master'),
  "totalDurationMin" = GREATEST(
    1,
    LEAST(
      480,
      ROUND(EXTRACT(EPOCH FROM (r."endTime" - r."startTime")) / 60.0)::INTEGER
    )
  )
FROM batch
WHERE r."id" = batch."id";

-- Record checkpoint
INSERT INTO "MigrationBackfillCheckpoint" (
  "migrationName",
  "lastProcessedId",
  "processedRows",
  "quarantinedRows",
  "shadowMismatchCount",
  "completedAt",
  "updatedAt"
)
VALUES (
  '20261019010000_multi_service_cart_backfill',
  (SELECT MAX("id") FROM "SlotReservation"),
  (SELECT COUNT(*)::INTEGER FROM "SlotReservation" WHERE "resourceId" IS NOT NULL AND "totalDurationMin" IS NOT NULL),
  (SELECT COUNT(*)::INTEGER FROM "SlotReservationQuarantine"),
  (SELECT COUNT(*)::INTEGER FROM "SlotReservation" WHERE "resourceId" IS NULL OR "totalDurationMin" IS NULL),
  CASE
    WHEN (SELECT COUNT(*) FROM "SlotReservation" WHERE "resourceId" IS NULL OR "totalDurationMin" IS NULL) = 0
    THEN CURRENT_TIMESTAMP
    ELSE NULL
  END,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("migrationName") DO UPDATE SET
  "lastProcessedId" = EXCLUDED."lastProcessedId",
  "processedRows" = EXCLUDED."processedRows",
  "quarantinedRows" = EXCLUDED."quarantinedRows",
  "shadowMismatchCount" = EXCLUDED."shadowMismatchCount",
  "completedAt" = EXCLUDED."completedAt",
  "updatedAt" = CURRENT_TIMESTAMP;
