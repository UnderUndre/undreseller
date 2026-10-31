-- 006 Down Migration: drops ONLY newly created 006 objects.
-- Safe: no pre-existing table has a FK into these; resourceId is a nullable
-- FK with onDelete: Cascade (cascade goes outward, not inward).

ALTER TABLE "ExternalBusyBlock" DROP CONSTRAINT IF EXISTS "ExternalBusyBlock_resourceId_fkey";
ALTER TABLE "IntegrationCredential" DROP CONSTRAINT IF EXISTS "IntegrationCredential_resourceId_fkey";

DROP TABLE IF EXISTS "WebhookEndpoint";
DROP TABLE IF EXISTS "ExternalBusyBlock";
DROP TABLE IF EXISTS "IntegrationCredential";

ALTER TABLE "Item" DROP COLUMN IF EXISTS "remoteMeetingEnabled";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "meetLink";

DROP TYPE IF EXISTS "IntegrationStatus";
DROP TYPE IF EXISTS "IntegrationProvider";
