# 🚀 QA Test Setup — Quick Start Guide

## 0. Prerequisites

- Docker & Docker Compose (for PostgreSQL)
- Node.js 18+ & npm
- Terminal with bash (via Git Bash, WSL, or Linux)
- Optional: live Telegram bot tokens from [@BotFather](https://t.me/BotFather)

## 1. One-Time Setup (Initial Database)

```bash
cd undreseller

# Terminal 1: Start the dev server (runs on port 3000)
npm run dev

# Terminal 2: Run preflight setup (Postgres, migrations, seeding)
bash specs/002-service-cart-and-staff-bot/checklists/scripts/00-preflight.sh
```

**What this does:**
- Starts PostgreSQL in Docker container
- Applies all Prisma migrations
- Seeds initial data (2 services, products, shop hours)
- Creates second service (Express Code Review, 30 min, $150)
- Configures staff bot settings

This step runs **once per machine**. If you re-run it, the database seeding is idempotent.

## 2. Running QA Tests

After preflight completes, run all tests:

```bash
bash specs/002-service-cart-and-staff-bot/checklists/scripts/run-all.sh
```

Or run individual tests:

```bash
# Web site tests
bash scripts/01-web-cart.sh          # TC-WEB-01: Multi-service cart
bash scripts/02-web-slots.sh         # TC-WEB-02: 30-min slot grid
bash scripts/03-web-checkout.sh      # TC-WEB-03: Order creation
bash scripts/04-web-conflict.sh      # TC-WEB-04: Booking conflict guard
bash scripts/05-web-cart-guard.sh    # TC-WEB-05: Duplicate items check

# Client bot tests
bash scripts/06-bot-client-secret.sh       # TC-BOT-CLIENT-01: Webhook auth
bash scripts/07-bot-client-inbox.sh        # TC-BOT-CLIENT-02: Inbox event
bash scripts/08-bot-client-initdata-guard.sh # TC-BOT-CLIENT-03: initData validation
bash scripts/09-bot-client-initdata-valid.sh # TC-BOT-CLIENT-03b: Valid HMAC (needs live token)
bash scripts/17-bot-client-confirm.sh      # TC-BOT-CLIENT-04: Client confirmation

# Staff bot tests
bash scripts/10-staff-unauth.sh       # TC-BOT-STAFF-02: Unauthorized user blocked
bash scripts/11-staff-approve.sh      # TC-BOT-STAFF-03: Approve booking
bash scripts/12-staff-reschedule.sh   # TC-BOT-STAFF-04: Reschedule booking
bash scripts/13-staff-blacklist.sh    # TC-BOT-STAFF-05: Blacklist customer
bash scripts/14-staff-fulfill.sh      # TC-BOT-STAFF-06: Mark as completed
bash scripts/15-staff-card.sh         # TC-BOT-STAFF-01: Staff card formatting

# Payment tests
bash scripts/16-refund.sh             # TC-PAY-01: Refund Stars payment
```

## 3. Environment Variables

All scripts read from `undreseller/.env`. Required variables:

| Variable | Default Value | Where to Get |
|----------|---------------|-------------|
| `ADMIN_TOKEN` | `test_admin_token_secret_1234567890` | Keep as-is for testing |
| `TELEGRAM_WEBHOOK_SECRET` | `test_telegram_secret` | Keep as-is for testing |
| `STAFF_WEBHOOK_SECRET` | `test_staff_webhook_secret` | Keep as-is for testing |
| `STAFF_CHAT_ID` | `-1001234567890` | Replace with real group ID for live testing |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-DEF...` | **Get from [@BotFather](https://t.me/BotFather)** (needed for script 09) |
| `STAFF_BOT_TOKEN` | `654321:STAFF-BOT-...` | **Get from [@BotFather](https://t.me/BotFather)** (needed for live messaging) |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/undreseller?schema=public` | Auto-detected from Docker |
| `DIRECT_URL` | `postgresql://postgres:postgres@localhost:5432/undreseller?schema=public` | Auto-detected from Docker |

**To override for a single run:**
```bash
STAFF_CHAT_ID=-1009876543210 bash scripts/10-staff-unauth.sh
```

## 4. Live Telegram Bot Testing (Optional)

To test with actual Telegram bots instead of mocked webhooks:

### Step 1: Register Webhooks

If your server has a public URL:

```bash
PUBLIC_URL=https://myserver.com bash scripts/_setup-webhooks.sh
```

If you need a tunnel for local development:

```bash
# Terminal 1: Start tunnel (example using cloudflared)
cloudflared tunnel --url http://localhost:3000
# Output: https://random.trycloudflare.com

# Terminal 2: Register webhooks
PUBLIC_URL=https://random.trycloudflare.com bash scripts/_setup-webhooks.sh
```

The script will:
- Register client bot webhook on `/api/bot/telegram/webhook`
- Register staff bot webhook on `/api/bot/staff/webhook`
- Verify both registrations succeeded
- Print clear ✓/✗ status

## 5. Understanding Test Dependencies

```
00-preflight.sh (setup)
├── 01-web-cart.sh
├── 02-web-slots.sh
├── 03-web-checkout.sh (creates order_id)
│   ├── 04-web-conflict.sh
│   ├── 05-web-cart-guard.sh
│   ├── 06-bot-client-secret.sh
│   ├── 07-bot-client-inbox.sh
│   ├── 08-bot-client-initdata-guard.sh
│   ├── 09-bot-client-initdata-valid.sh (live token)
│   ├── 17-bot-client-confirm.sh
│   ├── 10-staff-unauth.sh
│   ├── 11-staff-approve.sh (modifies order)
│   │   ├── 12-staff-reschedule.sh (depends on 11)
│   │   └── 14-staff-fulfill.sh (depends on 11)
│   ├── 13-staff-blacklist.sh (independent, own order)
│   └── 16-refund.sh (live token)
└── 15-staff-card.sh (no server needed)
```

**Important:** Scripts 11, 12, and 14 operate on **the same order**. After running the sequence 11→12→14, run script 03 again to generate a fresh order_id for re-testing.

## 6. What Each Test Checks

See `manual-qa.md` for detailed test case descriptions and manual browser validation steps. Each script header includes:
- **Цель** (Goal): Which features are tested
- **Что проверяет скрипт** (What the script verifies): Database assertions
- **Что смотрим глазами** (Manual browser checks): Visual validation needed

## 7. Troubleshooting

### Database connection failed
```
Error: P1013: The provided database string is invalid
```
**Fix:** Ensure Docker is running and check `.env` has valid DATABASE_URL

```bash
docker compose ps  # Check if undreseller_db container is running
```

### "Server not responding" (npm run dev not running)
```
curl: (7) Failed to connect to localhost port 3000
```
**Fix:** Start npm dev in separate terminal:
```bash
npm run dev
```

### Telegram webhook registration failed
```
[Error] Failed to register webhook...
```
**Fix:** Ensure:
- `PUBLIC_URL` is valid and publicly accessible
- `TELEGRAM_BOT_TOKEN` is a real token from [@BotFather](https://t.me/BotFather)
- Server responds to `curl https://YOUR_URL/healthz`

## 8. Debugging

Each script logs JSON responses. To see detailed output:

```bash
bash -x scripts/01-web-cart.sh  # Print each command before executing
bash scripts/01-web-cart.sh 2>&1 | tee test.log  # Save output to file
```

Database queries can be inspected by connecting to PostgreSQL:

```bash
docker exec -it undreseller_db psql -U postgres -d undreseller
```

## 9. What Happens Automatically

Scripts handle these details so you don't have to:

- **Service IDs**: Automatically fetched from `/api/catalog` and cached in `.state/`
- **Order IDs**: Written to `.state/order_id` after booking and read by subsequent tests
- **Telegram initData**: Generated with real HMAC-SHA256 (needs live `TELEGRAM_BOT_TOKEN`)
- **Slot availability**: Calculated based on actual shop hours and existing reservations
- **State cleanup**: `scripts/.state/` persists across test runs; run `rm -rf scripts/.state/` to reset

## 10. Next Steps

1. ✅ Preflight setup complete
2. ⏭️  Choose: Run all tests (`run-all.sh`) or focus on specific areas
3. ⏭️  Optional: Set up live Telegram bots with `_setup-webhooks.sh`
4. ⏭️  Check `manual-qa.md` for browser-based validation steps

---

**Questions?** Check `manual-qa.md` for detailed test case explanations, or inspect script source in `scripts/` folder.
