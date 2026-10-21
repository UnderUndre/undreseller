# 🧪 Running QA Tests

## Prerequisites

You need a terminal with bash support. On Windows, choose one:

### Option 1: Git Bash (Recommended for Windows)
```bash
# Right-click in Windows Explorer → "Git Bash Here"
# Or from Git Bash terminal:
cd C:\Users\Admin\Documents\Repos\UnderUndre\repos\undreseller-002-service-cart-and-staff-bot\undreseller
```

### Option 2: WSL (Windows Subsystem for Linux)
```bash
# Open WSL terminal
wsl
cd /mnt/c/Users/Admin/Documents/Repos/UnderUndre/repos/undreseller-002-service-cart-and-staff-bot/undreseller
```

### Option 3: macOS/Linux Terminal
```bash
cd ~/path/to/undreseller
```

## Quick Start (5 minutes)

### Terminal 1: Start Development Server
```bash
cd undreseller
npm run dev
# Server runs on http://localhost:3000
```

### Terminal 2: Run Preflight Setup (One-Time)
```bash
cd undreseller
bash specs/002-service-cart-and-staff-bot/checklists/scripts/00-preflight.sh
```

**This will:**
- Start PostgreSQL (if not already running)
- Apply database migrations
- Seed initial data
- Configure shop settings

### Terminal 2: Run All Tests
```bash
bash specs/002-service-cart-and-staff-bot/checklists/scripts/run-all.sh
```

**Output:**
- Each test prints ✓ or ✗ status
- Creates `.state/` directory with test data (order IDs, service IDs)
- Full test run takes ~30 seconds

## Running Individual Tests

```bash
# Web site tests
bash scripts/01-web-cart.sh          # Multi-service cart
bash scripts/02-web-slots.sh         # 30-min slot grid
bash scripts/03-web-checkout.sh      # Order creation

# Client bot tests
bash scripts/06-bot-client-secret.sh # Webhook auth
bash scripts/09-bot-client-initdata-valid.sh  # Needs TELEGRAM_BOT_TOKEN

# Staff bot tests
bash scripts/10-staff-unauth.sh      # Unauthorized guard
bash scripts/11-staff-approve.sh     # Approve booking
bash scripts/15-staff-card.sh        # Staff card formatting

# Payment
bash scripts/16-refund.sh            # Refund Stars (needs tokens)
```

## Environment Setup

### Default .env (Included)
Most variables have test defaults in `undreseller/.env`:

```bash
# From .env.example - already in place
ADMIN_TOKEN=test_admin_token_secret_1234567890
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/undreseller?schema=public
TELEGRAM_WEBHOOK_SECRET=test_telegram_secret
STAFF_WEBHOOK_SECRET=test_staff_webhook_secret
```

### For Live Telegram Bots (Optional)

