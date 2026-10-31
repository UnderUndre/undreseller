-- 006 Expand Migration: Integrations (Google Calendar, Outbound Webhooks, Public Read API)
-- Standard: Constitution X (Zero-Downtime Expand/Contract) — purely additive,
-- existing code works unchanged (0 connections = 004 behavior).

SET statement_timeout = '5s';
SET lock_timeout = '2s';

DO $$ BEGIN
    CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE_CALENDAR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'NEEDS_REAUTH', 'DISABLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "resourceId" TEXT,
    -- v1:<iv>:<tag>:<ct> AES-256-GCM (secretVault) — plaintext tokens never in DB
    "encryptedPayload" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "connectedByStaffId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- F2-rev (zcode review): plain UNIQUE treats NULLs as distinct — solo mode
-- (resourceId NULL) would allow duplicate instance-wide credentials.
-- PG 16: NULLS NOT DISTINCT enforces one row per (provider, resourceId)
-- including the NULL case.
CREATE UNIQUE INDEX "IntegrationCredential_provider_resourceId_key" ON "IntegrationCredential"("provider", "resourceId") NULLS NOT DISTINCT;

CREATE INDEX "IntegrationCredential_resourceId_idx" ON "IntegrationCredential"("resourceId");

CREATE TABLE "ExternalBusyBlock" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT,
    "calendarId" TEXT NOT NULL,
    -- stable instance-id (recurrence expansions import as instance ids)
    "gcEventId" TEXT NOT NULL,
    "startUtc" TIMESTAMPTZ(3) NOT NULL,
    "endUtc" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'GCAL',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalBusyBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalBusyBlock_calendarId_gcEventId_key" ON "ExternalBusyBlock"("calendarId", "gcEventId");

CREATE INDEX "ExternalBusyBlock_resourceId_startUtc_endUtc_idx" ON "ExternalBusyBlock"("resourceId", "startUtc", "endUtc");

CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "secretPrefix" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMPTZ(3),
    "lastDeliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "remoteMeetingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- F6-rev (zcode review): Meet link persisted by the push worker from the GC
-- pushEvent response; NULL = push pending or conferencing disabled.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "meetLink" TEXT;

-- Additive FKs (onDelete: Cascade — resource deletion removes its credential
-- and imported busy blocks; no FK from any pre-006 table into these)
DO $$ BEGIN
    ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ExternalBusyBlock" ADD CONSTRAINT "ExternalBusyBlock_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
