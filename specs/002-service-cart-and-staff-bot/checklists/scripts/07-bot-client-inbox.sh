#!/usr/bin/env bash
# TC-BOT-CLIENT-02: приём апдейта и идемпотентность по update_id.
# Первый запрос с правильным секретом -> 200 и строка InboxEvent (provider TELEGRAM,
# eventId = update_id, kind TELEGRAM_UPDATE). Повтор с тем же update_id ->
# 200 с телом "OK (duplicate)" и БЕЗ второй строки (уникальный ключ provider+eventId).
source "$(dirname "$0")/_lib.sh"

UPDATE_ID="${UPDATE_ID:-$((100000 + RANDOM))}"
BODY="$(cat <<JSON
{
  "update_id": $UPDATE_ID,
  "message": {
    "message_id": 1,
    "from": {"id": 555111, "first_name": "Alex", "username": "alex_client"},
    "chat": {"id": 555111, "type": "private"},
    "text": "/start"
  }
}
JSON
)"

echo "== Первый апдейт (update_id=$UPDATE_ID) =="
RESP="$(webhook_api "$TELEGRAM_WEBHOOK_SECRET" /api/bot/telegram/webhook "$BODY")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "первый апдейт"

COUNT="$(psql_q "SELECT count(*) FROM \"InboxEvent\" WHERE provider = 'TELEGRAM' AND \"eventId\" = '$UPDATE_ID';")"
[[ "$COUNT" == "1" ]] && echo "  [OK]   ровно одна строка InboxEvent" \
  || { echo "  [FAIL] строк InboxEvent: $COUNT" >&2; exit 1; }

echo "== Повтор того же update_id =="
RESP="$(webhook_api "$TELEGRAM_WEBHOOK_SECRET" /api/bot/telegram/webhook "$BODY")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "повторный апдейт"
printf '%s' "$RESP" | grep -q "duplicate" \
  && echo "  [OK]   ответ помечен как duplicate" \
  || { echo "  [FAIL] в теле нет пометки duplicate" >&2; exit 1; }

COUNT="$(psql_q "SELECT count(*) FROM \"InboxEvent\" WHERE provider = 'TELEGRAM' AND \"eventId\" = '$UPDATE_ID';")"
[[ "$COUNT" == "1" ]] && echo "  [OK]   вторая строка не создана" \
  || { echo "  [FAIL] строк InboxEvent: $COUNT" >&2; exit 1; }
