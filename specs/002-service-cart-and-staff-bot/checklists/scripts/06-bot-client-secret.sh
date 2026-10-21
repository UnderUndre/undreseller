#!/usr/bin/env bash
# TC-BOT-CLIENT-01 (FR-04): вебхук клиентского бота отвергает чужой секрет.
# Заголовок X-Telegram-Bot-Api-Secret-Token сверяется с TELEGRAM_WEBHOOK_SECRET из .env.
# Неверный секрет -> 403, и в InboxEvent ничего не пишется.
source "$(dirname "$0")/_lib.sh"

BEFORE="$(psql_q 'SELECT count(*) FROM "InboxEvent";')"

RESP="$(webhook_api "wrong_secret" /api/bot/telegram/webhook "$(cat <<'JSON'
{"update_id": 10001, "message": {"chat": {"id": 555111}, "text": "/start"}}
JSON
)")"
expect_status 403 "$(printf '%s' "$RESP" | http_status)" "вебхук с чужим секретом"

AFTER="$(psql_q 'SELECT count(*) FROM "InboxEvent";')"
[[ "$BEFORE" == "$AFTER" ]] && echo "  [OK]   InboxEvent не пополнился ($AFTER строк)" \
  || { echo "  [FAIL] InboxEvent вырос с $BEFORE до $AFTER" >&2; exit 1; }
