#!/usr/bin/env bash
# TC-BOT-STAFF-03 (FR-009): мастер принимает запись, повторные клики ничего не ломают.
#
# Три запроса подряд по заказу из 03-web-checkout.sh (PAY_ON_SITE, PENDING_STAFF_REVIEW):
#   1. первый approve            -> 200, status=APPLIED, событие order/staff-approved
#   2. тот же callback_query.id  -> 200, status=DUPLICATE_CALLBACK (ключ staff_cbq_<id>)
#   3. новый callback_query.id   -> 200, status=ALREADY_PROCESSED (заказ уже не PENDING_STAFF_REVIEW)
#
# В базе: SlotReservation.status = BOOKED, confirmationStatus = STAFF_APPROVED,
# scheduleVersion вырос на 1.
source "$(dirname "$0")/_lib.sh"

ORDER_ID="$(need_state order_id)"
VERSION_BEFORE="$(psql_q "SELECT \"scheduleVersion\" FROM \"Order\" WHERE id = '$ORDER_ID';")"

staff_click() {
  local cbq_id="$1"
  webhook_api "$STAFF_WEBHOOK_SECRET" /api/bot/staff/webhook "$(cat <<JSON
{
  "update_id": $((30000 + RANDOM)),
  "callback_query": {
    "id": "$cbq_id",
    "from": {"id": $AUTHORIZED_STAFF_USER_ID, "first_name": "Master"},
    "message": {"message_id": 50, "chat": {"id": $STAFF_CHAT_ID, "type": "supergroup"}},
    "data": "staff:approve:$ORDER_ID"
  }
}
JSON
)"
}

echo "== Первый клик [Принять] =="
# Фиксированный id: шаг 2 отправит его же и должен попасть в ключ staff_cbq_<id>.
CBQ_ID="cbq_approve_1_manual"
RESP="$(staff_click "$CBQ_ID")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "approve"
printf '%s' "$RESP" | grep -q '"status":"APPLIED"' \
  && echo "  [OK]   status=APPLIED" || { echo "  [FAIL] $RESP" >&2; exit 1; }
printf '%s' "$RESP" | grep -q 'order/staff-approved' \
  && echo "  [OK]   событие order/staff-approved" || { echo "  [FAIL] нет события" >&2; exit 1; }

echo "== Повтор с тем же callback id =="
RESP="$(staff_click "$CBQ_ID")"
printf '%s' "$RESP" | grep -q '"status":"DUPLICATE_CALLBACK"' \
  && echo "  [OK]   status=DUPLICATE_CALLBACK" || { echo "  [FAIL] $RESP" >&2; exit 1; }

echo "== Повтор с новым callback id =="
RESP="$(staff_click "cbq_approve_2_$RANDOM")"
printf '%s' "$RESP" | grep -q '"status":"ALREADY_PROCESSED"' \
  && echo "  [OK]   status=ALREADY_PROCESSED" || { echo "  [FAIL] $RESP" >&2; exit 1; }

echo "== Сверка базы =="
ROW="$(psql_q "SELECT o.\"confirmationStatus\" || '|' || r.status || '|' || o.\"scheduleVersion\" FROM \"Order\" o JOIN \"SlotReservation\" r ON r.\"orderId\" = o.id WHERE o.id = '$ORDER_ID';")"
EXPECTED="STAFF_APPROVED|BOOKED|$((VERSION_BEFORE + 1))"
[[ "$ROW" == "$EXPECTED" ]] && echo "  [OK]   $ROW" \
  || { echo "  [FAIL] ждали $EXPECTED, в базе $ROW" >&2; exit 1; }
