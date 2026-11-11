import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Migration 1 of 008-audit-hardening (antigravity F7 / F-BE-01):
 * Separate transaction for ALTER TYPE ... ADD VALUE.
 * PostgreSQL requires enum value additions to commit before they can be
 * safely used in subsequent DDL/DML operations within the same session.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'paid_requires_resolution';
    ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'refund_requested';
    ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'refund_failed';
    ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'refund_rejected';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // PostgreSQL does not support ALTER TYPE ... DROP VALUE natively.
  // Reverting enum values requires recreating the enum type, which is handled
  // if complete_domain_schema down() is executed.
  await db.execute(sql`SELECT 1;`)
}
