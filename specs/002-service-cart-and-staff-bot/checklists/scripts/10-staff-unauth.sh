#!/usr/bin/env bash
# TC-BOT-STAFF-02 (FR-007): кнопка в групповом чате от постороннего не срабатывает.
# authorizeStaffCallback пускает только тех, чей Telegram ID есть в
# ShopSettings.authorizedStaffUserIds (его выставляет 00-preflight.sh).
# Чужой from.id -> 403 ACCESS_DENIED, статус заказа не меняется.
source "$(dirname "$0")/_lib.sh"

ORDER_ID="$(need_state order_id)" # создаёт 03-web-checkout.sh
BEFORE="$(psql_q "SELECT \"confirmationStatus\" FROM \"Order\" WHERE id = '$ORDER_ID';")"

RESP="$(webhook_api "$STAFF_WEBHOOK_SECRET" /api/bot/staff/webhook "$(cat <<JSON
{
  "update_id": 20001,
  "callback_query": {
    "id": "cbq_unauth_$RANDOM",
    "from": {"id": 999999999, "first_name": "Intruder"},
    "message": {"message_id": 50, "chat": {"id": $STAFF_CHAT_ID, "type": "supergroup"}},
    "data": "staff:approve:$ORDER_ID"
  }
}
JSON
)")"
expect_status 403 "$(printf '%s' "$RESP" | http_status)" "колбэк от постороннего"
printf '%s' "$RESP" | grep -q '"status":"ACCESS_DENIED"' \
  && echo "  [OK]   status=ACCESS_DENIED" \
  || { echo "  [FAIL] структура ответа не та" >&2; exit 1; }

AFTER="$(psql_q "SELECT \"confirmationStatus\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
[[ "$BEFORE" == "$AFTER" ]] && echo "  [OK]   confirmationStatus не изменился ($AFTER)" \
  || { echo "  [FAIL] статус изменился: $BEFORE -> $AFTER" >&2; exit 1; }
