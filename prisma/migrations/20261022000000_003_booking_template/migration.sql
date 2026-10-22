-- Migration: 20261022000000_003_booking_template (Stage 1 Expand: Better Auth, Staff, Profiles, Portfolios, Audit, Schedules)
-- Compliance: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017 (Expand/Contract Zero-Downtime Migration)

SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- 1. Create Enums
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'OPERATOR', 'PERFORMER');

-- 2. Create Better Auth Core Tables
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- 3. Create Resource & AvailabilityException Tables
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvailabilityException_resourceId_date_key" ON "AvailabilityException"("resourceId", "date");

-- 4. Create StaffMember Table
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'PERFORMER',
    "telegramUserId" TEXT,
    "resourceId" TEXT,
    "invitedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffMember_authUserId_key" ON "StaffMember"("authUserId");
CREATE UNIQUE INDEX "StaffMember_telegramUserId_key" ON "StaffMember"("telegramUserId");
CREATE UNIQUE INDEX "StaffMember_resourceId_key" ON "StaffMember"("resourceId");
CREATE INDEX "StaffMember_role_active_idx" ON "StaffMember"("role", "active");

-- 5. Create AuditEvent Table
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "StaffRole",
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "reason" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_aggregateType_aggregateId_createdAt_idx" ON "AuditEvent"("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- 6. Create CurrencyMetadata Table
CREATE TABLE "CurrencyMetadata" (
    "code" TEXT NOT NULL,
    "minorUnit" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyMetadata_pkey" PRIMARY KEY ("code")
);

-- 7. Create Professional Profiles & Portfolio Tables
CREATE TABLE "ProfessionalProfile" (
    "id" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT,
    "biography" TEXT,
    "photoUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfessionalProfile_staffMemberId_key" ON "ProfessionalProfile"("staffMemberId");
CREATE UNIQUE INDEX "ProfessionalProfile_slug_key" ON "ProfessionalProfile"("slug");
CREATE INDEX "ProfessionalProfile_isPublished_slug_idx" ON "ProfessionalProfile"("isPublished", "slug");

CREATE TABLE "ProfessionalService" (
    "professionalProfileId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "ProfessionalService_pkey" PRIMARY KEY ("professionalProfileId","itemId")
);

CREATE INDEX "ProfessionalService_itemId_idx" ON "ProfessionalService"("itemId");

CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortfolioItem_professionalProfileId_isPublished_sortOrder_idx" ON "PortfolioItem"("professionalProfileId", "isPublished", "sortOrder");

-- 8. Add WeeklyHours resourceId+weekday index
CREATE INDEX IF NOT EXISTS "WeeklyHours_resourceId_weekday_idx" ON "WeeklyHours"("resourceId", "weekday");

-- 9. Add SlotReservation cancellation credential fields (nullable for zero-downtime expand)
ALTER TABLE "SlotReservation" ADD COLUMN "cancellationTokenHash" TEXT;
ALTER TABLE "SlotReservation" ADD COLUMN "cancellationTokenExpiresAt" TIMESTAMPTZ(3);
ALTER TABLE "SlotReservation" ADD COLUMN "cancellationTokenConsumedAt" TIMESTAMPTZ(3);
ALTER TABLE "SlotReservation" ADD COLUMN "cancellationTokenRevokedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "SlotReservation_cancellationTokenHash_key" ON "SlotReservation"("cancellationTokenHash");

-- 10. Foreign Keys
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfessionalProfile" ADD CONSTRAINT "ProfessionalProfile_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
