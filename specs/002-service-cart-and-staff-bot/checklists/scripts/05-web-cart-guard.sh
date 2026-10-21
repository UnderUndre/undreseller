#!/usr/bin/env bash
# TC-WEB-05 (FR-002a): сервер не верит клиенту.
# Дублирующийся itemIds и несуществующая услуга должны дать 400, а не бронь.
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
DAY="$(next_workday 6)"

echo "== Дублирующийся itemIds =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60", "$SERVICE_60"],
  "startTime": "${DAY}T14:00:00.000Z",
  "customerName": "Хакер",
  "customerPhone": "+79990000002"
}
JSON
)")"
expect_status 400 "$(printf '%s' "$RESP" | http_status)" "дубликаты itemIds"
# Код живёт в lib/booking/cart.ts: CartValidationError('DUPLICATE_CART_ITEM', ...)
printf '%s' "$RESP" | grep -q "DUPLICATE_CART_ITEM" \
  && echo "  [OK]   код ошибки DUPLICATE_CART_ITEM" \
  || { echo "  [FAIL] в ответе нет кода DUPLICATE_CART_ITEM" >&2; exit 1; }

echo "== Несуществующая услуга =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["00000000-0000-0000-0000-000000000000"],
  "startTime": "${DAY}T15:00:00.000Z",
  "customerName": "Хакер",
  "customerPhone": "+79990000003"
}
JSON
)")"
expect_status 400 "$(printf '%s' "$RESP" | http_status)" "несуществующий itemId"

COUNT="$(psql_q "SELECT count(*) FROM \"Order\" WHERE \"customerPhone\" IN ('+79990000002', '+79990000003');")"
[[ "$COUNT" == "0" ]] && echo "  [OK]   ни один из мусорных запросов заказ не создал" \
  || { echo "  [FAIL] в базе $COUNT заказов от тестовых телефонов" >&2; exit 1; }