Get real tokens from [@BotFather](https://t.me/BotFather):

```bash
# Edit undreseller/.env and add:
TELEGRAM_BOT_TOKEN=123456:YOUR_REAL_TOKEN_HERE
STAFF_BOT_TOKEN=654321:YOUR_STAFF_BOT_TOKEN_HERE
STAFF_CHAT_ID=-1009876543210  # Your Telegram group ID
```

Then restart dev server:
```bash
# Terminal 1: Kill npm run dev (Ctrl+C)
npm run dev  # Restart to load new .env
```

### For Webhook Testing (Optional)

If you want to register webhooks with real Telegram bot:

```bash
# Install tunnel (cloudflared or ngrok)
# Example with cloudflared:
cloudflared tunnel --url http://localhost:3000
# Output: https://random.trycloudflare.com

# In another terminal:
PUBLIC_URL=https://random.trycloudflare.com \
bash specs/002-service-cart-and-staff-bot/checklists/scripts/_setup-webhooks.sh
```

## Understanding Test Output

### Success Output
```bash
✓ TC-WEB-03: Create order
  Service: sovereign-architecture-audit ($350)
  Client: +1-555-0100
  Phone masked in DB: *** (last 4: 0100) ✓
  Order state: PENDING_CLIENT_CONFIRMATION ✓
  Stored order ID: 36e2b55a-...
```

### Failure Output
```bash
✗ TC-WEB-05: Duplicate item guard
  Expected: DUPLICATE_CART_ITEM error
  Got: Cart item added (no error)
  SQL check failed
  Continuing...
```

## Database State Management

Scripts automatically:
- Cache service IDs in `scripts/.state/serviceIds.json`
- Cache order IDs in `scripts/.state/order_id`
- Preserve state between test runs

To reset state:
```bash
rm -rf specs/002-service-cart-and-staff-bot/checklists/scripts/.state/
```

Then run `00-preflight.sh` again to generate fresh demo data.

## Debugging Tests

### See Detailed Output
```bash
# Print each command before running
bash -x scripts/03-web-checkout.sh

# Save output to file
bash scripts/03-web-checkout.sh 2>&1 | tee test-output.log
```

### Check Database Directly
```bash
# Connect to PostgreSQL
docker exec -it undreseller_db psql -U postgres -d undreseller

# Useful queries:
SELECT * FROM "Order" ORDER BY created_at DESC LIMIT 1;
SELECT * FROM "CartItem" WHERE "orderId" = 'YOUR_ORDER_ID';
SELECT * FROM "BookingConflict" LIMIT 5;
```

### Check Server Logs
Server logs appear in Terminal 1 where `npm run dev` is running.

Look for:
- `[bot:client]` — Client bot webhook events
- `[bot:staff]` — Staff bot webhook events
- `[order]` — Order state changes
- `[conflict]` — Booking conflict detection

## Test Dependencies

Some tests depend on earlier tests completing:

```
00-preflight.sh (one-time setup)
│
├─ 01-web-cart.sh
├─ 02-web-slots.sh
├─ 03-web-checkout.sh ← Creates order_id
│  ├─ 04-web-conflict.sh (same order)
│  ├─ 05-web-cart-guard.sh (new order)
│  ├─ 06-07-08-09 (all tests on same order)
│  ├─ 10-13 (all staff tests on same order)
│  └─ 17-bot-client-confirm.sh (same order)
│
├─ 14-staff-fulfill.sh (depends on 11)
├─ 12-staff-reschedule.sh (depends on 11)
│
└─ 15-staff-card.sh (independent)
└─ 16-refund.sh (independent)
```

**Important:** Tests 11, 12, 14 operate on the **same order** sequentially.

To re-test them, run script 03 again to generate a new order ID.

## Common Issues

### "npm: not found"
```
Error: npm: command not found
```
**Fix:** Use a terminal with bash/npm available (Git Bash, WSL, or Linux)

### "curl: (7) Failed to connect"
```
Error: curl: (7) Failed to connect to localhost port 3000: Connection refused
```
**Fix:** Ensure `npm run dev` is running in Terminal 1

### "P1013: The provided database string is invalid"
```
Error: P1013: The provided database string is invalid
```
**Fix:** Ensure Docker is running:
```bash
docker compose ps  # Check container status
docker compose up -d postgres  # Start if needed
```

### "TELEGRAM_BOT_TOKEN not set"
```
[SKIP] Script 09 requires TELEGRAM_BOT_TOKEN for HMAC validation
```
**Fix:** This is normal for API-only testing. To enable:
1. Get token from [@BotFather](https://t.me/BotFather)
2. Add to `undreseller/.env`
3. Restart `npm run dev`

## Full Test Suite Execution

Recommended workflow:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run setup
bash specs/002-service-cart-and-staff-bot/checklists/scripts/00-preflight.sh

# Terminal 2: Run all tests
bash specs/002-service-cart-and-staff-bot/checklists/scripts/run-all.sh

# Terminal 2: Check results
echo "Total tests: 18-20"
ls -la scripts/.state/test-results/
```

## What Gets Tested

### Web Site (5 tests)
- ✓ TC-WEB-01: Multi-service cart
- ✓ TC-WEB-02: 30-minute slot grid
- ✓ TC-WEB-03: Order creation
- ✓ TC-WEB-04: Booking conflict guard
- ✓ TC-WEB-05: Duplicate items in cart

### Client Bot (5 tests)
- ✓ TC-BOT-CLIENT-01: Webhook auth (X-Telegram-Bot-Api-Secret-Token)
- ✓ TC-BOT-CLIENT-02: Inbox event processing
- ✓ TC-BOT-CLIENT-03: initData validation (guard against tampering)
- ✓ TC-BOT-CLIENT-03b: Valid HMAC (with real token)
- ✓ TC-BOT-CLIENT-04: Client confirmation callback

### Staff Bot (6 tests)
- ✓ TC-BOT-STAFF-01: Staff card formatting
- ✓ TC-BOT-STAFF-02: Unauthorized user blocked
- ✓ TC-BOT-STAFF-03: Approve booking
- ✓ TC-BOT-STAFF-04: Reschedule booking
- ✓ TC-BOT-STAFF-05: Blacklist customer
- ✓ TC-BOT-STAFF-06: Mark booking completed

### Payment (1 test)
- ✓ TC-PAY-01: Refund Stars payment

**Total: 17 core tests + 2 optional live bot tests = up to 20 test cases**

## Manual Validation

After automated tests pass, check these manually in browser:

1. **Visual layout** → Open http://localhost:3000 in browser
2. **Booking flow** → Go through complete booking and payment
3. **Bot messages** → Check Telegram to see if messages appear
4. **Database** → Query PostgreSQL to verify data integrity

See `manual-qa.md` for detailed browser-based test cases.

---

**Ready?** Start with:
```bash
npm run dev              # Terminal 1
# Then in Terminal 2:
bash scripts/00-preflight.sh
bash scripts/run-all.sh
```
