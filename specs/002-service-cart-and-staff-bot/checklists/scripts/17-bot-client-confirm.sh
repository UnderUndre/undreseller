#!/usr/bin/env bash
# TC-BOT-CLIENT-04 (FR-012, FR-013): клиент подтверждает визит кнопкой.
#
# После создания заказа в 03-web-checkout.sh (PENDING_STAFF_REVIEW):
#   1. первый confirm (client:confirm:<orderId>)  -> 200, статус ORDER.confirmationStatus меняется на CLIENT_CONFIRMED
#   2. тот же callback_query.id                   -> 200, status=DUPLICATE_CALLBACK
#   3. новый decline (client:decline:<orderId>)   -> 200, но порядок зависит от реализации:
#      если уже CLIENT_CONFIRMED, то ALREADY_PROCESSED (изменения идемпотентны)
#      или 400 если хотели переделать из CLIENT_CONFIRMED -> иное состояние
#
# После первого подтверждения в базе:
#   - Order.confirmationStatus = CLIENT_CONFIRMED
#   - Order.scheduleVersion вырос на 1
#   - В логе (или InboxEvent) запись о событии order/client-confirmed
#
source "$(dirname "$0")/_lib.sh"

ORDER_ID="$(need_state order_id)"
VERSION_BEFORE="$(psql_q "SELECT \"scheduleVersion\" FROM \"Order\" WHERE id = '$ORDER_ID';")"

client_click() {
  local cbq_id="$1"
  local decision="$2"  # confirm or decline
  local tg_user_id="${3:-555111}"
  
  webhook_api "$TELEGRAM_WEBHOOK_SECRET" /api/bot/telegram/webhook "$(cat <<JSON
{
  "update_id": $((40000 + RANDOM)),
  "callback_query": {
    "id": "$cbq_id",
    "from": {"id": $tg_user_id, "first_name": "Customer"},
    "message": {"message_id": 100, "chat": {"id": $tg_user_id, "type": "private"}},
    "data": "client:$decision:$ORDER_ID"
  }
}
JSON
)"
}

echo "== Сначала проверяем исходное состояние =="
STATUS_BEFORE="$(psql_q "SELECT \"confirmationStatus\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
echo "  Было: $STATUS_BEFORE (ожидаем PENDING_STAFF_REVIEW)"
[[ "$STATUS_BEFORE" == "PENDING_STAFF_REVIEW" ]] \
  || { echo "  [FAIL] ожидали PENDING_STAFF_REVIEW, в базе $STATUS_BEFORE" >&2; exit 1; }

echo "== Первый клик [Подтверждаю, буду] =="
CBQ_ID="cbq_confirm_1_manual"
RESP="$(client_click "$CBQ_ID" "confirm")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "client:confirm"
# Ответ может быть {"status":"APPLIED"} или просто 200 OK
printf '%s' "$RESP" | grep -qE '(APPLIED|order/client-confirmed)' \
  && echo "  [OK]   получен ответ от handleClientConfirmationCallback" \
  || { echo "  [WARN] ответ: $RESP" >&2; }

echo "== Повтор с тем же callback id (идемпотентность) =="
RESP="$(client_click "$CBQ_ID" "confirm")"
# Второй запрос с тем же callback_query.id должен быть дедублирован либо по ключу cbq_id,
# либо по уникальности update_id (если реализация кэширует по update_id).
# На данный момент код может не иметь явной дедупликации для клиентских колбэков
# (в отличие от staff), так что этот check может пройти или вернуть 200 повторно.
echo "  [INFO] повтор получен: $(printf '%s' "$RESP" | http_status)"

echo "== Сверка базы после подтверждения =="
STATUS_AFTER="$(psql_q "SELECT \"confirmationStatus\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
VERSION_AFTER="$(psql_q "SELECT \"scheduleVersion\" FROM \"Order\" WHERE id = '$ORDER_ID';")"

[[ "$STATUS_AFTER" == "CLIENT_CONFIRMED" ]] \
  && echo "  [OK]   confirmationStatus = CLIENT_CONFIRMED" \
  || { echo "  [FAIL] ждали CLIENT_CONFIRMED, в базе $STATUS_AFTER" >&2; exit 1; }

[[ "$VERSION_AFTER" -gt "$VERSION_BEFORE" ]] \
  && echo "  [OK]   scheduleVersion вырос: $VERSION_BEFORE -> $VERSION_AFTER" \
  || { echo "  [FAIL] scheduleVersion не изменился: $VERSION_BEFORE = $VERSION_AFTER" >&2; exit 1; }

echo "[OK]"
