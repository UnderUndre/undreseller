import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_delivery_log_kind" AS ENUM('confirmation', 'reminder', 'waitlist', 'intent', 'waitlist-optin');
  CREATE TYPE "public"."enum_email_delivery_log_status" AS ENUM('sent', 'failed');
  CREATE TYPE "public"."enum_telegram_outbox_bot" AS ENUM('staff', 'client');
  CREATE TYPE "public"."enum_telegram_outbox_action_type" AS ENUM('sendMessage', 'editMessageText', 'editMessageReplyMarkup');
  CREATE TYPE "public"."enum_telegram_outbox_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'dead');
  CREATE TYPE "public"."enum_waitlist_entries_status" AS ENUM('pending', 'waiting', 'notified', 'converted', 'expired', 'cancelled');
  CREATE TYPE "public"."enum_booking_intents_status" AS ENUM('pending', 'consumed', 'dead', 'expired');
  CREATE TYPE "public"."enum_products_payment_mode" AS ENUM('NONE', 'FULL_PREPAYMENT');
  CREATE TYPE "public"."enum__products_v_version_payment_mode" AS ENUM('NONE', 'FULL_PREPAYMENT');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'hold-sweep', 'booking-email', 'reminder-sweep', 'outbox-dispatch', 'gdpr-purge', 'waitlist-match', 'waitlist-sweep', 'intent-sweep');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'hold-sweep', 'booking-email', 'reminder-sweep', 'outbox-dispatch', 'gdpr-purge', 'waitlist-match', 'waitlist-sweep', 'intent-sweep');
  CREATE TYPE "public"."enum_shop_settings_default_locale" AS ENUM('ru', 'en');
  -- enum_orders_status values added in 20261112_000001_order_enum_values
  CREATE TABLE "inbox_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" varchar NOT NULL,
  	"provider_ref" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" varchar NOT NULL,
  	"provider_ref" varchar NOT NULL,
  	"event_type" varchar NOT NULL,
  	"amount_minor" numeric,
  	"currency" varchar,
  	"status" varchar NOT NULL,
  	"payload_json" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_delivery_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_email_delivery_log_kind" NOT NULL,
  	"status" "enum_email_delivery_log_status" NOT NULL,
  	"booking_id" numeric,
  	"recipient_hash" varchar NOT NULL,
  	"error_detail" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "telegram_outbox" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"bot" "enum_telegram_outbox_bot" NOT NULL,
  	"action_type" "enum_telegram_outbox_action_type" NOT NULL,
  	"to_chat_id" varchar NOT NULL,
  	"text" varchar,
  	"message_id" numeric,
  	"reply_markup_json" jsonb,
  	"sent_message_id" numeric,
  	"priority" numeric DEFAULT 10 NOT NULL,
  	"status" "enum_telegram_outbox_status" DEFAULT 'queued' NOT NULL,
  	"lease_until" timestamp(3) with time zone,
  	"available_at" timestamp(3) with time zone,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"last_error" varchar,
  	"aggregate_type" varchar,
  	"aggregate_id" varchar,
  	"meta_json" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tg_links" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chat_id" varchar NOT NULL,
  	"order_id" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "blacklist" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chat_id" varchar,
  	"phone" varchar,
  	"reason" varchar NOT NULL,
  	"created_by" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "waitlist_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_name" varchar NOT NULL,
  	"customer_phone" varchar NOT NULL,
  	"customer_email" varchar NOT NULL,
  	"service_id_id" integer NOT NULL,
  	"resource_id_id" integer NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_waitlist_entries_status" DEFAULT 'pending' NOT NULL,
  	"campaign_count" numeric DEFAULT 0,
  	"active_campaign_at" timestamp(3) with time zone,
  	"notified_slot_start" timestamp(3) with time zone,
  	"notified_slot_end" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_intents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"customer_name" varchar NOT NULL,
  	"customer_phone" varchar NOT NULL,
  	"service_id_id" integer NOT NULL,
  	"resource_id_id" integer NOT NULL,
  	"slot_start" timestamp(3) with time zone NOT NULL,
  	"slot_end" timestamp(3) with time zone NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"status" "enum_booking_intents_status" DEFAULT 'pending' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "shop_settings_staff_chat_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"chat_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "slot_reservations" ADD COLUMN "reschedule_token_hash" varchar;
  ALTER TABLE "slot_reservations" ADD COLUMN "reminder_sent_at" timestamp(3) with time zone;
  ALTER TABLE "resources" ADD COLUMN "feed_token_version" numeric DEFAULT 1;
  ALTER TABLE "products" ADD COLUMN "payment_mode" "enum_products_payment_mode" DEFAULT 'NONE';
  ALTER TABLE "products" ADD COLUMN "cancellation_cutoff_hours" numeric DEFAULT 3;
  ALTER TABLE "_products_v" ADD COLUMN "version_payment_mode" "enum__products_v_version_payment_mode" DEFAULT 'NONE';
  ALTER TABLE "_products_v" ADD COLUMN "version_cancellation_cutoff_hours" numeric DEFAULT 3;
  ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_ref" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inbox_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_delivery_log_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "telegram_outbox_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tg_links_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "blacklist_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "waitlist_entries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "booking_intents_id" integer;
  ALTER TABLE "shop_settings" ADD COLUMN "from_email" varchar;
  ALTER TABLE "shop_settings" ADD COLUMN "confirmation_notice_hours" numeric DEFAULT 24;
  ALTER TABLE "shop_settings" ADD COLUMN "default_locale" "enum_shop_settings_default_locale" DEFAULT 'ru';
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_id_products_id_fk" FOREIGN KEY ("service_id_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_resource_id_id_resources_id_fk" FOREIGN KEY ("resource_id_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_service_id_id_products_id_fk" FOREIGN KEY ("service_id_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_resource_id_id_resources_id_fk" FOREIGN KEY ("resource_id_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shop_settings_staff_chat_ids" ADD CONSTRAINT "shop_settings_staff_chat_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shop_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "inbox_events_updated_at_idx" ON "inbox_events" USING btree ("updated_at");
  CREATE INDEX "inbox_events_created_at_idx" ON "inbox_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "provider_providerRef_idx" ON "inbox_events" USING btree ("provider","provider_ref");
  CREATE INDEX "payment_events_updated_at_idx" ON "payment_events" USING btree ("updated_at");
  CREATE INDEX "payment_events_created_at_idx" ON "payment_events" USING btree ("created_at");
  CREATE INDEX "email_delivery_log_updated_at_idx" ON "email_delivery_log" USING btree ("updated_at");
  CREATE INDEX "email_delivery_log_created_at_idx" ON "email_delivery_log" USING btree ("created_at");
  CREATE INDEX "telegram_outbox_updated_at_idx" ON "telegram_outbox" USING btree ("updated_at");
  CREATE INDEX "telegram_outbox_created_at_idx" ON "telegram_outbox" USING btree ("created_at");
  CREATE INDEX "tg_links_updated_at_idx" ON "tg_links" USING btree ("updated_at");
  CREATE INDEX "tg_links_created_at_idx" ON "tg_links" USING btree ("created_at");
  CREATE UNIQUE INDEX "chatId_orderId_idx" ON "tg_links" USING btree ("chat_id","order_id");
  CREATE INDEX "blacklist_updated_at_idx" ON "blacklist" USING btree ("updated_at");
  CREATE INDEX "blacklist_created_at_idx" ON "blacklist" USING btree ("created_at");
  CREATE INDEX "waitlist_entries_service_id_idx" ON "waitlist_entries" USING btree ("service_id_id");
  CREATE INDEX "waitlist_entries_resource_id_idx" ON "waitlist_entries" USING btree ("resource_id_id");
  CREATE INDEX "waitlist_entries_updated_at_idx" ON "waitlist_entries" USING btree ("updated_at");
  CREATE INDEX "waitlist_entries_created_at_idx" ON "waitlist_entries" USING btree ("created_at");
  CREATE INDEX "resourceId_serviceId_status_idx" ON "waitlist_entries" USING btree ("resource_id_id","service_id_id","status");
  CREATE INDEX "customerPhone_status_idx" ON "waitlist_entries" USING btree ("customer_phone","status");
  CREATE INDEX "booking_intents_service_id_idx" ON "booking_intents" USING btree ("service_id_id");
  CREATE INDEX "booking_intents_resource_id_idx" ON "booking_intents" USING btree ("resource_id_id");
  CREATE INDEX "booking_intents_updated_at_idx" ON "booking_intents" USING btree ("updated_at");
  CREATE INDEX "booking_intents_created_at_idx" ON "booking_intents" USING btree ("created_at");
  CREATE INDEX "email_status_idx" ON "booking_intents" USING btree ("email","status");
  CREATE INDEX "status_expiresAt_idx" ON "booking_intents" USING btree ("status","expires_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "shop_settings_staff_chat_ids_order_idx" ON "shop_settings_staff_chat_ids" USING btree ("_order");
  CREATE INDEX "shop_settings_staff_chat_ids_parent_id_idx" ON "shop_settings_staff_chat_ids" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inbox_events_fk" FOREIGN KEY ("inbox_events_id") REFERENCES "public"."inbox_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_events_fk" FOREIGN KEY ("payment_events_id") REFERENCES "public"."payment_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_delivery_log_fk" FOREIGN KEY ("email_delivery_log_id") REFERENCES "public"."email_delivery_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_telegram_outbox_fk" FOREIGN KEY ("telegram_outbox_id") REFERENCES "public"."telegram_outbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tg_links_fk" FOREIGN KEY ("tg_links_id") REFERENCES "public"."tg_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blacklist_fk" FOREIGN KEY ("blacklist_id") REFERENCES "public"."blacklist"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_waitlist_entries_fk" FOREIGN KEY ("waitlist_entries_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_intents_fk" FOREIGN KEY ("booking_intents_id") REFERENCES "public"."booking_intents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "orders_stripe_payment_intent_ref_idx" ON "orders" USING btree ("stripe_payment_intent_ref");
  CREATE INDEX "payload_locked_documents_rels_inbox_events_id_idx" ON "payload_locked_documents_rels" USING btree ("inbox_events_id");
  CREATE INDEX "payload_locked_documents_rels_payment_events_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_events_id");
  CREATE INDEX "payload_locked_documents_rels_email_delivery_log_id_idx" ON "payload_locked_documents_rels" USING btree ("email_delivery_log_id");
  CREATE INDEX "payload_locked_documents_rels_telegram_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("telegram_outbox_id");
  CREATE INDEX "payload_locked_documents_rels_tg_links_id_idx" ON "payload_locked_documents_rels" USING btree ("tg_links_id");
  CREATE INDEX "payload_locked_documents_rels_blacklist_id_idx" ON "payload_locked_documents_rels" USING btree ("blacklist_id");
  CREATE INDEX "payload_locked_documents_rels_waitlist_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("waitlist_entries_id");
  CREATE INDEX "payload_locked_documents_rels_booking_intents_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_intents_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "inbox_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_delivery_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "telegram_outbox" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tg_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "blacklist" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "waitlist_entries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "booking_intents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "shop_settings_staff_chat_ids" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "inbox_events" CASCADE;
  DROP TABLE IF EXISTS "payment_events" CASCADE;
  DROP TABLE IF EXISTS "email_delivery_log" CASCADE;
  DROP TABLE IF EXISTS "telegram_outbox" CASCADE;
  DROP TABLE IF EXISTS "tg_links" CASCADE;
  DROP TABLE IF EXISTS "blacklist" CASCADE;
  DROP TABLE IF EXISTS "waitlist_entries" CASCADE;
  DROP TABLE IF EXISTS "booking_intents" CASCADE;
  DROP TABLE IF EXISTS "payload_jobs_log" CASCADE;
  DROP TABLE IF EXISTS "payload_jobs" CASCADE;
  DROP TABLE IF EXISTS "shop_settings_staff_chat_ids" CASCADE;
  DROP TABLE IF EXISTS "payload_jobs_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_inbox_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_payment_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_email_delivery_log_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_telegram_outbox_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tg_links_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_blacklist_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_waitlist_entries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_booking_intents_fk";
  
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'processing'::text;
  DROP TYPE IF EXISTS "public"."enum_orders_status";
  CREATE TYPE "public"."enum_orders_status" AS ENUM('processing', 'completed', 'cancelled', 'refunded');
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'processing'::"public"."enum_orders_status";
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."enum_orders_status" USING "status"::"public"."enum_orders_status";
  DROP INDEX IF EXISTS "orders_stripe_payment_intent_ref_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_inbox_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_payment_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_email_delivery_log_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_telegram_outbox_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tg_links_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_blacklist_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_waitlist_entries_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_booking_intents_id_idx";
  ALTER TABLE "slot_reservations" DROP COLUMN IF EXISTS "reschedule_token_hash";
  ALTER TABLE "slot_reservations" DROP COLUMN IF EXISTS "reminder_sent_at";
  ALTER TABLE "resources" DROP COLUMN IF EXISTS "feed_token_version";
  ALTER TABLE "products" DROP COLUMN IF EXISTS "payment_mode";
  ALTER TABLE "products" DROP COLUMN IF EXISTS "cancellation_cutoff_hours";
  ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_payment_mode";
  ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_cancellation_cutoff_hours";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "stripe_payment_intent_ref";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "inbox_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "payment_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "email_delivery_log_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telegram_outbox_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "tg_links_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "blacklist_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "waitlist_entries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "booking_intents_id";
  ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "from_email";
  ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "confirmation_notice_hours";
  ALTER TABLE "shop_settings" DROP COLUMN IF EXISTS "default_locale";
  DROP TYPE IF EXISTS "public"."enum_email_delivery_log_kind";
  DROP TYPE IF EXISTS "public"."enum_email_delivery_log_status";
  DROP TYPE IF EXISTS "public"."enum_telegram_outbox_bot";
  DROP TYPE IF EXISTS "public"."enum_telegram_outbox_action_type";
  DROP TYPE IF EXISTS "public"."enum_telegram_outbox_status";
  DROP TYPE IF EXISTS "public"."enum_waitlist_entries_status";
  DROP TYPE IF EXISTS "public"."enum_booking_intents_status";
  DROP TYPE IF EXISTS "public"."enum_products_payment_mode";
  DROP TYPE IF EXISTS "public"."enum__products_v_version_payment_mode";
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_log_state";
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_task_slug";
  DROP TYPE IF EXISTS "public"."enum_shop_settings_default_locale";`)
}
