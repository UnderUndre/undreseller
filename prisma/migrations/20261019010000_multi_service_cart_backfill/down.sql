-- Down migration for Stage 2 Backfill
DELETE FROM "MigrationBackfillCheckpoint" WHERE "migrationName" = '20261019010000_multi_service_cart_backfill';
DELETE FROM "SlotReservationQuarantine";
