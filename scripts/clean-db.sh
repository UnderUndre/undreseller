#!/bin/bash
# Clean database script - truncates all tables and resets sequences

set -e

echo "🔄 Cleaning database..."

# Read .env to get DATABASE_URL if not set
if [ -z "$DATABASE_URL" ]; then
  if [ -f ".env" ]; then
    export $(grep DATABASE_URL .env | xargs)
  fi
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set and .env not found"
  exit 1
fi

# Use Prisma to run raw SQL
npx prisma db execute --stdin << 'EOF'
-- Disable foreign key constraints temporarily
SET session_replication_role = 'replica';

-- Truncate all tables
TRUNCATE TABLE "Order" CASCADE;
TRUNCATE TABLE "OrderItem" CASCADE;
TRUNCATE TABLE "SlotReservation" CASCADE;
TRUNCATE TABLE "Item" CASCADE;
TRUNCATE TABLE "WeeklyHours" CASCADE;
TRUNCATE TABLE "ShopSettings" CASCADE;
TRUNCATE TABLE "MigrationBackfillCheckpoint" CASCADE;
TRUNCATE TABLE "MessengerContact" CASCADE;
TRUNCATE TABLE "TelegramOutbox" CASCADE;
TRUNCATE TABLE "TelegramInbox" CASCADE;
TRUNCATE TABLE "InboxEvent" CASCADE;
TRUNCATE TABLE "EventTask" CASCADE;

-- Re-enable foreign key constraints
SET session_replication_role = 'origin';

SELECT 'Database cleaned successfully' as status;
EOF

echo "✅ Database cleaned"
echo ""
echo "Next steps:"
echo "  1. Run: pnpm db:seed"
echo "  2. Restart server: pnpm dev"
