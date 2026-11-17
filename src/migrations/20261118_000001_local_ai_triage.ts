import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Migration for 013-local-ai-triage (FR-1301, Expand-only Principle X):
 * - Adds 'ai-triage' value to Payload job task slug enums
 * - Creates enums for SlotReservations.aiTriageStatus and ShopSettings.aiDelegationCurrency
 * - Adds nullable/defaulted columns on slot_reservations, booking_intents, shop_settings
 * - Creates shop_settings_owner_chat_ids array table with Payload standard 4 columns + indexes
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'ai-triage';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'ai-triage';

    DO $$ BEGIN
      CREATE TYPE "public"."enum_slot_reservations_ai_triage_status" AS ENUM('pending', 'processing', 'done', 'skipped', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_shop_settings_ai_delegation_currency" AS ENUM('AED', 'USD', 'RUB', 'EUR');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "slot_reservations" ADD COLUMN IF NOT EXISTS "customer_notes" varchar;
    ALTER TABLE "slot_reservations" ADD COLUMN IF NOT EXISTS "ai_triage_status" "enum_slot_reservations_ai_triage_status" DEFAULT 'skipped';
    ALTER TABLE "slot_reservations" ADD COLUMN IF NOT EXISTS "ai_triage_json" jsonb;

    ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "customer_notes" varchar;

    ALTER TABLE "shop_settings" ADD COLUMN IF NOT EXISTS "ai_triage_enabled" boolean DEFAULT true;
    ALTER TABLE "shop_settings" ADD COLUMN IF NOT EXISTS "ai_delegation_limit" numeric DEFAULT 1500;
    ALTER TABLE "shop_settings" ADD COLUMN IF NOT EXISTS "ai_delegation_currency" "enum_shop_settings_ai_delegation_currency" DEFAULT 'AED';
    ALTER TABLE "shop_settings" ADD COLUMN IF NOT EXISTS "ai_min_confidence" numeric DEFAULT 0.8;

    CREATE TABLE IF NOT EXISTS "shop_settings_owner_chat_ids" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "chat_id" varchar NOT NULL
    );

    DO $$ BEGIN
      ALTER TABLE "shop_settings_owner_chat_ids"
        ADD CONSTRAINT "shop_settings_owner_chat_ids_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."shop_settings"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS "shop_settings_owner_chat_ids_order_idx" ON "shop_settings_owner_chat_ids" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "shop_settings_owner_chat_ids_parent_id_idx" ON "shop_settings_owner_chat_ids" USING btree ("_parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "shop_settings_owner_chat_ids" CASCADE;

    ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "ai_triage_enabled";
    ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "ai_delegation_limit";
    ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "ai_delegation_currency";
    ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "ai_min_confidence";

    ALTER TABLE "booking_intents" DROP COLUMN IF EXISTS "customer_notes";

    ALTER TABLE "slot_reservations" DROP COLUMN IF EXISTS "customer_notes";
    ALTER TABLE "slot_reservations" DROP COLUMN IF EXISTS "ai_triage_status";
    ALTER TABLE "slot_reservations" DROP COLUMN IF EXISTS "ai_triage_json";

    DROP TYPE IF EXISTS "public"."enum_slot_reservations_ai_triage_status";
    DROP TYPE IF EXISTS "public"."enum_shop_settings_ai_delegation_currency";
  `)
}
