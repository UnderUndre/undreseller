#!/usr/bin/env bash
# TC-WEB-03 (FR-006, FR-016): бронь с оплатой на месте и комментарием клиента.
#
# Дисклеймер «прайс фиксированный, торг запрещён» под полем комментария —
# это вёрстка, её смотрим глазами на /book. Здесь проверяем, что сервер
# сохранил всё как надо:
#   Order.paymentType            = PAY_ON_SITE
#   Order.confirmationStatus     = PENDING_STAFF_REVIEW
#   Order.autoCancelOnNoConfirmation = true   (у клиента ещё нет завершённых визитов)
#   Order.customerNotes          = текст комментария
#   SlotReservation.status       = HELD, resourceId = default_master, totalDurationMin = 90
#
# Сохраняет id заказа в .state/order_id — от него зависят скрипты 11–15.
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
SERVICE_30="$(need_state service_30_id)"
DAY="$(next_workday 4)"
START="${DAY}T10:00:00.000Z"
NOTES="Просьба сделать акцент на проверке GiST-индексов"

echo "== Бронь на $START, оплата на месте =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60", "$SERVICE_30"],
  "startTime": "$START",
  "customerName": "Иван Тестов",
  "customerPhone": "+7 999 111 22 33",
  "customerNotes": "$NOTES",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "POST /api/booking/lock"

BODY="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d')"
ORDER_ID="$(printf '%s' "$BODY" | json_get order.id)"
ORDER_NUMBER="$(printf '%s' "$BODY" | json_get order.orderNumber)"
printf '%s' "$ORDER_ID" > "$STATE_DIR/order_id"
echo "  заказ $ORDER_NUMBER ($ORDER_ID) -> .state/order_id"

echo "== Сверка полей в базе =="
ROW="$(psql_q "SELECT \"paymentType\" || '|' || \"confirmationStatus\" || '|' || \"autoCancelOnNoConfirmation\" || '|' || \"customerNotes\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
RES="$(psql_q "SELECT status || '|' || \"resourceId\" || '|' || \"totalDurationMin\" FROM \"SlotReservation\" WHERE \"orderId\" = '$ORDER_ID';")"

[[ "$ROW" == "PAY_ON_SITE|PENDING_STAFF_REVIEW|t|$NOTES" ]] \
  && echo "  [OK]   Order: $ROW" \
  || { echo "  [FAIL] Order: $ROW" >&2; exit 1; }
[[ "$RES" == "HELD|default_master|90" ]] \
  && echo "  [OK]   SlotReservation: $RES" \
  || { echo "  [FAIL] SlotReservation: $RES" >&2; exit 1; }
