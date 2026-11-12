import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Migration for 012-deposit-telegram (FR-1201):
 * Adds 'DEPOSIT' value to enum_products_payment_mode and version enum,
 * and adds deposit_amount column to products and _products_v.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_products_payment_mode" ADD VALUE IF NOT EXISTS 'DEPOSIT';
    ALTER TYPE "public"."enum__products_v_version_payment_mode" ADD VALUE IF NOT EXISTS 'DEPOSIT';
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "deposit_amount" numeric;
    ALTER TABLE "_products_v" ADD COLUMN IF NOT EXISTS "version_deposit_amount" numeric;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "products" DROP COLUMN IF EXISTS "deposit_amount";
    ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_deposit_amount";
  `)
}
