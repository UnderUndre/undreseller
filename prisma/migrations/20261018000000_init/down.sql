-- DOWN MIGRATION: 20261018000000_init
-- WARNING: This down migration drops objects created during initial setup.
-- Under Constitutional Principle X and spec §2.12, this file MUST NOT be run
-- against a production database that already holds live client orders.

DROP TABLE IF EXISTS "InboxEvent" CASCADE;
DROP TABLE IF EXISTS "KnowledgeChunk" CASCADE;
DROP TABLE IF EXISTS "EscalationTicket" CASCADE;
DROP TABLE IF EXISTS "MessengerContact" CASCADE;
DROP TABLE IF EXISTS "PaymentEvent" CASCADE;
DROP TABLE IF EXISTS "OrderItem" CASCADE;
DROP TABLE IF EXISTS "SlotReservation" CASCADE;
DROP TABLE IF EXISTS "Order" CASCADE;
DROP TABLE IF EXISTS "WeeklyHours" CASCADE;
DROP TABLE IF EXISTS "Item" CASCADE;
DROP TABLE IF EXISTS "ShopSettings" CASCADE;

DROP TYPE IF EXISTS "InboxEventKind" CASCADE;
DROP TYPE IF EXISTS "InboxStatus" CASCADE;
DROP TYPE IF EXISTS "MessengerPlatform" CASCADE;
DROP TYPE IF EXISTS "PaymentMethod" CASCADE;
DROP TYPE IF EXISTS "ReservationStatus" CASCADE;
DROP TYPE IF EXISTS "OrderStatus" CASCADE;
DROP TYPE IF EXISTS "ItemType" CASCADE;
