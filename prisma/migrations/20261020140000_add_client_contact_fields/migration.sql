-- Add client contact fields for staff copy-paste: Telegram username + WhatsApp/Telegram flags
ALTER TABLE "Order" ADD COLUMN "customerTgUsername" TEXT;
ALTER TABLE "Order" ADD COLUMN "hasWhatsApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "hasTelegram" BOOLEAN NOT NULL DEFAULT false;
