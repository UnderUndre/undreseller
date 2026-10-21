#!/bin/bash
##
## _setup-webhooks.sh
##
## Регистрирует веб-хуки обоих Telegram-ботов на локальном сервере.
##
## Требования:
## - PUBLIC_URL задана в окружении или в .env (полный URL вида https://example.com)
## - TELEGRAM_BOT_TOKEN задана в окружении или в .env (живой токен от BotFather)
## - STAFF_BOT_TOKEN задана в окружении или в .env (живой токен для служебного бота)
## - TELEGRAM_WEBHOOK_SECRET и STAFF_WEBHOOK_SECRET уже в .env (по умолчанию test_* значения)
##
## Использование:
##   PUBLIC_URL=https://myserver.com bash _setup-webhooks.sh
##   # или если .env заполнена:
##   bash _setup-webhooks.sh
##
## Вывод:
##   [OK]   Webhook registered for TELEGRAM_BOT_TOKEN
##   [OK]   Webhook registered for STAFF_BOT_TOKEN
##   [OK]   All webhooks are active
##

set -u  # только для неопределённых переменных, НЕ для ошибок команд

# Загрузить переменные из .env если они не заданы
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Проверить обязательные переменные
if [ -z "${PUBLIC_URL:-}" ]; then
  echo "[FAIL] PUBLIC_URL не задана"
  echo "       Примеры:"
  echo "         PUBLIC_URL=https://myserver.com bash _setup-webhooks.sh"
  echo "         PUBLIC_URL=https://12.34.56.78:8443 bash _setup-webhooks.sh"
  exit 1
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "[FAIL] TELEGRAM_BOT_TOKEN не задана. Получить у @BotFather: /mybots → бот → API Token"
  exit 1
fi

if [ -z "${STAFF_BOT_TOKEN:-}" ]; then
  echo "[FAIL] STAFF_BOT_TOKEN не задана. Создать второго бота у @BotFather"
  exit 1
fi

# Уже должны быть в .env, но на случай
TELEGRAM_WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-test_telegram_secret}"
STAFF_WEBHOOK_SECRET="${STAFF_WEBHOOK_SECRET:-test_staff_webhook_secret}"

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                   Setting up Telegram Webhooks                              ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "PUBLIC_URL: $PUBLIC_URL"
echo "Client Bot Token: ${TELEGRAM_BOT_TOKEN:0:10}..."
echo "Staff Bot Token:  ${STAFF_BOT_TOKEN:0:10}..."
echo ""

# Функция для регистрации вебхука
register_webhook() {
  local bot_token="$1"
  local endpoint="$2"
  local secret="$3"
  local bot_name="$4"

  local webhook_url="${PUBLIC_URL}${endpoint}"
  
  echo -n "[*]   Registering $bot_name webhook... "
  
  response=$(curl -s \
    "https://api.telegram.org/bot${bot_token}/setWebhook" \
    -d "url=${webhook_url}" \
    -d "secret_token=${secret}")
  
  ok=$(echo "$response" | grep -o '"ok":true')
  
  if [ -n "$ok" ]; then
    echo "[OK]"
    return 0
  else
    echo "[FAIL]"
    echo "       Response: $response"
    return 1
  fi
}

# Функция для проверки статуса вебхука
check_webhook_status() {
  local bot_token="$1"
  local bot_name="$2"
  
  echo -n "[*]   Checking $bot_name webhook status... "
  
  response=$(curl -s "https://api.telegram.org/bot${bot_token}/getWebhookInfo" 2>/dev/null || echo '{"ok":false}')
  
  # Проверяем, что это валидный JSON с ok:true
  ok=$(echo "$response" | grep -o '"ok":true' || true)
  
  if [ -z "$ok" ]; then
    echo "[FAIL]"
    echo "       Response: $response"
    return 1
  fi
  
  url=$(echo "$response" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"\([^"]*\)"/\1/' || true)
  has_custom_cert=$(echo "$response" | grep -o '"has_custom_certificate":true' || true)
  
  if [ -n "$url" ] && [ "$url" != "null" ]; then
    echo "[OK]"
    echo "       URL: $url"
    [ -n "$has_custom_cert" ] && echo "       Certificate: Custom"
    return 0
  fi
  
  echo "[INFO] No webhook registered yet"
  return 0
}

# Регистрируем оба вебхука
failed=0

if ! register_webhook "$TELEGRAM_BOT_TOKEN" "/api/bot/telegram/webhook" "$TELEGRAM_WEBHOOK_SECRET" "Client Bot"; then
  failed=1
fi

if ! register_webhook "$STAFF_BOT_TOKEN" "/api/bot/staff/webhook" "$STAFF_WEBHOOK_SECRET" "Staff Bot"; then
  failed=1
fi

echo ""
echo "Verifying webhook status:"
echo ""

check_webhook_status "$TELEGRAM_BOT_TOKEN" "Client Bot"
check_webhook_status "$STAFF_BOT_TOKEN" "Staff Bot"

echo ""

if [ $failed -eq 0 ]; then
  echo "╔════════════════════════════════════════════════════════════════════════════╗"
  echo "║                      ✓ Webhooks registered                                  ║"
  echo "╚════════════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Next steps:"
  echo "1. Make sure the server is running: npm run dev"
  echo "2. Run tests: bash run-all.sh"
  echo "3. Test live interaction in browser or via @userinfobot"
  echo ""
  exit 0
else
  echo "╔════════════════════════════════════════════════════════════════════════════╗"
  echo "║                      ✗ Webhook registration failed                          ║"
  echo "╚════════════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Troubleshooting:"
  echo "- Verify TELEGRAM_BOT_TOKEN and STAFF_BOT_TOKEN are correct (check @BotFather)"
  echo "- Verify PUBLIC_URL is accessible from the internet (test with: curl PUBLIC_URL)"
  echo "- Check firewall/NAT settings to ensure port is open"
  echo "- Verify .env has TELEGRAM_WEBHOOK_SECRET and STAFF_WEBHOOK_SECRET"
  echo ""
  exit 1
fi
