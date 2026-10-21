#!/usr/bin/env bash
# Скрипт для очистки БД и тестирования уведомлений staff-бота о бронировании

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

# 1. Очистить все заказы, резервации и исходящие сообщения
echo "=== CLEARING DATABASE ==="
echo "Clearing orders, reservations, and outbox messages..."

node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Clear in order of foreign keys
    await prisma.orderItem.deleteMany({});
    console.log('[OK] Cleared OrderItem');
    
    await prisma.slotReservation.deleteMany({});
    console.log('[OK] Cleared SlotReservation');
    
    await prisma.order.deleteMany({});
    console.log('[OK] Cleared Order');
    
    await prisma.telegramOutbox.deleteMany({});
    console.log('[OK] Cleared TelegramOutbox');
    
    await prisma.inboxEvent.deleteMany({});
    console.log('[OK] Cleared InboxEvent');
    
    process.exit(0);
  } catch (err) {
    console.error('Error clearing database:', err.message);
    process.exit(1);
  }
}

main();
"

echo ""
echo "=== TESTING STAFF NOTIFICATION ==="

# Get services
SERVICE_60="\$(need_state service_60_id)"
SERVICE_30="\$(need_state service_30_id)"
DAY="\$(next_workday 2)"

echo "Getting available slot for $DAY..."
SLOTS="\$(api GET "/api/booking/slots?itemIds=$SERVICE_60,$SERVICE_30&date=$DAY")"
START="\$(printf '%s' "\$SLOTS" | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const slots = JSON.parse(raw).slots || [];
    if (!slots.length) {
      console.error("No available slots found");
      process.exit(4);
    }
    process.stdout.write(slots[0].startTime);
  });
')"

echo "  Chosen slot: $START"

echo ""
echo "Creating booking with both services..."
RESP="\$(api POST /api/booking/lock "$(cat <<'JSON'
{
  "itemIds": ["SERVICE_60_PLACEHOLDER", "SERVICE_30_PLACEHOLDER"],
  "startTime": "START_PLACEHOLDER",
  "customerName": "Test User",
  "customerPhone": "+79991234567",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"

BODY="\$(printf '%s' "\$RESP" | sed '/__HTTP_STATUS__/d')"
ORDER_ID="\$(printf '%s' "\$BODY" | json_get order.id)"

echo "  [OK] Order created: $ORDER_ID"

echo ""
echo "=== CHECKING STAFF OUTBOX ==="

node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const messages = await prisma.telegramOutbox.findMany({
      where: { direction: 'OUTGOING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    if (messages.length === 0) {
      console.log('[FAIL] No outgoing messages found in TelegramOutbox');
      console.log('Expected: Staff order card should be in queue after booking creation');
      process.exit(1);
    }
    
    console.log(\`[OK] Found \${messages.length} outgoing message(s) in outbox:\`);
    messages.forEach((m, i) => {
      console.log(\`  Message \${i+1}:\`);
      console.log(\`    Chat ID: \${m.chatId}\`);
      console.log(\`    Status: \${m.status}\`);
      console.log(\`    Created: \${m.createdAt.toISOString()}\`);
      if (m.payload) {
        try {
          const payload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;
          if (payload.text) {
            console.log(\`    Text (first 100 chars): \${payload.text.substring(0, 100)}\`);
          }
        } catch (e) {
          // ignore
        }
      }
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error checking outbox:', err.message);
    process.exit(1);
  }
}

main();
"
