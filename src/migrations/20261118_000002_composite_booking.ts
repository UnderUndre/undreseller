import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Migration for 014-composite-booking (FR-1401, Expand-only — Principle X):
 * - items_json jsonb on slot_reservations + booking_intents (composite snapshot / ids)
 * - products.add_on boolean (add-on services)
 * - _products_v.version_add_on — TWIN COLUMN (fix AG-F1.1, canon of migration
 *   20261113 `version_deposit_amount`): Payload versions/drafts write every
 *   products field into _products_v; without the twin the versioned table
 *   fails with PostgreSQL 42703 on any product create/update.
 * No enum changes (PG-enum quirk 008 F7 untouched); down() drops only new columns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "slot_reservations" ADD COLUMN IF NOT EXISTS "items_json" jsonb;
    ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "items_json" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "add_on" boolean DEFAULT false;
    ALTER TABLE "_products_v" ADD COLUMN IF NOT EXISTS "version_add_on" boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "slot_reservations" DROP COLUMN IF EXISTS "items_json";
    ALTER TABLE "booking_intents" DROP COLUMN IF EXISTS "items_json";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "add_on";
    ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_add_on";
  `)
}
